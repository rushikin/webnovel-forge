// ---------------------------------------------------------------------------
// Locked Facts — immutable truths extracted from the Story Bible
// ---------------------------------------------------------------------------
// Characters have `locked_facts[]` on their sheets.
// World bible rules marked with specific keywords are also locked.
// These are injected into the writer prompt so the AI never contradicts them.
// ---------------------------------------------------------------------------

import { readProjectFile } from './dataModel'

export interface LockedFact {
  source: 'character' | 'world'
  sourceId: string    // character id or 'world_bible'
  sourceName: string  // character name or 'World Bible'
  fact: string
}

/**
 * Extract locked facts from all character sheets in a project.
 */
export function getCharacterLockedFacts(projectPath: string): LockedFact[] {
  const charactersJson = readProjectFile(projectPath, 'characters.json')
  if (!charactersJson) return []

  try {
    const characters = JSON.parse(charactersJson) as Array<{
      id: string
      name: string
      locked_facts?: string[]
    }>
    const facts: LockedFact[] = []
    for (const char of characters) {
      for (const fact of char.locked_facts || []) {
        facts.push({
          source: 'character',
          sourceId: char.id,
          sourceName: char.name,
          fact,
        })
      }
    }
    return facts
  } catch {
    return []
  }
}

/**
 * Extract locked facts from the world bible.
 * Lines prefixed with "RULE:" or "LOCKED:" are treated as immutable.
 */
export function getWorldLockedFacts(projectPath: string): LockedFact[] {
  const worldBible = readProjectFile(projectPath, 'world_bible.md')
  if (!worldBible) return []

  const facts: LockedFact[] = []
  const lines = worldBible.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    // Match lines like "RULE: <text>" or "LOCKED: <text>" or "- RULE: <text>"
    const match = trimmed.match(/^[-*]?\s*(?:RULE|LOCKED|IMMUTABLE)\s*:\s*(.+)/i)
    if (match) {
      facts.push({
        source: 'world',
        sourceId: 'world_bible',
        sourceName: 'World Bible',
        fact: match[1].trim(),
      })
    }
  }
  return facts
}

/**
 * Get ALL locked facts for a project (characters + world).
 */
export function getAllLockedFacts(projectPath: string): LockedFact[] {
  return [
    ...getCharacterLockedFacts(projectPath),
    ...getWorldLockedFacts(projectPath),
  ]
}

/**
 * Format locked facts for injection into an AI prompt.
 * Groups by source for readability.
 */
export function formatLockedFactsForPrompt(facts: LockedFact[]): string {
  if (facts.length === 0) return '(no locked facts defined)'

  const grouped = new Map<string, string[]>()
  for (const fact of facts) {
    const key = `${fact.sourceName} (${fact.source})`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(fact.fact)
  }

  const parts: string[] = []
  for (const [source, factList] of grouped) {
    parts.push(`[${source}]`)
    for (const f of factList) {
      parts.push(`  • ${f}`)
    }
  }
  return parts.join('\n')
}

/**
 * Get locked facts only for specific characters (by id or name).
 */
export function getLockedFactsForCharacters(
  projectPath: string,
  characterIds: string[]
): LockedFact[] {
  const all = getCharacterLockedFacts(projectPath)
  if (characterIds.length === 0) return all

  const idSet = new Set(characterIds.map(id => id.toLowerCase()))
  return all.filter(
    f => idSet.has(f.sourceId.toLowerCase()) || idSet.has(f.sourceName.toLowerCase())
  )
}
