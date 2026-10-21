/**
 * Automated Narrative Humanizer Skill (Passive Background Worker Middleware)
 * Intercepts raw text generations, analyzes structural AI footprints (burstiness, sentence variance),
 * and rewrites prose into high-burstiness, human-sounding narrative prose while purging AI slop tokens.
 */

import { getFreeModelCascade } from './freeModels'

export interface FootprintStats {
  sentenceCount: number
  wordCount: number
  avgSentenceLength: number
  sentenceLengthStdDev: number
  burstinessScore: number // (stdDev / avgLength) * 10
  detectedSlopCount: number
  slopTermsFound: string[]
}

export interface HumanizerResult {
  success: boolean
  humanizedText: string
  originalStats: FootprintStats
  humanizedStats: FootprintStats
  changesCount: number
  error?: string
}

export const SLOP_PATTERNS: Array<{ pattern: RegExp; replacements: string[] }> = [
  { pattern: /\b[Dd]elves?\b/g, replacements: ['plunges', 'sinks', 'slides into', 'pierces'] },
  { pattern: /\b[Dd]elved\b/g, replacements: ['plunged', 'sank', 'slid into', 'pierced'] },
  { pattern: /\b[Dd]elving\b/g, replacements: ['plunging', 'sinking', 'digging into', 'piercing'] },
  { pattern: /\b[Tt]apestry\b/g, replacements: ['web', 'mosaic', 'chaos', 'shifting layout', 'landscape'] },
  { pattern: /\b[Tt]estament to\b/gi, replacements: ['proof of', 'monument to', 'marked by', 'bared by'] },
  { pattern: /\b[Bb]eacon of hope\b/gi, replacements: ['flicker', 'anchor', 'spark', 'cold comfort', 'rare light'] },
  { pattern: /\b[Ww]himsical\b/g, replacements: ['unpredictable', 'peculiar', 'strange'] },
  { pattern: /\b[Ss]ymphony\b/g, replacements: ['clash', 'tangle', 'ringing', 'echo', 'din'] },
  { pattern: /\b[Cc]acophony\b/g, replacements: ['roar', 'din', 'racket', 'clamor'] },
  { pattern: /\b[Ll]abyrinthine\b/g, replacements: ['twisting', 'tangled', 'coiling', 'winding'] },
  { pattern: /\b[Ee]mbark(?:s|ed|ing)? on a journey\b/gi, replacements: ['set out', 'ventured forth', 'stepped into the dark'] },
]

export const HUMANIZER_SYSTEM_PROMPT = `[ROLE]
You are a passive, embedded text-processing engine optimized for web fiction, serialized light novels, and high-pacing web novels. Your sole task is to take an AI-generated draft and rewrite it to match human cadence, syntactic messiness, and emotional rhythm. Do not add introductions, meta-commentary, or wrap-up summaries. Return only the narrative prose.

[CORE CONSTRAINTS]
1. ZERO ALTERATION OF FACTS: Retain every plot element, character action, magical system attribute, dialogue intention, and chronological sequence exactly as written.
2. BREAK THE UNIFORMITY: Human prose is messy. Never allow sentences to have identical structures across paragraphs.
3. UNSANITIZE TEXT: Remove the polite, sterile, overly clinical language inherent in models trained with heavy Reinforcement Learning from Human Feedback (RLHF).

[STYLISTIC LEVERS]
- Burstiness (Sentence Length Variance): Group sentences of radically different lengths. Use ultra-short fragments (1-4 words) for physical impact or psychological tension immediately followed by complex, multi-clause descriptions.
- Show, Don't Tell Staging: If the source text summarizes internal feelings ("He felt an overwhelming wave of terror"), rewrite it into immediate physical actions and sensory markers ("His chest tightened. The breath caught jaggedly in his throat").
- Modern Web Novel Pacing: Rely on stylized formatting native to web serialization. Use short, scannable paragraphs (rarely exceeding 3-4 sentences per paragraph) to keep readers scrolling down the page. Use em-dashes (—) and intentional fragments for internal monologues.
- Purge AI Slop: Never use "delve", "tapestry", "testament to", "beacon of hope", "symphony of", or "not only... but also...". Use raw, concrete nouns and dynamic verbs.`

/**
 * Phase 1: Footprint Scanner
 * Extracts sentence lengths, calculates mean, standard deviation, and burstiness score.
 */
export function calculateFootprint(text: string): FootprintStats {
  if (!text || !text.trim()) {
    return {
      sentenceCount: 0,
      wordCount: 0,
      avgSentenceLength: 0,
      sentenceLengthStdDev: 0,
      burstinessScore: 0,
      detectedSlopCount: 0,
      slopTermsFound: [],
    }
  }

  // Tokenize sentences using standard sentence terminators
  const rawSentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const sentenceWordLengths: number[] = []
  let totalWords = 0

  for (const s of rawSentences) {
    const words = s.split(/\s+/).filter(Boolean)
    if (words.length > 0) {
      sentenceWordLengths.push(words.length)
      totalWords += words.length
    }
  }

  const n = sentenceWordLengths.length
  if (n === 0) {
    return {
      sentenceCount: 0,
      wordCount: 0,
      avgSentenceLength: 0,
      sentenceLengthStdDev: 0,
      burstinessScore: 0,
      detectedSlopCount: 0,
      slopTermsFound: [],
    }
  }

  const avg = totalWords / n

  // Calculate Variance & Standard Deviation
  const variance =
    sentenceWordLengths.reduce((acc, len) => acc + Math.pow(len - avg, 2), 0) / n
  const stdDev = Math.sqrt(variance)

  // Burstiness score: normalized ratio of stdDev to avg (scaled by 10)
  // Low score (< 3.5): machine-like uniform cadence. High score (> 5.5): dynamic human burstiness.
  const burstinessScore = Math.round((avg > 0 ? (stdDev / avg) * 10 : 0) * 10) / 10

  // Scan for known AI slop terms
  const slopFound: string[] = []
  let slopCount = 0
  for (const { pattern } of SLOP_PATTERNS) {
    const matches = text.match(pattern)
    if (matches) {
      slopCount += matches.length
      matches.forEach((m) => {
        if (!slopFound.includes(m.toLowerCase())) slopFound.push(m.toLowerCase())
      })
    }
  }

  return {
    sentenceCount: n,
    wordCount: totalWords,
    avgSentenceLength: Math.round(avg * 10) / 10,
    sentenceLengthStdDev: Math.round(stdDev * 10) / 10,
    burstinessScore,
    detectedSlopCount: slopCount,
    slopTermsFound: slopFound,
  }
}

/**
 * Strips accidental LLM chat preambles and meta-commentary
 */
export function cleanMetaText(text: string): string {
  if (!text) return ''

  let cleaned = text.trim()

  // Remove common assistant greetings / preambles
  cleaned = cleaned.replace(
    /^(?:Here is (?:the|a) (?:humanized|rewritten|revised)?\s*(?:chapter|prose|draft|text|scene):|Here's (?:the|a) (?:rewrite|chapter|text):|Sure,?\s*(?:here is the (?:revised|humanized)?\s*(?:chapter|prose|text):)?|Certainly![\s\S]*?:)\s*/i,
    ''
  )

  // Remove markdown code block wrappers if entire text is wrapped in ```markdown ... ```
  const codeBlockMatch = cleaned.match(/^```(?:markdown)?\s*([\s\S]*?)\s*```$/i)
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim()
  }

  // Remove trailing summary meta-text & chat sign-offs
  cleaned = cleaned.replace(
    /\n*(?:(?:I\s+)?hope you enjoyed[\s\S]*|(?:I\s+)?hope this (?:captures|helps)[\s\S]*|Let me know if you (?:would like|need)[\s\S]*|Feel free to ask[\s\S]*|Changes made:[\s\S]*)$/i,
    ''
  )

  return cleaned.trim()
}

/**
 * Phase 3: Automated Sanitizer & Regex De-Slopping Engine
 * Purges target AI tokens and swaps with varied creative alternatives
 */
export function runDeSlopEngine(text: string): { text: string; replacedCount: number } {
  if (!text) return { text: '', replacedCount: 0 }

  let output = text
  let replacedCount = 0

  for (const { pattern, replacements } of SLOP_PATTERNS) {
    let repIdx = 0
    output = output.replace(pattern, (match) => {
      replacedCount++
      const chosen = replacements[repIdx % replacements.length]
      repIdx++
      // Preserve first character capitalization
      if (match[0] === match[0].toUpperCase()) {
        return chosen.charAt(0).toUpperCase() + chosen.slice(1)
      }
      return chosen
    })
  }

  // De-slop: "Not only X, but also Y" into active split action
  output = output.replace(
    /\bNot only did ([^,]+?),\s*but (?:also\s+([^.]+?)|(?:he|she|they|it)\s+also\s+([^.]+?))\./gi,
    (_m, p1, p2, p3) => {
      replacedCount++
      const secondPart = (p2 || p3 || '').trim()
      return `${p1.trim()}. On top of that, ${secondPart}.`
    }
  )

  return { text: output, replacedCount }
}

/**
 * Deterministic local humanizer fallback for offline mode or when LLM API is unavailable.
 * Breaks rigid sentence uniformity, inserts natural em-dashes and pacing breaks, and de-slops.
 */
export function localHumanizerFallback(text: string): string {
  if (!text) return ''

  // 1. Run regex de-slop first
  const { text: deSlopped } = runDeSlopEngine(cleanMetaText(text))

  // 2. Break extra long compound sentences joined by repetitive 'and' / 'while'
  const paragraphs = deSlopped.split(/\n\s*\n/)
  const processedParagraphs = paragraphs.map((p) => {
    let s = p.trim()
    // Inject em-dash fragments for dramatic suspense if appropriate
    s = s.replace(/,\s+and suddenly\b/gi, '—and suddenly')
    s = s.replace(/,\s+but then\b/gi, '—then')
    return s
  })

  return processedParagraphs.join('\n\n')
}

/**
 * Passive Narrative Humanizer Worker
 * Orchestrates the full 3-phase humanizer pipeline using LLM inference with
 * Temperature: 0.88, Presence Penalty: 0.45, Frequency Penalty: 0.30.
 */
export async function passiveHumanizerWorker(
  rawDraft: string,
  config: {
    apiKey?: string
    nvidiaApiKey?: string
    preferredProvider?: 'nvidia' | 'openrouter' | 'ollama' | 'auto'
    ollama?: { enabled: boolean; host: string; model?: string }
    model?: string
  },
  voiceProfile?: string
): Promise<HumanizerResult> {
  const originalStats = calculateFootprint(rawDraft)

  if (!rawDraft || !rawDraft.trim()) {
    return {
      success: true,
      humanizedText: '',
      originalStats,
      humanizedStats: originalStats,
      changesCount: 0,
    }
  }

  let humanizedDraft = ''

  // 1. Setup system prompt
  let systemPrompt = HUMANIZER_SYSTEM_PROMPT
  if (voiceProfile && voiceProfile.trim()) {
    systemPrompt += `\n\n[AUTHOR VOICE PROFILE]\nMatch this specific authorial cadence:\n${voiceProfile.trim()}`
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: rawDraft },
  ]

  // 2. Execute with recommended humanizer hyperparameters:
  // Temperature 0.88, Presence Penalty 0.45, Frequency Penalty 0.30
  try {
    const tryOpenRouter = async () => {
      if (!config.apiKey || humanizedDraft) return
      const cascade = getFreeModelCascade(config.model)
      for (const candidateModel of cascade) {
        try {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://webnovelforge.app',
              'X-Title': 'WebNovel Forge',
            },
            body: JSON.stringify({
              model: candidateModel,
              messages,
              temperature: 0.88,
              presence_penalty: 0.45,
              frequency_penalty: 0.3,
              max_tokens: 4096,
            }),
          })

          if (response.ok) {
            const data: any = await response.json()
            humanizedDraft = data.choices?.[0]?.message?.content || ''
            if (humanizedDraft.trim()) break
          } else {
            console.warn(`[Humanizer Failover] Model ${candidateModel} failed. Trying next free model...`)
          }
        } catch (e: any) {
          console.warn(`[Humanizer Failover] Error on ${candidateModel}: ${e.message}`)
        }
      }
    }

    const tryNvidia = async () => {
      if (!config.nvidiaApiKey || humanizedDraft) return
      const nvidiaModels = [
        'nvidia/llama-3.1-nemotron-70b-instruct',
        'meta/llama-3.3-70b-instruct',
        'meta/llama-3.1-70b-instruct',
        'mistralai/mistral-nemo-12b-instruct',
      ]
      for (const nvidiaModel of nvidiaModels) {
        try {
          const response = await fetch(
            'https://integrate.api.nvidia.com/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${config.nvidiaApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: nvidiaModel,
                messages,
                temperature: 0.88,
                presence_penalty: 0.45,
                frequency_penalty: 0.3,
                max_tokens: 4096,
              }),
            }
          )

          if (response.ok) {
            const data: any = await response.json()
            humanizedDraft = data.choices?.[0]?.message?.content || ''
            if (humanizedDraft.trim()) break
          }
        } catch {}
      }
    }

    const pref = config.preferredProvider || 'auto'
    if (pref === 'nvidia' || (pref === 'auto' && config.nvidiaApiKey && !config.apiKey)) {
      await tryNvidia()
      await tryOpenRouter()
    } else {
      await tryOpenRouter()
      await tryNvidia()
    }

    if (!humanizedDraft && config.ollama?.enabled) {
      // Ollama local inference
      const host = config.ollama.host || 'http://localhost:11434'
      const response = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.ollama.model || 'llama3:8b',
          messages,
          stream: false,
          options: {
            temperature: 0.88,
            presence_penalty: 0.45,
            frequency_penalty: 0.3,
          },
        }),
      })

      if (response.ok) {
        const data: any = await response.json()
        humanizedDraft = data.message?.content || ''
      }
    }
  } catch (err) {
    console.warn('Narrative Humanizer LLM pass encountered error, falling back to local engine:', err)
  }

  // Fallback to local heuristic engine if LLM was unreachable or returned empty
  if (!humanizedDraft || !humanizedDraft.trim()) {
    humanizedDraft = localHumanizerFallback(rawDraft)
  }

  // 3. Phase 3: Automated Sanitizer & De-Slopping
  const cleaned = cleanMetaText(humanizedDraft)
  const { text: finalProse, replacedCount } = runDeSlopEngine(cleaned)
  const humanizedStats = calculateFootprint(finalProse)

  return {
    success: true,
    humanizedText: finalProse,
    originalStats,
    humanizedStats,
    changesCount: replacedCount,
  }
}
