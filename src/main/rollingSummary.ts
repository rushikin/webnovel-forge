// ---------------------------------------------------------------------------
// Rolling Summary — maintains a compressed summary of all written chapters
// ---------------------------------------------------------------------------
// Appends chapter summaries and compresses when exceeding word limit.
// Uses a cheap model (e.g., google/gemini-2.5-flash) for compression.
// ---------------------------------------------------------------------------

import { readProjectFile, saveProjectFile } from './dataModel'

const MAX_SUMMARY_WORDS = 800
const COMPRESSION_MODEL = 'google/gemini-2.5-flash'

interface CompressionResult {
  success: boolean
  summary: string
  error?: string
}

/**
 * Update the rolling summary with a new chapter summary.
 * Compresses if the total word count exceeds MAX_SUMMARY_WORDS.
 */
export async function updateRollingSummary(
  apiKey: string,
  projectPath: string,
  chapterNumber: number,
  chapterSummary: string
): Promise<void> {
  const existingSummary = readProjectFile(projectPath, 'rolling_summary.md') || ''

  const newEntry = `--- Chapter ${chapterNumber} ---\n${chapterSummary}`
  const combined = existingSummary ? `${existingSummary}\n\n${newEntry}` : newEntry

  const wordCount = countWords(combined)

  if (wordCount <= MAX_SUMMARY_WORDS) {
    saveProjectFile(projectPath, 'rolling_summary.md', combined)
    return
  }

  // Compress using cheap model
  const compressed = await compressSummary(apiKey, combined)
  if (compressed.success) {
    saveProjectFile(projectPath, 'rolling_summary.md', compressed.summary)
  } else {
    // Fallback: keep last N chapters that fit within limit
    const fallback = fallbackTruncate(combined, MAX_SUMMARY_WORDS)
    saveProjectFile(projectPath, 'rolling_summary.md', fallback)
  }
}

/**
 * Compress a summary using a cheap LLM call.
 */
async function compressSummary(apiKey: string, text: string): Promise<CompressionResult> {
  const systemPrompt = `You are a concise summarizer. Compress the following story summary to under ${MAX_SUMMARY_WORDS} words while preserving:
- Key plot events in chronological order
- Character arcs and relationships
- World state changes
- Unresolved plot threads

Keep it factual and chronological. No flowery language.`

  const userPrompt = `Compress this story summary:\n\n${text}`

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: COMPRESSION_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error((errorData as any).error?.message || `HTTP ${response.status}`)
    }

    const data: any = await response.json()
    const summary = data.choices?.[0]?.message?.content || ''

    return { success: true, summary }
  } catch (error: any) {
    return { success: false, summary: '', error: error.message }
  }
}

/**
 * Fallback: truncate to last N chapters that fit within word limit.
 */
function fallbackTruncate(text: string, maxWords: number): string {
  const chapters = text.split(/--- Chapter \d+ ---/)
  let result = ''
  let wordCount = 0

  // Iterate backwards through chapters
  for (let i = chapters.length - 1; i >= 0; i--) {
    const chapter = chapters[i].trim()
    if (!chapter) continue

    const chapterWords = countWords(chapter)
    if (wordCount + chapterWords > maxWords) break

    result = `--- Chapter ${i + 1} ---\n${chapter}\n\n${result}`
    wordCount += chapterWords
  }

  return result.trim() || text.substring(0, maxWords * 6) // rough char estimate
}

/**
 * Count words in a string.
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length
}

/**
 * Get the current rolling summary for a project.
 */
export function getRollingSummary(projectPath: string): string {
  return readProjectFile(projectPath, 'rolling_summary.md') || ''
}