// ---------------------------------------------------------------------------
// Editor Agent — runs the Continuity Auditor (second AI pass)
// ---------------------------------------------------------------------------
// After a chapter draft is generated, this module sends it through a
// separate, deterministic AI call that checks for:
//   • Contradictions with locked facts
//   • Deviations from the outline beat
//   • Out-of-character dialogue
//   • Broken world rules
//   • Overused / banned phrases
//
// The model used is the user-selected free model from OpenRouter.
// ---------------------------------------------------------------------------

import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { SYSTEM_PROMPTS, PHASE_TEMPERATURES } from './systemPrompts'
import { buildChapterContextPack } from './pipeline'
import { getAllLockedFacts, formatLockedFactsForPrompt } from './lockedFacts'
import { detectBannedPhrases, addGlobalBannedPhrases } from './bannedPhrases'
import { getFreeModelCascade } from './freeModels'

export interface EditorResult {
  success: boolean
  issues: string[]
  bannedPhrasesFound: Array<{ phrase: string; count: number }>
  summary: string
  rawResponse: string
  error?: string
}

// Settings path for the editor model
function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'editor_settings.json')
}

export function getEditorModel(): string {
  try {
    const settingsPath = getSettingsPath()
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      return data.editorModel || ''
    }
  } catch {}
  return ''
}

export function setEditorModel(modelId: string): void {
  const settingsPath = getSettingsPath()
  const dir = path.dirname(settingsPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  let settings: any = {}
  try {
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    }
  } catch {}
  settings.editorModel = modelId
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

/**
 * Run the Continuity Auditor on a chapter draft.
 * 1. Calls the AI with the editor system prompt.
 * 2. Runs local banned-phrase detection.
 * 3. Returns structured results.
 */
export async function runContinuityCheck(
  apiKey: string,
  projectPath: string,
  chapterNumber: number,
  draftContent: string,
  modelId?: string
): Promise<EditorResult> {
  const model = modelId || getEditorModel()
  if (!model) {
    return {
      success: false,
      issues: [],
      bannedPhrasesFound: [],
      summary: '',
      rawResponse: '',
      error: 'No editor model selected. Go to Settings → Editor Model to choose a free model.',
    }
  }

  // --- Local banned-phrase scan (no AI needed) ---
  const bannedPhrasesFound = detectBannedPhrases(draftContent)

  // --- Build context for the AI editor ---
  const pack = buildChapterContextPack(projectPath, chapterNumber)
  const lockedFacts = getAllLockedFacts(projectPath)
  const lockedFactsPrompt = formatLockedFactsForPrompt(lockedFacts)

  const editorSystemPrompt = `${SYSTEM_PROMPTS.editor}

LOCKED FACTS (MUST NOT be contradicted):
${lockedFactsPrompt}

BANNED PHRASES DETECTED IN DRAFT (flag these explicitly):
${bannedPhrasesFound.map(b => `"${b.phrase}" (${b.count}x)`).join(', ') || '(none detected)'}
`

  // Fill the template variables
  const filledPrompt = editorSystemPrompt
    .replace('{chapters.content}', draftContent)
    .replace('{beat_summary + must_include}', `${pack.beatSummary}\nMust include: ${pack.mustInclude.join('; ')}`)
    .replace('{relevant character sheets}', pack.characterSheets || '(no character sheets)')
    .replace('{relevant excerpt}', pack.worldBibleExcerpt || '(no world bible)')

  const userPrompt = 'Please review this chapter draft for continuity issues, locked-fact violations, and banned-phrase usage.'

  try {
    let rawResponse = ''
    const modelCascade = getFreeModelCascade(model)
    let lastError = ''

    for (let i = 0; i < modelCascade.length; i++) {
    const candidateModel = modelCascade[i]
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://webnovelforge.app',
          'X-Title': 'WebNovel Forge',
        },
        body: JSON.stringify({
          model: candidateModel,
          messages: [
            { role: 'system', content: filledPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: PHASE_TEMPERATURES.editor,
          max_tokens: 2000,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const msg = (errorData as any).error?.message || `HTTP ${response.status}`
        lastError = msg
        console.warn(`[Editor Failover] Model ${candidateModel} failed: ${msg}. Cascading to next free model...`)
        continue
      }

      const data: any = await response.json()
      rawResponse = data.choices?.[0]?.message?.content || ''
      if (rawResponse.trim()) {
        if (i > 0) {
          console.log(`[Editor Failover] Successfully reviewed chapter via fallback free model: ${candidateModel}`)
        }
        break
      }
    } catch (netErr: any) {
      lastError = netErr.message
      console.warn(`[Editor Failover] Network error on ${candidateModel}: ${lastError}`)
    }
  }

  if (!rawResponse.trim()) {
    return {
      success: false,
      issues: [],
      bannedPhrasesFound,
      summary: '',
      rawResponse: '',
      error: `Continuity check failed across candidate models: ${lastError}`,
    }
  }

    // Parse issues from bullet list
    const issues = rawResponse
      .split('\n')
      .filter((line: string) => line.trim().startsWith('-') || line.trim().startsWith('•') || line.trim().startsWith('*'))
      .map((line: string) => line.replace(/^[-•*]\s*/, '').trim())
      .filter((line: string) => line.length > 10)

    // Extract summary (last paragraph or after "Summary:" heading)
    let summary = ''
    const summaryMatch = rawResponse.match(/(?:summary|Summary|SUMMARY)[:\s]*\n?([\s\S]*?)$/m)
    if (summaryMatch) {
      summary = summaryMatch[1].trim()
    } else {
      // Fall back to last meaningful paragraph
      const paragraphs = rawResponse.split('\n\n').filter((p: string) => p.trim().length > 30)
      summary = paragraphs[paragraphs.length - 1] || ''
    }

    // Auto-detect new overused phrases from the editor response
    const newPhrasesMatches = rawResponse.matchAll(/[""\"]([^"\"]{5,50})[""\"](?:[^.]*?)(?:overused|repeated|clich|banned|avoid)/gi)
    const newPhrases: Array<{ phrase: string; reason: string }> = []
    for (const match of newPhrasesMatches) {
      newPhrases.push({ phrase: match[1].trim(), reason: 'Flagged by continuity editor' })
    }
    if (newPhrases.length > 0) {
      addGlobalBannedPhrases(newPhrases)
    }

    return {
      success: true,
      issues,
      bannedPhrasesFound,
      summary,
      rawResponse,
    }
  } catch (error: any) {
    return {
      success: false,
      issues: [],
      bannedPhrasesFound,
      summary: '',
      rawResponse: '',
      error: error.message,
    }
  }
}
