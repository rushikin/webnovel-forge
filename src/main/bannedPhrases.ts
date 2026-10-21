// ---------------------------------------------------------------------------
// Global Banned Phrases Manager
// ---------------------------------------------------------------------------
// Persists a global list of banned phrases in `<userData>/global_banned_phrases.json`.
// This list is shared across ALL projects (user preference).
// ---------------------------------------------------------------------------

import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

export interface GlobalBannedPhrase {
  phrase: string
  reason: string
  addedAt: string
}

// Default seed list of common AI-isms
const DEFAULT_BANNED_PHRASES: GlobalBannedPhrase[] = [
  { phrase: 'a mixture of', reason: 'Common AI filler', addedAt: '' },
  { phrase: 'little did she know', reason: 'Cliché AI narration', addedAt: '' },
  { phrase: 'little did he know', reason: 'Cliché AI narration', addedAt: '' },
  { phrase: 'in the world of', reason: 'Overused AI opener', addedAt: '' },
  { phrase: 'a symphony of', reason: 'Overused metaphor', addedAt: '' },
  { phrase: 'a tapestry of', reason: 'Overused metaphor', addedAt: '' },
  { phrase: 'shivers down the spine', reason: 'Cliché', addedAt: '' },
  { phrase: "couldn't help but", reason: 'Passive AI phrasing', addedAt: '' },
  { phrase: 'seemed to dance', reason: 'Vague AI metaphor', addedAt: '' },
  { phrase: 'whispered the wind', reason: 'Pathetic fallacy cliché', addedAt: '' },
  { phrase: 'eyes widened', reason: 'Overused beat', addedAt: '' },
  { phrase: 'breath hitched', reason: 'Overused beat', addedAt: '' },
  { phrase: 'heart pounded', reason: 'Overused beat', addedAt: '' },
  { phrase: 'a dance of', reason: 'Overused metaphor', addedAt: '' },
  { phrase: 'sent shivers', reason: 'Cliché', addedAt: '' },
  { phrase: 'the air crackled', reason: 'Overused atmosphere', addedAt: '' },
  { phrase: 'a wave of emotion', reason: 'Vague AI phrasing', addedAt: '' },
  { phrase: 'in that moment', reason: 'Overused temporal phrase', addedAt: '' },
]

function getStorePath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'global_banned_phrases.json')
}

/**
 * Load the global banned-phrase list from disk.
 * Seeds with defaults on first run.
 */
export function getGlobalBannedPhrases(): GlobalBannedPhrase[] {
  const storePath = getStorePath()
  try {
    if (fs.existsSync(storePath)) {
      const data = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
      return data as GlobalBannedPhrase[]
    }
  } catch {
    // Corrupted file — fall through to defaults
  }

  // First run: seed with defaults and persist
  saveGlobalBannedPhrases(DEFAULT_BANNED_PHRASES)
  return [...DEFAULT_BANNED_PHRASES]
}

/**
 * Convenience: return just the phrase strings.
 */
export function getGlobalBannedPhraseStrings(): string[] {
  return getGlobalBannedPhrases().map(p => p.phrase)
}

/**
 * Persist the entire list to disk.
 */
function saveGlobalBannedPhrases(phrases: GlobalBannedPhrase[]): void {
  const storePath = getStorePath()
  const dir = path.dirname(storePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(storePath, JSON.stringify(phrases, null, 2), 'utf-8')
}

/**
 * Add one or more phrases to the global list (deduplicates).
 */
export function addGlobalBannedPhrases(
  newPhrases: Array<{ phrase: string; reason: string }>
): GlobalBannedPhrase[] {
  const existing = getGlobalBannedPhrases()
  const existingSet = new Set(existing.map(p => p.phrase.toLowerCase()))
  const now = new Date().toISOString()

  for (const np of newPhrases) {
    const key = np.phrase.toLowerCase().trim()
    if (key && !existingSet.has(key)) {
      existing.push({ phrase: np.phrase.trim(), reason: np.reason, addedAt: now })
      existingSet.add(key)
    }
  }

  saveGlobalBannedPhrases(existing)
  return existing
}

/**
 * Remove a phrase from the global list.
 */
export function removeGlobalBannedPhrase(phrase: string): GlobalBannedPhrase[] {
  const existing = getGlobalBannedPhrases()
  const filtered = existing.filter(p => p.phrase.toLowerCase() !== phrase.toLowerCase().trim())
  saveGlobalBannedPhrases(filtered)
  return filtered
}

/**
 * Scan a text for occurrences of any banned phrase.
 * Returns an array of { phrase, count, positions } for each match.
 */
export function detectBannedPhrases(
  text: string
): Array<{ phrase: string; count: number; positions: number[] }> {
  const phrases = getGlobalBannedPhraseStrings()
  const lowerText = text.toLowerCase()
  const results: Array<{ phrase: string; count: number; positions: number[] }> = []

  for (const phrase of phrases) {
    const lowerPhrase = phrase.toLowerCase()
    const positions: number[] = []
    let idx = lowerText.indexOf(lowerPhrase)
    while (idx !== -1) {
      positions.push(idx)
      idx = lowerText.indexOf(lowerPhrase, idx + lowerPhrase.length)
    }
    if (positions.length > 0) {
      results.push({ phrase, count: positions.length, positions })
    }
  }

  return results
}
