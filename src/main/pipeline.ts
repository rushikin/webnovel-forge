// ---------------------------------------------------------------------------
// Pipeline Orchestrator — handles the 5-phase story generation pipeline
// ---------------------------------------------------------------------------
// Implements the 5-phase pipeline:
//   Phase 1: BRAINSTORM  -> idea_notes.md
//   Phase 2: STRUCTURE   -> story_structure.md
//   Phase 3: WORLD & PLOT -> world_bible.md, plot_outline.md
//   Phase 4: CHARACTERS  -> characters.json
//   Phase 5: CHAPTERS   -> chapters/chNN.md
//
// Each phase's output becomes required input to the next phase and to Phase 5.
// The AI is never asked to "just write" — it always receives a context pack.
// ---------------------------------------------------------------------------

import * as path from 'path'
import * as fs from 'fs'

import { SYSTEM_PROMPTS, PHASE_TEMPERATURES } from './systemPrompts'
import {
  getGlobalBannedPhraseStrings,
  addGlobalBannedPhrases as addGlobalBannedPhrasesStore,
} from './bannedPhrases'
import { getAllLockedFacts, formatLockedFactsForPrompt } from './lockedFacts'
import { runContinuityCheck, getEditorModel } from './editorAgent'
import { passiveHumanizerWorker } from './narrativeHumanizer'
import { getFreeModelCascade } from './freeModels'

// Import data-model helpers with local aliases for use in this file
import {
  readProjectFile as dmReadProjectFile,
  saveProjectFile as dmSaveProjectFile,
  readOutline as dmReadOutline,
  readCharacters as dmReadCharacters,
  readBannedPhraseStrings as dmReadBannedPhraseStrings,
  addBannedPhrase as dmAddBannedPhrase,
  countChapters as dmCountChapters,
  saveChatHistory as dmSaveChatHistory,
  loadChatHistory as dmLoadChatHistory,
  type ChatMessage,
} from './dataModel'

// Re-export for modules that import from './pipeline' (main.ts, lockedFacts.ts, rollingSummary.ts, editorAgent.ts).
// The left side of `as` must match the EXACT export name from dataModel; we only alias for collisions with
// local declarations of `addBannedPhrase` and `updateRollingSummary` in this file.
export { readProjectFile, saveProjectFile } from './dataModel'
export { readOutline } from './dataModel'
export { readCharacters } from './dataModel'
export { readBannedPhraseStrings } from './dataModel'
export { countChapters } from './dataModel'
export { saveChatHistory } from './dataModel'
export { loadChatHistory } from './dataModel'
export type { ChatMessage } from './dataModel'

export type Phase = 'brainstorm' | 'structure' | 'world_plot' | 'characters' | 'chapters'

export interface PipelineConfig {
  apiKey: string
  model: string
  ollamaEnabled: boolean
  ollamaHost: string
  ollamaModel: string
  libraryPath: string
  defaultChapterWordCount: number
  nvidiaApiKey?: string
  nvidiaEnabled?: boolean
  preferredProvider?: 'nvidia' | 'openrouter' | 'ollama' | 'auto'
}

export interface PipelineContext {
  projectPath: string
  config: PipelineConfig
  chatHistory: ChatMessage[]
  chosenTemplate?: string
  characterHint?: string
  chapterNumber?: number
}

export interface PipelineResult {
  success: boolean
  content: string
  error?: string
  tokensUsed?: number
  phaseOutputSaved?: boolean
}

// ---------------------------------------------------------------------------
// Context Pack Builder — builds the grounding context for any phase
// ---------------------------------------------------------------------------

export function buildContextPack(projectPath: string, forPhase: Phase): string {
  const parts: string[] = []

  const ideaNotes = dmReadProjectFile(projectPath, 'idea_notes.md')
  const storyStructure = dmReadProjectFile(projectPath, 'story_structure.md')
  const worldBible = dmReadProjectFile(projectPath, 'world_bible.md')
  const rollingSummary = dmReadProjectFile(projectPath, 'rolling_summary.md')

  // Only include outputs from phases BEFORE the current one
  if (forPhase !== 'brainstorm' && ideaNotes) {
    parts.push(`=== IDEA NOTES ===\n${ideaNotes}`)
  }
  if (forPhase !== 'brainstorm' && forPhase !== 'structure' && storyStructure) {
    parts.push(`=== STORY STRUCTURE ===\n${storyStructure}`)
  }
  if (forPhase !== 'brainstorm' && forPhase !== 'structure' && forPhase !== 'world_plot' && worldBible) {
    parts.push(`=== WORLD BIBLE ===\n${worldBible}`)
  }

  // For chapter writing, include rolling summary
  if (forPhase === 'chapters' && rollingSummary) {
    parts.push(`=== STORY SO FAR (SUMMARY) ===\n${rollingSummary}`)
  }

  return parts.join('\n\n')
}

// Chapter context — includes locked facts so the writer prompt is grounded
export interface ChapterContextPack {
  beatSummary: string
  mustInclude: string[]
  characterSheets: string
  worldBibleExcerpt: string
  rollingSummary: string
  bannedPhrases: string[]
  lockedFactsPrompt: string
}

// Build the context pack specifically for Phase 5 chapter writing
export function buildChapterContextPack(
  projectPath: string,
  chapterNumber: number
): ChapterContextPack {
  // 1. Get the outline beat for this chapter (validated reader handles JSON or legacy markdown table)
  const beats = dmReadOutline(projectPath)
  let beatSummary = ''
  let mustInclude: string[] = []
  let charactersPresent: string[] = []

  const beat = beats.find((b) => b.chapter === chapterNumber)
  if (beat) {
    beatSummary = beat.beat_summary
    mustInclude = beat.must_include || []
    charactersPresent = beat.characters_present || []
  }

  // 2. Get character sheets for characters in this chapter
  const allCharacters = dmReadCharacters(projectPath)
  let characterSheets = ''
  if (allCharacters.length > 0) {
    const relevant = allCharacters.filter((c) =>
      charactersPresent.length === 0 || charactersPresent.includes(c.id) || charactersPresent.includes(c.name)
    )
    characterSheets = relevant
      .map((c) =>
        `--- ${c.name} (${c.role}) ---\n` +
        `Voice: ${c.voice_fingerprint}\n` +
        `Locked Facts: ${(c.locked_facts || []).join(', ')}\n` +
        `Current State: ${c.current_state}`
      )
      .join('\n\n')
  }

  // 3. Get relevant world bible excerpt
  const worldBible = dmReadProjectFile(projectPath, 'world_bible.md') || ''
  // For now, include the full world bible (could be trimmed to relevant parts)
  const worldBibleExcerpt = worldBible

  // 4. Get rolling summary
  const rollingSummary = dmReadProjectFile(projectPath, 'rolling_summary.md') || ''

  // 5. Get banned phrases (story's own + global)
  const local = dmReadBannedPhraseStrings(projectPath)
  const globalList = getGlobalBannedPhraseStrings()
  // Dedupe case-insensitively, local first
  const seen = new Set<string>()
  const bannedPhrases: string[] = []
  for (const p of [...local, ...globalList]) {
    const key = p.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      bannedPhrases.push(p)
    }
  }

  // 6. Get locked facts for characters in this chapter
  const lockedFacts = getAllLockedFacts(projectPath)
  const lockedFactsPrompt = formatLockedFactsForPrompt(lockedFacts)

  return {
    beatSummary,
    mustInclude,
    characterSheets,
    worldBibleExcerpt,
    rollingSummary,
    bannedPhrases,
    lockedFactsPrompt,
  }
}

// ---------------------------------------------------------------------------
// Banned Phrases management
// ---------------------------------------------------------------------------
// Stories are self-contained (ARCHITECTURE.md §5.0), so the story's own
// banned_phrases.json is the primary blocklist. The global store is an
// additional, user-wide list (their preference) that we merge on top.

export function getBannedPhrases(projectPath: string): string[] {
  const local = dmReadBannedPhraseStrings(projectPath)
  const globalList = getGlobalBannedPhraseStrings()
  // Dedupe case-insensitively, preserve order (local first)
  const seen = new Set<string>()
  const merged: string[] = []
  for (const p of [...local, ...globalList]) {
    const key = p.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(p)
    }
  }
  return merged
}

export function addBannedPhrase(projectPath: string, phrase: string, reason: string): void {
  // Write to the per-story blocklist (self-contained). Also mirror to the
  // global store so the user's preference carries across stories.
  dmAddBannedPhrase(projectPath, phrase, reason)
  addGlobalBannedPhrasesStore([{ phrase, reason }])
}

// ---------------------------------------------------------------------------
// Rolling Summary management (local append-only, no LLM compression here)
// ---------------------------------------------------------------------------

export function appendRollingSummary(projectPath: string, chapterNumber: number, summary: string): void {
  const existingSummary = dmReadProjectFile(projectPath, 'rolling_summary.md') || ''
  const updatedSummary = existingSummary
    ? `${existingSummary}\n\n--- Chapter ${chapterNumber} ---\n${summary}`
    : `--- Chapter ${chapterNumber} ---\n${summary}`

  dmSaveProjectFile(projectPath, 'rolling_summary.md', updatedSummary)
}

// ---------------------------------------------------------------------------
// Prompt Template Filling
// ---------------------------------------------------------------------------

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+(?:\.\w+)*)\}/g, (_match, key: string) => {
    return vars[key] !== undefined ? vars[key] : `{${key}}`
  })
}

function chatHistoryToString(messages: ChatMessage[]): string {
  return messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
}

// ---------------------------------------------------------------------------
// AI Call Helper — with Resilient Free Model Cascading & Auto Failover
// ---------------------------------------------------------------------------

async function callAi(
  config: PipelineConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  phase: string
): Promise<PipelineResult> {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  const candidateErrors: string[] = []

  // Provider 1: NVIDIA NIM Cascade (Top 70B Free Tier Models)
  const tryNvidia = async (): Promise<PipelineResult | null> => {
    const key = config.nvidiaApiKey || (config as any).nvidiaApiKey
    if (!key) return null

    // Strictly active verified models on NVIDIA NIM (200 OK)
    const nvidiaModels = [
      'meta/llama-3.2-11b-vision-instruct',
      'nvidia/nemotron-3.5-lightning-30b-a3b',
      'nvidia/nemotron-3-super-120b-a12b',
      'openai/gpt-oss-20b',
      'nvidia/nemotron-3-ultra-550b-a55b',
    ]

    for (let i = 0; i < nvidiaModels.length; i++) {
      const nvidiaModel = nvidiaModels[i]
      try {
        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model: nvidiaModel, messages, temperature, max_tokens: 4000 }),
        })

        if (!response.ok) {
          const errorText = await response.text().catch(() => '')
          console.warn(`[NVIDIA NIM Failover] Model '${nvidiaModel}' failed (HTTP ${response.status}: ${errorText}). Trying next best model...`)
          candidateErrors.push(`NVIDIA (${nvidiaModel}): HTTP ${response.status}`)
          continue
        }

        const data: any = await response.json()
        const content = (data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning || '').trim()
        if (content) {
          if (i > 0) {
            console.log(`[NVIDIA NIM Failover] Seamlessly recovered using secondary model: ${nvidiaModel}`)
          } else {
            console.log(`[AI Engine] Generated via primary NVIDIA NIM model: ${nvidiaModel}`)
          }
          return {
            success: true,
            content,
            tokensUsed: data.usage?.total_tokens || 0,
          }
        }
      } catch (err: any) {
        console.warn(`[NVIDIA NIM Failover] Network error on '${nvidiaModel}': ${err.message}`)
        candidateErrors.push(`NVIDIA (${nvidiaModel}): ${err.message}`)
      }
    }
    return null
  }

  // Provider 2: OpenRouter Cascade (Ranked Free Models)
  const tryOpenRouter = async (): Promise<PipelineResult | null> => {
    if (!config.apiKey) return null

    const modelCascade = getFreeModelCascade(config.model)

    for (let i = 0; i < modelCascade.length; i++) {
      const currentModel = modelCascade[i]
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://webnovelforge.app',
            'X-Title': 'WebNovel Forge',
          },
          body: JSON.stringify({ model: currentModel, messages, temperature, max_tokens: 4000 }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMsg = (errorData as any)?.error?.message || `HTTP ${response.status}`
          console.warn(`[OpenRouter Failover] Model '${currentModel}' failed (${errorMsg}). Trying next best model...`)
          candidateErrors.push(`${currentModel}: ${errorMsg}`)
          continue
        }

        const data = await response.json()
        const content = (data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning || '').trim()
        if (content) {
          if (i > 0) {
            console.log(`[OpenRouter Failover] Seamlessly recovered using secondary model: ${currentModel}`)
          } else {
            console.log(`[AI Engine] Generated via OpenRouter free model: ${currentModel}`)
          }
          return {
            success: true,
            content,
            tokensUsed: data.usage?.total_tokens || 0,
          }
        }
      } catch (err: any) {
        console.warn(`[OpenRouter Failover] Network error on '${currentModel}': ${err.message}`)
        candidateErrors.push(`${currentModel}: ${err.message}`)
      }
    }
    return null
  }

  // Provider 3: Local Ollama
  const tryOllama = async (): Promise<PipelineResult | null> => {
    if (!config.ollamaEnabled) return null
    try {
      const response = await fetch(`${config.ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.ollamaModel,
          messages,
          options: { temperature },
          stream: false,
        }),
      })
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`)
      const data = await response.json()
      return { success: true, content: data.message?.content || '', tokensUsed: 0 }
    } catch (err: any) {
      candidateErrors.push(`Ollama: ${err.message}`)
    }
    return null
  }

  // Order providers according to preferredProvider setting
  const preference = config.preferredProvider || 'auto'
  let providerChain: Array<() => Promise<PipelineResult | null>> = []

  if (preference === 'nvidia') {
    providerChain = [tryNvidia, tryOpenRouter, tryOllama]
  } else if (preference === 'openrouter') {
    providerChain = [tryOpenRouter, tryNvidia, tryOllama]
  } else if (preference === 'ollama') {
    providerChain = [tryOllama, tryNvidia, tryOpenRouter]
  } else {
    // Auto mode: If NVIDIA is configured, test NVIDIA NIM first for high speed and 70B free tier, else OpenRouter
    const hasNvidia = Boolean(config.nvidiaApiKey || (config as any).nvidiaApiKey)
    if (hasNvidia) {
      providerChain = [tryNvidia, tryOpenRouter, tryOllama]
    } else {
      providerChain = [tryOpenRouter, tryNvidia, tryOllama]
    }
  }

  for (const executeProvider of providerChain) {
    const res = await executeProvider()
    if (res && res.success) {
      return res
    }
  }

  return {
    success: false,
    content: '',
    error: candidateErrors.length > 0
      ? `All candidate models failed:\n${candidateErrors.slice(-3).join('\n')}`
      : 'No AI provider configured. Please provide an OpenRouter or NVIDIA API key in Settings.',
  }
}

// ---------------------------------------------------------------------------
// Phase Implementations
// ---------------------------------------------------------------------------

// Phase 0: Clarifying Questions (runs first in every phase)
export async function runClarifyingQuestions(ctx: PipelineContext): Promise<PipelineResult> {
  const contextPack = buildContextPack(ctx.projectPath, getPhaseFromChat(ctx.chatHistory))
  const prompt = fillTemplate(SYSTEM_PROMPTS.clarifyingQuestions, {
    context_pack: contextPack || '(no previous phase outputs yet)',
    chat_history: chatHistoryToString(ctx.chatHistory),
  })

  const userPrompt =
    ctx.chatHistory.length > 0
      ? ctx.chatHistory[ctx.chatHistory.length - 1].content
      : 'I want to start working on my story.'

  return callAi(ctx.config, prompt, userPrompt, PHASE_TEMPERATURES.clarifyingQuestions, 'clarifying')
}

// Map chat history phase to Phase type
function getPhaseFromChat(_messages: ChatMessage[]): Phase {
  // This is determined by the caller; default to brainstorm
  return 'brainstorm'
}

// Phase 1: Brainstorm -> idea_notes.md
export async function runBrainstormPhase(ctx: PipelineContext): Promise<PipelineResult> {
  const prompt = fillTemplate(SYSTEM_PROMPTS.brainstorm, {
    chat_history: chatHistoryToString(ctx.chatHistory),
  })

  const userPrompt =
    ctx.chatHistory.length > 0
      ? ctx.chatHistory[ctx.chatHistory.length - 1].content
      : 'I want to brainstorm a new web novel concept.'

  const result = await callAi(ctx.config, prompt, userPrompt, PHASE_TEMPERATURES.brainstorm, 'brainstorm')

  if (result.success && result.content) {
    dmSaveProjectFile(ctx.projectPath, 'idea_notes.md', result.content)
    dmSaveChatHistory(ctx.projectPath, 'brainstorm', [
      ...ctx.chatHistory,
      { role: 'assistant', content: result.content },
    ])
    result.phaseOutputSaved = true
  }

  return result
}

// Phase 2: Structure -> story_structure.md
export async function runStructurePhase(ctx: PipelineContext): Promise<PipelineResult> {
  const ideaNotes = dmReadProjectFile(ctx.projectPath, 'idea_notes.md') || ''
  const template = ctx.chosenTemplate || '3-act'

  const prompt = fillTemplate(SYSTEM_PROMPTS.structure, {
    'idea_notes.content': ideaNotes,
    chosen_template: template,
    chat_history: chatHistoryToString(ctx.chatHistory),
  })

  const userPrompt =
    ctx.chatHistory.length > 0
      ? ctx.chatHistory[ctx.chatHistory.length - 1].content
      : 'Please create the story structure based on the brainstorm notes.'

  const result = await callAi(ctx.config, prompt, userPrompt, PHASE_TEMPERATURES.structure, 'structure')

  if (result.success && result.content) {
    dmSaveProjectFile(ctx.projectPath, 'story_structure.md', result.content)
    dmSaveChatHistory(ctx.projectPath, 'structure', [
      ...ctx.chatHistory,
      { role: 'assistant', content: result.content },
    ])
    result.phaseOutputSaved = true
  }

  return result
}

// Phase 3a: World Building -> world_bible.md
export async function runWorldBuildingPhase(ctx: PipelineContext): Promise<PipelineResult> {
  const ideaNotes = dmReadProjectFile(ctx.projectPath, 'idea_notes.md') || ''
  const storyStructure = dmReadProjectFile(ctx.projectPath, 'story_structure.md') || ''

  const prompt = fillTemplate(SYSTEM_PROMPTS.worldBuilding, {
    'idea_notes.content': ideaNotes,
    'story_structure.content': storyStructure,
    chat_history: chatHistoryToString(ctx.chatHistory),
  })

  const userPrompt =
    ctx.chatHistory.length > 0
      ? ctx.chatHistory[ctx.chatHistory.length - 1].content
      : 'Please create the world bible based on the story concept and structure.'

  const result = await callAi(ctx.config, prompt, userPrompt, PHASE_TEMPERATURES.worldBuilding, 'world_plot')

  if (result.success && result.content) {
    dmSaveProjectFile(ctx.projectPath, 'world_bible.md', result.content)
    dmSaveChatHistory(ctx.projectPath, 'world_plot', [
      ...ctx.chatHistory,
      { role: 'assistant', content: result.content },
    ])
    result.phaseOutputSaved = true
  }

  return result
}

// Phase 3b: Plot Outline -> plot_outline.md
export async function runPlotOutlinePhase(ctx: PipelineContext): Promise<PipelineResult> {
  const ideaNotes = dmReadProjectFile(ctx.projectPath, 'idea_notes.md') || ''
  const storyStructure = dmReadProjectFile(ctx.projectPath, 'story_structure.md') || ''
  const worldBible = dmReadProjectFile(ctx.projectPath, 'world_bible.md') || ''

  const prompt = fillTemplate(SYSTEM_PROMPTS.plotOutline, {
    'idea_notes.content': ideaNotes,
    'story_structure.content': storyStructure,
    'world_bible.content': worldBible,
    chat_history: chatHistoryToString(ctx.chatHistory),
  })

  const userPrompt =
    ctx.chatHistory.length > 0
      ? ctx.chatHistory[ctx.chatHistory.length - 1].content
      : 'Please create a chapter-by-chapter plot outline (first batch of 20 chapters).'

  const result = await callAi(ctx.config, prompt, userPrompt, PHASE_TEMPERATURES.plotOutline, 'world_plot')

  if (result.success && result.content) {
    // Try to extract JSON array from the response
    try {
      let jsonContent = result.content
      const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        jsonContent = jsonMatch[1]
      }
      // Validate it's valid JSON
      JSON.parse(jsonContent)
      dmSaveProjectFile(ctx.projectPath, 'plot_outline.md', jsonContent)
    } catch {
      // If not valid JSON, save as-is
      dmSaveProjectFile(ctx.projectPath, 'plot_outline.md', result.content)
    }
    dmSaveChatHistory(ctx.projectPath, 'world_plot', [
      ...ctx.chatHistory,
      { role: 'assistant', content: result.content },
    ])
    result.phaseOutputSaved = true
  }

  return result
}

// Phase 4: Characters -> characters.json
export async function runCharacterPhase(ctx: PipelineContext): Promise<PipelineResult> {
  const ideaNotes = dmReadProjectFile(ctx.projectPath, 'idea_notes.md') || ''
  const worldBible = dmReadProjectFile(ctx.projectPath, 'world_bible.md') || ''
  const plotOutline = dmReadProjectFile(ctx.projectPath, 'plot_outline.md') || ''

  // Find beats mentioning this character (if characterHint provided)
  let relevantBeats = ''
  if (ctx.characterHint && plotOutline) {
    try {
      const beats = JSON.parse(plotOutline) as Array<{
        chapter: number
        beat_summary: string
        characters_present: string[]
      }>
      const matching = beats.filter(
        (b) =>
          b.beat_summary.toLowerCase().includes(ctx.characterHint!.toLowerCase()) ||
          (b.characters_present || []).some((c) => c.toLowerCase().includes(ctx.characterHint!.toLowerCase()))
      )
      relevantBeats = matching.map((b) => `Ch${b.chapter}: ${b.beat_summary}`).join('\n')
    } catch {}
  }

  const prompt = fillTemplate(SYSTEM_PROMPTS.character, {
    'name/role hint': ctx.characterHint || 'the protagonist',
    'idea_notes.content': ideaNotes,
    'world_bible.content': worldBible,
    'beats mentioning this character': relevantBeats || '(no specific beats yet)',
    chat_history: chatHistoryToString(ctx.chatHistory),
  })

  const userPrompt =
    ctx.chatHistory.length > 0
      ? ctx.chatHistory[ctx.chatHistory.length - 1].content
      : `Please create a character sheet for ${ctx.characterHint || 'the protagonist'}.`

  const result = await callAi(ctx.config, prompt, userPrompt, PHASE_TEMPERATURES.character, 'characters')

  if (result.success && result.content) {
    // Try to extract and validate JSON
    try {
      let jsonContent = result.content
      const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        jsonContent = jsonMatch[1]
      }
      const charSheet = JSON.parse(jsonContent)

      // Add an ID if missing
      if (!charSheet.id) {
        charSheet.id = `char_${Date.now()}`
      }

      // Append to existing characters.json
      const existingChars = dmReadProjectFile(ctx.projectPath, 'characters.json')
      let charArray: any[] = []
      if (existingChars) {
        try {
          charArray = JSON.parse(existingChars)
        } catch {}
      }
      charArray.push(charSheet)
      dmSaveProjectFile(ctx.projectPath, 'characters.json', JSON.stringify(charArray, null, 2))
    } catch {
      // If not valid JSON, save raw content
      dmSaveProjectFile(ctx.projectPath, 'characters_last_response.txt', result.content)
    }
    dmSaveChatHistory(ctx.projectPath, 'characters', [
      ...ctx.chatHistory,
      { role: 'assistant', content: result.content },
    ])
    result.phaseOutputSaved = true
  }

  return result
}

// Phase 5: Chapter Writing -> chapters/chNN.md
export async function runChapterWritingPhase(ctx: PipelineContext): Promise<PipelineResult> {
  const chapterNumber = ctx.chapterNumber || 1
  const targetWordCount = ctx.config.defaultChapterWordCount || 2500

  // Build the context pack for this chapter
  const pack = buildChapterContextPack(ctx.projectPath, chapterNumber)

  const prompt = fillTemplate(SYSTEM_PROMPTS.writer, {
    N: String(chapterNumber),
    beat_summary: pack.beatSummary || '(no specific beat defined)',
    must_include: pack.mustInclude.join('; ') || '(none)',
    'relevant character sheets': pack.characterSheets || '(no character sheets available)',
    'world bible excerpt': pack.worldBibleExcerpt || '(no world bible available)',
    'rolling_summary.content': pack.rollingSummary || '(no previous chapters)',
    banned_phrases: pack.bannedPhrases.join(', ') || '(none)',
    target_word_count: String(targetWordCount),
  })

  const userPrompt = `Write Chapter ${chapterNumber} now.`

  const result = await callAi(ctx.config, prompt, userPrompt, PHASE_TEMPERATURES.writer, 'chapters')

  if (result.success && result.content) {
    // PASSIVE AUTOMATED NARRATIVE HUMANIZER MIDDLEWARE
    // Intercepts raw LLM prose, scans footprints, optimizes burstiness, and de-slops
    try {
      const humanizerRes = await passiveHumanizerWorker(
        result.content,
        {
          apiKey: ctx.config.apiKey,
          nvidiaApiKey: ctx.config.nvidiaApiKey,
          ollama: {
            enabled: ctx.config.ollamaEnabled,
            host: ctx.config.ollamaHost,
            model: ctx.config.ollamaModel,
          },
          model: ctx.config.model,
        },
        pack.characterSheets
      )
      if (humanizerRes.success && humanizerRes.humanizedText) {
        result.content = humanizerRes.humanizedText
      }
    } catch (hErr) {
      console.warn('Passive narrative humanizer middleware warning:', hErr)
    }

    // Save humanized narrative prose to chapters/chNN.md
    const paddedNum = String(chapterNumber).padStart(2, '0')
    dmSaveProjectFile(ctx.projectPath, `chapters/ch${paddedNum}.md`, result.content)
    result.phaseOutputSaved = true
  }

  return result
}

// Phase 5b: Continuity Editor — audits the chapter draft
export async function runContinuityEditorPhase(
  ctx: PipelineContext,
  chapterContent: string
): Promise<{ success: boolean; issues: string; summary: string; error?: string }> {
  const chapterNumber = ctx.chapterNumber || 1
  const pack = buildChapterContextPack(ctx.projectPath, chapterNumber)

  const prompt = fillTemplate(SYSTEM_PROMPTS.editor, {
    'chapters.content': chapterContent,
    'beat_summary + must_include': `${pack.beatSummary}\nMust include: ${pack.mustInclude.join('; ')}`,
    'relevant character sheets': pack.characterSheets || '(no character sheets)',
    'relevant excerpt': pack.worldBibleExcerpt || '(no world bible)',
  })

  const userPrompt = 'Please review this chapter draft for continuity issues.'

  const result = await callAi(ctx.config, prompt, userPrompt, PHASE_TEMPERATURES.editor, 'editor')

  if (result.success && result.content) {
    const content = result.content

    // Parse issues from bullet list
    const issues = content
      .split('\n')
      .filter((line: string) => line.trim().startsWith('-') || line.trim().startsWith('•') || line.trim().startsWith('*'))
      .map((line: string) => line.replace(/^[-•*]\s*/, '').trim())
      .filter((line: string) => line.length > 10)

    // Extract summary (usually at the end after "Summary:" or similar)
    let summary = ''
    const summaryMatch = content.match(/(?:summary|Summary|SUMMARY)[:]\s*\n?([\s\S]*?)$/m)
    if (summaryMatch) {
      summary = summaryMatch[1].trim()
    } else {
      // Fall back to last 2-4 sentences
      const sentences = content.split('. ').filter((s: string) => s.trim().length > 20)
      summary = sentences.slice(-3).join('. ')
    }

    // Extract overused phrases and add them to banned phrases
    const phraseMatches = content.matchAll(/[""]([^""]{5,50})[""](?:[^.]*?)(?:overused|repeated|banned|clich)/gi)
    for (const match of phraseMatches) {
      dmAddBannedPhrase(ctx.projectPath, match[1].trim(), 'Flagged by continuity editor')
    }

    // Update rolling summary if we got one
    if (summary) {
      appendRollingSummary(ctx.projectPath, chapterNumber, summary)
    }

    return {
      success: true,
      issues: content,
      summary,
    }
  }

  return {
    success: false,
    issues: '',
    summary: '',
    error: result.error,
  }
}

// ---------------------------------------------------------------------------
// Full Chapter Loop — Writer -> Editor -> save
// ---------------------------------------------------------------------------

export async function runChapterLoop(ctx: PipelineContext): Promise<{
  chapter: PipelineResult
  editor: { success: boolean; issues: string[]; bannedPhrasesFound: Array<{ phrase: string; count: number }>; summary: string; rawResponse: string; error?: string }
}> {
  // Step 1: Writer generates the chapter
  const chapterResult = await runChapterWritingPhase(ctx)

  if (!chapterResult.success) {
    return {
      chapter: chapterResult,
      editor: { success: false, issues: [], bannedPhrasesFound: [], summary: '', rawResponse: '', error: 'Chapter generation failed' },
    }
  }

  // Step 2: Editor audits the chapter using the user-selected free model
  const chapterNumber = ctx.chapterNumber || 1
  const editorModel = getEditorModel()
  const editorResult = await runContinuityCheck(
    ctx.config.apiKey,
    ctx.projectPath,
    chapterNumber,
    chapterResult.content,
    editorModel || undefined
  )

  // Step 3: Save editor notes alongside the chapter
  if (editorResult.success && editorResult.issues.length > 0) {
    const paddedNum = String(chapterNumber).padStart(2, '0')
    dmSaveProjectFile(ctx.projectPath, `chapters/ch${paddedNum}_notes.md`, editorResult.issues.join('\n'))
  }

  // Step 4: Update rolling summary if editor provided one
  if (editorResult.success && editorResult.summary) {
    // Use the async version with LLM compression from rollingSummary module
    const { updateRollingSummary: updateRollingSummaryLLM } = await import('./rollingSummary.js')
    await updateRollingSummaryLLM(ctx.config.apiKey, ctx.projectPath, chapterNumber, editorResult.summary)
  }

  return { chapter: chapterResult, editor: editorResult }
}

// ---------------------------------------------------------------------------
// Pipeline Orchestration — get phase status for a project
// ---------------------------------------------------------------------------

export function getPhaseStatus(projectPath: string): Record<Phase, boolean> {
  return {
    brainstorm: dmReadProjectFile(projectPath, 'idea_notes.md') !== null,
    structure: dmReadProjectFile(projectPath, 'story_structure.md') !== null,
    world_plot:
      dmReadProjectFile(projectPath, 'world_bible.md') !== null &&
      dmReadProjectFile(projectPath, 'plot_outline.md') !== null,
    characters: dmReadProjectFile(projectPath, 'characters.json') !== null,
    chapters: dmCountChapters(projectPath) > 0,
  }
}

export function getCompletedPhases(projectPath: string): Phase[] {
  const status = getPhaseStatus(projectPath)
  const order: Phase[] = ['brainstorm', 'structure', 'world_plot', 'characters', 'chapters']
  return order.filter((p) => status[p])
}

export function getCurrentPhase(projectPath: string): Phase {
  const completed = getCompletedPhases(projectPath)
  const order: Phase[] = ['brainstorm', 'structure', 'world_plot', 'characters', 'chapters']
  for (const phase of order) {
    if (!completed.includes(phase)) return phase
  }
  return 'chapters'
}

export function getChapterCount(projectPath: string): number {
  return dmCountChapters(projectPath)
}