// ---------------------------------------------------------------------------
// Data Model — the single source of truth for what gets stored per story
// ---------------------------------------------------------------------------
// One folder per story. Everything about a story lives inside its folder:
//   project.db          SQLite: chapters, metadata, generation logs
//   idea_notes.md       Phase 1 output
//   story_structure.md  Phase 2 output
//   plot_outline.md     Phase 3 output — JSON array (see OutlineBeatSchema)
//   world_bible.md      Phase 3 output — rules, factions, locations
//   characters.json     Phase 4 output — array of character sheets
//   rolling_summary.md  Auto-updated after every chapter
//   banned_phrases.json Auto-growing per-story repetition blocklist
//   chats/<phase>_chat.json
//   chapters/chNN.md
//
// This module:
//   1. Declares Zod-validated shapes for the structured files (characters.json,
//      plot_outline.md, banned_phrases.json) matching ARCHITECTURE.md §5.
//   2. Owns the SQLite schema + migrations so main.ts and pipeline.ts share one
//      definition.
//   3. Provides typed repository functions (CRUD) used by the rest of the app.
//   4. Keeps the JSON/Markdown files and the SQLite tables in sync — files are
//      the portable, human-readable source of truth; the DB is the queryable index.
// ---------------------------------------------------------------------------

import * as path from 'path'
import * as fs from 'fs'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { assertSafeSubpath } from './securityUtils'

// Chat message type (shared with pipeline)
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// ---------------------------------------------------------------------------
// 1. Zod schemas — match ARCHITECTURE.md §5 exactly
// ---------------------------------------------------------------------------

/** Relationships can be either an array of {with,type} objects OR a name→type map. */
const RelationshipsSchema = z.union([
  z.array(z.object({
    with: z.string(),
    type: z.string(),
  })),
  z.record(z.string(), z.string()),
]).transform((val) => {
  // Normalise to the canonical array form used in ARCHITECTURE.md
  if (Array.isArray(val)) return val
  return Object.entries(val).map(([withName, type]) => ({ with: withName, type }))
})

export const CharacterSheetSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  appearance: z.string().default(''),
  personality_traits: z.array(z.string()).default([]),
  voice_fingerprint: z.string().default(''),
  backstory: z.string().default(''),
  relationships: RelationshipsSchema.default([]),
  arc_goal: z.string().default(''),
  locked_facts: z.array(z.string()).default([]),
  current_state: z.string().default(''),
}).strict()

export type CharacterSheet = z.infer<typeof CharacterSheetSchema>

export const OutlineBeatSchema = z.object({
  chapter: z.number().int().positive(),
  pov_character: z.string(),
  beat_summary: z.string(),
  characters_present: z.array(z.string()).default([]),
  must_include: z.array(z.string()).default([]),
  status: z.enum(['not_written', 'drafted', 'edited', 'approved']).default('not_written'),
}).strict()

export type OutlineBeat = z.infer<typeof OutlineBeatSchema>

export const BannedPhraseEntrySchema = z.object({
  phrase: z.string(),
  reason: z.string().default(''),
  count: z.number().int().nonnegative().default(1),
  added_at: z.string().optional(),
})

export type BannedPhraseEntry = z.infer<typeof BannedPhraseEntrySchema>

export const ChapterStatus = z.enum(['not_written', 'drafted', 'edited', 'approved'])
export type ChapterStatusType = z.infer<typeof ChapterStatus>

// ---------------------------------------------------------------------------
// 2. SQLite schema + migrations
// ---------------------------------------------------------------------------

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS idea_notes (
  project_id INTEGER PRIMARY KEY,
  content TEXT,
  updated_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS story_structure (
  project_id INTEGER PRIMARY KEY,
  content TEXT,
  updated_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS plot_outline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  chapter_number INTEGER NOT NULL,
  pov_character_id TEXT,
  beat_summary TEXT,
  characters_present TEXT,    -- JSON array
  must_include TEXT,           -- JSON array
  status TEXT DEFAULT 'not_written',
  FOREIGN KEY (project_id) REFERENCES projects(id),
  UNIQUE (project_id, chapter_number)
);

CREATE TABLE IF NOT EXISTS world_bible (
  project_id INTEGER PRIMARY KEY,
  content TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  sheet_json TEXT NOT NULL,    -- full CharacterSheet JSON blob
  updated_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  chapter_number INTEGER NOT NULL,
  content TEXT,
  editor_notes TEXT,
  status TEXT DEFAULT 'drafted',
  word_count INTEGER DEFAULT 0,
  file_path TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  UNIQUE (project_id, chapter_number)
);

CREATE TABLE IF NOT EXISTS rolling_summary (
  project_id INTEGER PRIMARY KEY,
  content TEXT,
  last_chapter_covered INTEGER DEFAULT 0,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS banned_phrases (
  project_id INTEGER NOT NULL,
  phrase TEXT NOT NULL,
  reason TEXT,
  count INTEGER DEFAULT 1,
  added_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  UNIQUE (project_id, phrase)
);

CREATE TABLE IF NOT EXISTS generation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  phase TEXT,
  model TEXT,
  prompt TEXT,
  response TEXT,
  tokens_used INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  phase TEXT NOT NULL,
  messages TEXT,                -- JSON array of {role,content}
  updated_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  UNIQUE (project_id, phase)
);

CREATE INDEX IF NOT EXISTS idx_plot_outline_project ON plot_outline(project_id);
CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id);
CREATE INDEX IF NOT EXISTS idx_genlog_project ON generation_log(project_id);
CREATE INDEX IF NOT EXISTS idx_genlog_phase ON generation_log(phase);
`

/**
 * Apply the schema to a freshly opened sql.js Database handle.
 * Safe to call on every open — every statement is CREATE IF NOT EXISTS.
 */
export function initializeDatabase(db: any): void {
  db.exec(SCHEMA_SQL)
}

/**
 * Resolve the canonical project_id for a story folder.
 * Creates the projects row if it doesn't exist yet (first open of a folder
 * that was created by an older build that only wrote files).
 */
export function ensureProjectRow(db: any, title: string): number {
  const existing = db.exec('SELECT id FROM projects LIMIT 1')
  if (existing.length && existing[0].values.length) {
    return existing[0].values[0][0] as number
  }
  db.run('INSERT INTO projects (title, created_at) VALUES (?, ?)', [title, new Date().toISOString()])
  const row = db.exec('SELECT last_insert_rowid()')
  return row[0].values[0][0] as number
}

// ---------------------------------------------------------------------------
// 3. Low-level sql.js helpers (the app already uses sql.js, not better-sqlite3)
// ---------------------------------------------------------------------------

/** Run a parameterised INSERT/UPDATE/DELETE and return { lastInsertRowid, changes }. */
export function dbRun(db: any, sql: string, params: any[] = []): { lastInsertRowid: number; changes: number } {
  db.run(sql, params)
  const info = db.exec('SELECT last_insert_rowid() AS id, changes() AS ch')
  if (info.length && info[0].values.length) {
    return { lastInsertRowid: info[0].values[0][0] as number, changes: info[0].values[0][1] as number }
  }
  return { lastInsertRowid: -1, changes: -1 }
}

/** Fetch a single row as a plain object, or null. */
export function dbGet(db: any, sql: string, params: any[] = []): any | null {
  const stmt = db.prepare(sql)
  if (params.length) stmt.bind(params)
  if (stmt.step()) {
    const columns = stmt.getColumnNames()
    const values = stmt.get()
    const row: any = {}
    columns.forEach((col: string, i: number) => { row[col] = values[i] })
    stmt.free()
    return row
  }
  stmt.free()
  return null
}

/** Fetch all rows as an array of plain objects. */
export function dbAll(db: any, sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql)
  if (params.length) stmt.bind(params)
  const rows: any[] = []
  while (stmt.step()) {
    const columns = stmt.getColumnNames()
    const values = stmt.get()
    const row: any = {}
    columns.forEach((col: string, i: number) => { row[col] = values[i] })
    rows.push(row)
  }
  stmt.free()
  return rows
}

// ---------------------------------------------------------------------------
// 4. File helpers — read/write the portable .md / .json files
// ---------------------------------------------------------------------------

export function readProjectFile(projectPath: string, filename: string): string | null {
  try {
    const filePath = assertSafeSubpath(projectPath, filename)
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8')
    }
  } catch {}
  return null
}

export function saveProjectFile(projectPath: string, filename: string, content: string): boolean {
  try {
    const filePath = assertSafeSubpath(projectPath, filename)
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Chat history — per-phase chat threads
// ---------------------------------------------------------------------------

export function saveChatHistory(projectPath: string, phase: string, messages: ChatMessage[]): void {
  const chatsDir = path.join(projectPath, 'chats')
  if (!fs.existsSync(chatsDir)) {
    fs.mkdirSync(chatsDir, { recursive: true })
  }
  const chatFile = path.join(chatsDir, `${phase}_chat.json`)
  fs.writeFileSync(chatFile, JSON.stringify(messages, null, 2), 'utf-8')
}

export function loadChatHistory(projectPath: string, phase: string): ChatMessage[] {
  try {
    const chatFile = path.join(projectPath, 'chats', `${phase}_chat.json`)
    if (fs.existsSync(chatFile)) {
      return JSON.parse(fs.readFileSync(chatFile, 'utf-8'))
    }
  } catch {}
  return []
}

// ---------------------------------------------------------------------------
// 5. Characters — JSON file is source of truth; DB is a queryable index
// ---------------------------------------------------------------------------

/** Read + validate characters.json. Returns [] if missing/invalid. */
export function readCharacters(projectPath: string): CharacterSheet[] {
  const raw = readProjectFile(projectPath, 'characters.json')
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    const validated = arr
      .map((c) => CharacterSheetSchema.safeParse(c))
      .filter((r) => r.success)
      .map((r) => (r as z.SafeParseSuccess<CharacterSheet>).data)
    // Normalize + dedupe locked_facts vs current_state per §11 Accessibility
    return validated.map((c) => {
      const seen = new Set<string>()
      const dedupedLocked: string[] = []
      for (const f of c.locked_facts || []) {
        const key = f.trim().toLowerCase()
        if (f.trim() && !seen.has(key)) {
          seen.add(key)
          dedupedLocked.push(f.trim())
        }
      }
      c.locked_facts = dedupedLocked
      if (c.current_state) {
        const parts = c.current_state.split('\n').map(s => s.trim()).filter(Boolean)
        const openOnly: string[] = []
        const seenOpen = new Set<string>(dedupedLocked.map(f => f.toLowerCase()))
        for (const p of parts) {
          const k = p.toLowerCase()
          if (!seenOpen.has(k)) {
            seenOpen.add(k)
            openOnly.push(p)
          }
        }
        // Rebuild as locked + deduped open (preserve locked at top)
        c.current_state = [...dedupedLocked, ...openOnly.filter(o => !dedupedLocked.some(l => l.toLowerCase() === o.toLowerCase()))].join('\n')
        // Actually keep only openOnly that are not locked, but already filtered
        // If current_state was only open facts, it will now be locked+open; if it was already locked+open, deduped
      }
      return c
    })
  } catch {
    return []
  }
}

/** Persist the full character array to characters.json (overwrites). */
export function writeCharacters(projectPath: string, characters: CharacterSheet[]): boolean {
  return saveProjectFile(projectPath, 'characters.json', JSON.stringify(characters, null, 2))
}

/** Normalise + persist one character. Assigns an id if missing. */
export function upsertCharacter(projectPath: string, character: Partial<CharacterSheet>): CharacterSheet {
  const existing = readCharacters(projectPath)
  const id = character.id || `char_${uuidv4().slice(0, 8)}`
  const idx = existing.findIndex((c) => c.id === id)

  const sheet: CharacterSheet = {
    id,
    name: character.name ?? '',
    role: character.role ?? '',
    appearance: character.appearance ?? '',
    personality_traits: character.personality_traits ?? [],
    voice_fingerprint: character.voice_fingerprint ?? '',
    backstory: character.backstory ?? '',
    relationships: (Array.isArray(character.relationships)
      ? character.relationships
      : character.relationships
        ? Object.entries(character.relationships as Record<string, string>).map(([w, t]) => ({ with: w, type: t }))
        : []) as Array<{ with: string; type: string }>,
    arc_goal: character.arc_goal ?? '',
    locked_facts: character.locked_facts ?? [],
    current_state: character.current_state ?? '',
  }

  if (idx >= 0) existing[idx] = sheet
  else existing.push(sheet)
  writeCharacters(projectPath, existing)
  return sheet
}

/** Update only the mutable `current_state` of a character (locked_facts untouched). */
export function updateCharacterState(projectPath: string, id: string, currentState: string): boolean {
  const chars = readCharacters(projectPath)
  const c = chars.find((x) => x.id === id)
  if (!c) return false
  c.current_state = currentState
  return writeCharacters(projectPath, chars)
}

/** Sync the characters table from characters.json so the renderer can query it. */
export function syncCharactersTable(db: any, projectPath: string, projectId: number): void {
  const chars = readCharacters(projectPath)
  db.run('DELETE FROM characters WHERE project_id = ?', [projectId])
  for (const c of chars) {
    db.run(
      'INSERT INTO characters (id, project_id, name, role, sheet_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [c.id, projectId, c.name, c.role, JSON.stringify(c), new Date().toISOString()],
    )
  }
}

// ---------------------------------------------------------------------------
// 6. Plot outline — plot_outline.md is a JSON array (file is source of truth)
// ---------------------------------------------------------------------------

/** Read + validate the outline. The file may be a JSON array or a markdown table
 *  (the older "The Ashen Crown" sample uses a markdown table). */
export function readOutline(projectPath: string): OutlineBeat[] {
  const raw = readProjectFile(projectPath, 'plot_outline.md')
  if (!raw) return []

  // First try JSON
  try {
    const parsed = JSON.parse(raw)
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    return arr
      .map((b) => OutlineBeatSchema.safeParse(b))
      .filter((r) => r.success)
      .map((r) => (r as z.SafeParseSuccess<OutlineBeat>).data)
  } catch {
    // Not JSON — fall through to markdown-table parser
  }

  return parseOutlineMarkdownTable(raw)
}

function parseOutlineMarkdownTable(md: string): OutlineBeat[] {
  const lines = md.split('\n')
  const tableRows = lines.filter((l) => l.trim().startsWith('|') && l.includes('---') === false)
  if (tableRows.length < 2) return []

  // First row is the header
  const header = tableRows[0].split('|').map((s) => s.trim().toLowerCase().replace(/ /g, '_')).filter(Boolean)
  const col = (name: string) => header.indexOf(name)

  const beats: OutlineBeat[] = []
  for (const row of tableRows.slice(1)) {
    const cells = row.split('|').map((s) => s.trim()).filter((_s, i, arr) => i > 0 && i < arr.length)
    if (cells.length < 3) continue
    const chapterStr = cells[col('ch')] || cells[0]
    const chapter = parseInt(chapterStr, 10)
    if (isNaN(chapter)) continue
    const pov = cells[col('pov')] || cells[1] || ''
    const beatSummary = cells[col('beat_summary')] || cells[2] || ''
    const charsStr = cells[col('characters')] || ''
    const mustStr = cells[col('must_include')] || ''
    const statusStr = (cells[col('status')] || 'not_written') as OutlineBeat['status']

    beats.push({
      chapter,
      pov_character: pov,
      beat_summary: beatSummary,
      characters_present: charsStr.split(',').map((s) => s.trim()).filter(Boolean),
      must_include: mustStr.split(',').map((s) => s.trim()).filter(Boolean),
      status: ['not_written', 'drafted', 'edited', 'approved'].includes(statusStr) ? statusStr : 'not_written',
    })
  }
  return beats
}

/** Persist the outline as a JSON array to plot_outline.md (overwrites). */
export function writeOutline(projectPath: string, beats: OutlineBeat[]): boolean {
  return saveProjectFile(projectPath, 'plot_outline.md', JSON.stringify(beats, null, 2))
}

/** Update a single beat's status (helps the chapter list stay in sync). */
export function setOutlineBeatStatus(projectPath: string, chapter: number, status: OutlineBeat['status']): boolean {
  const beats = readOutline(projectPath)
  const b = beats.find((x) => x.chapter === chapter)
  if (!b) return false
  b.status = status
  return writeOutline(projectPath, beats)
}

/** Sync the plot_outline table from plot_outline.md. */
export function syncOutlineTable(db: any, projectPath: string, projectId: number): void {
  const beats = readOutline(projectPath)
  db.run('DELETE FROM plot_outline WHERE project_id = ?', [projectId])
  for (const b of beats) {
    db.run(
      `INSERT INTO plot_outline (project_id, chapter_number, pov_character_id, beat_summary, characters_present, must_include, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        projectId,
        b.chapter,
        b.pov_character,
        b.beat_summary,
        JSON.stringify(b.characters_present),
        JSON.stringify(b.must_include),
        b.status,
      ],
    )
  }
}

// ---------------------------------------------------------------------------
// 7. Banned phrases — per-story file (banned_phrases.json) + DB index
// ---------------------------------------------------------------------------

/** Read the per-story banned-phrase list. Migrates the old DB-only rows if the
 *  JSON file doesn't exist yet. Returns just the phrase strings for prompt use. */
export function readBannedPhrases(projectPath: string): BannedPhraseEntry[] {
  const raw = readProjectFile(projectPath, 'banned_phrases.json')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      return (Array.isArray(parsed) ? parsed : [parsed])
        .map((p) => BannedPhraseEntrySchema.safeParse(p))
        .filter((r) => r.success)
        .map((r) => (r as z.SafeParseSuccess<BannedPhraseEntry>).data)
    } catch {}
  }
  return []
}

export function readBannedPhraseStrings(projectPath: string): string[] {
  return readBannedPhrases(projectPath).map((p) => p.phrase)
}

export function writeBannedPhrases(projectPath: string, phrases: BannedPhraseEntry[]): boolean {
  return saveProjectFile(projectPath, 'banned_phrases.json', JSON.stringify(phrases, null, 2))
}

/** Add a phrase to the per-story blocklist (dedupes, increments count if present). */
export function addBannedPhrase(projectPath: string, phrase: string, reason: string): BannedPhraseEntry[] {
  const list = readBannedPhrases(projectPath)
  const key = phrase.toLowerCase().trim()
  const existing = list.find((p) => p.phrase.toLowerCase() === key)
  if (existing) {
    existing.count += 1
    if (reason) existing.reason = reason
  } else {
    list.push({ phrase: phrase.trim(), reason, count: 1, added_at: new Date().toISOString() })
  }
  writeBannedPhrases(projectPath, list)
  return list
}

/** Remove a phrase from the per-story blocklist. */
export function removeBannedPhrase(projectPath: string, phrase: string): BannedPhraseEntry[] {
  const list = readBannedPhrases(projectPath).filter((p) => p.phrase.toLowerCase() !== phrase.toLowerCase().trim())
  writeBannedPhrases(projectPath, list)
  return list
}

/** Sync the banned_phrases table from banned_phrases.json. */
export function syncBannedPhrasesTable(db: any, projectPath: string, projectId: number): void {
  const phrases = readBannedPhrases(projectPath)
  db.run('DELETE FROM banned_phrases WHERE project_id = ?', [projectId])
  for (const p of phrases) {
    db.run(
      'INSERT INTO banned_phrases (project_id, phrase, reason, count, added_at) VALUES (?, ?, ?, ?, ?)',
      [projectId, p.phrase, p.reason, p.count, p.added_at || new Date().toISOString()],
    )
  }
}

// ---------------------------------------------------------------------------
// 8. Chapters — .md files in chapters/ + a DB row per chapter
// ---------------------------------------------------------------------------

/** Chapter filename convention: chapters/ch01.md, ch02.md, ... */
export function chapterFileName(chapterNumber: number): string {
  return `ch${String(chapterNumber).padStart(2, '0')}.md`
}

export function readChapter(projectPath: string, chapterNumber: number): string | null {
  return readProjectFile(projectPath, path.join('chapters', chapterFileName(chapterNumber)))
}

export function writeChapter(
  projectPath: string,
  chapterNumber: number,
  content: string,
  status: ChapterStatusType = 'drafted',
): boolean {
  return saveProjectFile(projectPath, path.join('chapters', chapterFileName(chapterNumber)), content)
}

/** Count the chapter .md files actually present in the story folder. */
export function countChapters(projectPath: string): number {
  const dir = path.join(projectPath, 'chapters')
  if (!fs.existsSync(dir)) return 0
  try {
    return fs.readdirSync(dir).filter((f) => /^ch\d+\.md$/.test(f)).length
  } catch {
    return 0
  }
}

/** Persist a chapter + its editor notes to both the file and the DB row. */
export function saveChapterWithNotes(
  db: any,
  projectPath: string,
  projectId: number,
  chapterNumber: number,
  content: string,
  editorNotes: string,
  status: ChapterStatusType = 'drafted',
): void {
  writeChapter(projectPath, chapterNumber, content, status)

  const wordCount = content.trim().split(/\s+/).filter((w) => w.length > 0).length
  const filePath = path.join('chapters', chapterFileName(chapterNumber))

  const existing = dbGet(db, 'SELECT id FROM chapters WHERE project_id = ? AND chapter_number = ?', [projectId, chapterNumber])
  if (existing) {
    db.run(
      `UPDATE chapters SET content = ?, editor_notes = ?, status = ?, word_count = ?, file_path = ?, updated_at = ?
       WHERE project_id = ? AND chapter_number = ?`,
      [content, editorNotes, status, wordCount, filePath, new Date().toISOString(), projectId, chapterNumber],
    )
  } else {
    db.run(
      `INSERT INTO chapters (project_id, chapter_number, content, editor_notes, status, word_count, file_path, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [projectId, chapterNumber, content, editorNotes, status, wordCount, filePath, new Date().toISOString()],
    )
  }
}

// ---------------------------------------------------------------------------
// 9. Generation log
// ---------------------------------------------------------------------------

export function logGeneration(
  db: any,
  projectId: number,
  phase: string,
  model: string,
  prompt: string,
  response: string,
  tokensUsed: number,
): void {
  db.run(
    'INSERT INTO generation_log (project_id, phase, model, prompt, response, tokens_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [projectId, phase, model, prompt, response, tokensUsed, new Date().toISOString()],
  )
}

// ---------------------------------------------------------------------------
// 10. Full sync — call after opening a story to reconcile files ↔ DB
// ---------------------------------------------------------------------------

export function syncAll(db: any, projectPath: string, title: string): number {
  const projectId = ensureProjectRow(db, title)
  syncCharactersTable(db, projectPath, projectId)
  syncOutlineTable(db, projectPath, projectId)
  syncBannedPhrasesTable(db, projectPath, projectId)
  return projectId
}
