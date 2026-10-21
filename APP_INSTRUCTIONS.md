

---

## 3. Anti-Hallucination & Anti-Drift System

This is the part that matters most, so it gets its own section. Four mechanisms work together:

### 3.1 The Story Bible (grounding, not memory)
All facts live in structured files (JSON/Markdown), not in chat history. Before writing any chapter, the app automatically builds a **context pack** containing only what's relevant:
- The outline beat for *this* chapter (from `plot_outline.md`)
- The character sheets for characters appearing in *this* chapter
- Relevant world rules (magic system, locations mentioned)
- A **rolling summary** of everything that happened so far (updated after every chapter, kept short — a few paragraphs, not the whole book)

This context pack is injected into the prompt every time. The AI is never asked to recall chapter 3 while writing chapter 40 — it's handed a summary instead.

### 3.2 Continuity Auditor (a second AI pass)
After a chapter is drafted, a **second, separate AI call** (the "Editor" role) re‑reads the new chapter against the Story Bible and checks:
- Did any character do something inconsistent with their sheet?
- Did any world rule get broken?
- Did the chapter follow its planned outline beat, or wander off?

If it finds a problem, it flags it for you to accept/reject a fix — the app never silently rewrites your story.

### 3.3 Banned Phrases List (repetition control)
Every time a chapter is generated, the app scans it for overused AI phrasing (a starter list of common "AI‑isms" is included, and it grows automatically as your own generations repeat things). This list gets added to the *next* chapter's prompt as a "do not use these phrases" instruction.

### 3.4 Locked Facts vs. Open Facts
In the character/world files, each fact can be marked:
- 🔒 **Locked** — never allowed to change (e.g. "protagonist's sister died in chapter 2") — the AI is told this is non‑negotiable.
- 🟢 **Open** — can evolve naturally (e.g. "current mood," "current goal")

This stops the AI from "fixing" or forgetting permanent plot facts while still letting characters grow.

---

## 3.5 Interaction Model: Chat‑First, Not Auto‑Pilot

The app must **feel like talking to ChatGPT/Claude**, not like clicking a button that dumps a finished result. This changes the UI and the agent behavior:
- Every phase (Brainstorm, Structure, World & Plot, Characters, Chapters) opens as a **chat thread**, not a form.
- The AI **does not generate the final artifact immediately**. Instead, it first asks 2‑4 targeted clarifying questions (genre preferences, tone, things to avoid, character inspirations, etc.), waits for the user's replies in the same chat, and only then proposes a draft.
- After proposing a draft, the AI **asks if the user wants changes** before marking the phase "saved." The user can keep chatting/revising in that same thread indefinitely.
- Each phase's chat thread is saved with the project, so the user can scroll back and see *why* a decision was made (useful months later on chapter 80 when they forget why a character has a scar).
- The "Save & Continue" action only appears once the AI's proposed draft is visible in chat — the user always approves before moving to the next phase.

This is implemented with a **Clarifying Questions Agent** step that runs before every generation step in every phase (full system prompt in `SKILLS.md`).

---

## 0. Project Setup

- App type: **Electron desktop app** (Windows/Mac), using **React** for the UI and **Node.js** for backend logic (all in one app, no separate server).
- Database: **SQLite** via the `better-sqlite3` npm package — one `project.db` file per story folder (see 0.2 below).
- AI calls: **OpenRouter API** (`https://openrouter.ai/api/v1/chat/completions`), OpenAI-compatible format.
- Never hardcode the API key in code. Store it in a local `.env` file (add `.env` to `.gitignore`) and let the user paste it into an in-app Settings screen on first launch, saved to a local config file.

### 0.1 Chat-First Interaction Model (applies to EVERY phase below)

This app must feel like using ChatGPT/Claude, not like filling out a form. Do **not** build "click button → wait → get final result" screens. Instead, every phase screen is a **chat panel**:

1. User opens a phase (e.g. Brainstorm) → sees a chat box, empty except an AI greeting like *"Tell me a bit about the story you're imagining — genre, vibe, any inspirations?"*
2. User types a reply in normal conversation.
3. The AI **asks 2-4 follow-up questions** before generating anything (see the Clarifying Questions Agent pattern in `SKILLS.md`). It should feel like brainstorming with a person, not filling a wizard form.
4. Once it has enough info, the AI proposes a draft **inside the chat** (e.g. "Here are 3 concepts based on what you told me...").
5. The user can keep chatting — "make concept 2 darker," "combine 1 and 3" — and the AI revises in place.
6. Only when the user says something like "looks good" / clicks **"Save this version"** does the app write the final file and unlock the next phase.
7. The full chat thread is saved to `chats/<phase>_chat.json` inside the story folder so the user can scroll back later.

Build one reusable `<ChatPanel>` React component (message list + input box + streaming responses) and reuse it across all 5 phases — only the system prompt and the "Save" action differ per phase.

### 0.2 Library Screen & Per-Story Folders

- On first launch, ask the user to pick a **Library folder** on their PC (default suggestion: `Documents/WebNovelForge/`).
- The app's home screen is a **Library** view: a grid/list of story folders already created, each showing title, cover-less placeholder, word count, last edited date, and a "+ New Story" card.
- Clicking "+ New Story" asks for a story title, then creates a new subfolder named after it (sanitized for filesystem-safe characters) containing an empty `project.db` and empty `chats/` folder — see the exact structure in `ARCHITECTURE.md` section 5.0.
- Opening a story loads its own `project.db` and its own chat threads — nothing is shared between stories, ever.
- Add a "Show in Folder" button so the user can see the plain files (characters.json, chapters/*.md, etc.) directly in Windows Explorer/Finder — reinforces that they own their data.

**Milestone 0 deliverable:** Electron + React app with: (a) a Settings screen to save the OpenRouter API key, (b) a Library screen to pick the root folder and create/open story folders, (c) the reusable `<ChatPanel>` component ready to be wired into each phase.

---

## 1. Core AI Call Wrapper (build this before anything else)

Build one reusable function, e.g. `callOpenRouter(systemPrompt, userPrompt, model, temperature)`, that:
- Sends a request to OpenRouter with the given model + temperature
- Supports **streaming** responses (so text appears as it's generated, not all at once)
- Logs every call (prompt + response + token count + cost estimate) into the SQLite database, into a `generation_log` table — this is important for debugging hallucinations later
- Has retry logic for network failures (2 retries with a short delay)

Suggested default models (user can change in Settings):
- Brainstorm/Structure/Characters: a fast, cheap model (e.g. `google/gemini-2.5-flash` or similar — let the user pick from OpenRouter's model list)
- Chapter Writing: a stronger model (e.g. `anthropic/claude-sonnet-4.5` or similar)
- Editor/Continuity pass: same as writing model, but temperature lower (more strict/factual)

**Milestone 1 deliverable:** A working "Test Connection" button in Settings that sends a tiny test prompt and shows the reply, proving the API key works.

---

## 2. Database Schema

Create these SQLite tables:

```sql
CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  title TEXT,
  created_at TEXT
);

CREATE TABLE idea_notes (
  project_id INTEGER,
  content TEXT,           -- markdown text of chosen premise
  updated_at TEXT
);

CREATE TABLE story_structure (
  project_id INTEGER,
  content TEXT,           -- markdown: acts, turning points, ending
  updated_at TEXT
);

CREATE TABLE plot_outline (
  id INTEGER PRIMARY KEY,
  project_id INTEGER,
  chapter_number INTEGER,
  pov_character_id TEXT,
  beat_summary TEXT,
  characters_present TEXT,   -- JSON array of character ids
  must_include TEXT,         -- JSON array of required plot points
  status TEXT                -- 'not_written' | 'drafted' | 'edited' | 'approved'
);

CREATE TABLE world_bible (
  project_id INTEGER,
  content TEXT             -- markdown: rules, factions, locations, timeline
);

CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  project_id INTEGER,
  name TEXT,
  role TEXT,
  sheet_json TEXT           -- full JSON blob (see ARCHITECTURE.md shape)
);

CREATE TABLE chapters (
  id INTEGER PRIMARY KEY,
  project_id INTEGER,
  chapter_number INTEGER,
  content TEXT,             -- the prose
  editor_notes TEXT,        -- continuity flags from the Editor Agent
  status TEXT
);

CREATE TABLE rolling_summary (
  project_id INTEGER,
  content TEXT,             -- short auto-updated summary of story so far
  last_chapter_covered INTEGER
);

CREATE TABLE banned_phrases (
  project_id INTEGER,
  phrase TEXT,
  reason TEXT
);

CREATE TABLE generation_log (
  id INTEGER PRIMARY KEY,
  project_id INTEGER,
  phase TEXT,
  model TEXT,
  prompt TEXT,
  response TEXT,
  tokens_used INTEGER,
  created_at TEXT
);
```

**Milestone 2 deliverable:** "New Project" screen that creates a project row and shows an empty 5-phase sidebar (Brainstorm → Structure → World & Plot → Characters → Chapters).

---

> **Note on Phases 1-5 below:** every "UI" description uses the `<ChatPanel>` and the clarify-then-propose flow from section 0.1 — the AI asks questions first, proposes a draft in chat, and only saves once the user approves. The prompt templates below are the "propose a draft" step; the clarifying-questions step uses the shared Clarifying Questions Agent prompt in `SKILLS.md`.

## 3. Phase 1 — Brainstorm Screen

**UI:** A text box for the user's rough idea (genre, vibe, inspirations), a "Generate Ideas" button, and a results area showing 3–5 concept cards. User picks one or merges/edits it, then clicks "Save & Continue."

**System prompt template (Brainstorm Agent):**
```
You are a web novel brainstorming assistant. Generate creative, distinct story
concepts based on the user's input. For each concept give: a one-line hook,
genre/tags, target audience, tone, and what makes it different from typical
web novels in this genre. Do not write any actual story content yet — concepts
only. Output as a numbered list of 3-5 concepts.
```
- Temperature: 0.9 (high, for creativity)

Save the chosen/edited concept into `idea_notes.content`.

**Milestone 3 deliverable:** Working brainstorm screen, saves to DB, shows in sidebar as complete (green checkmark).

---

## 4. Phase 2 — Story Structure Screen

**UI:** Shows the saved idea. Dropdown to pick a structure template (Three-Act, Hero's Journey, Cultivation/Progression Arc, Custom). "Generate Structure" button. Editable text area for the result.

**System prompt template (Architect Agent):**
```
You are a novel structure architect. Using the story concept and the chosen
structure template below, produce a structural skeleton: major turning points,
act breaks, midpoint, climax, and ending. Be specific to THIS story's premise —
do not give generic advice. Output as markdown with clear headers per act/stage.

STORY CONCEPT:
{idea_notes.content}

STRUCTURE TEMPLATE: {chosen_template}
```
- Temperature: 0.6

Save to `story_structure.content`.

**Milestone 4 deliverable:** Working structure screen, saves to DB.

---

## 5. Phase 3 — World & Plot Outline Screen

Two sub-steps, both required before moving on:

**5a. World Bible generation**
```
You are a worldbuilding assistant. Based on the story concept and structure
below, generate a world bible covering: setting/time period, any
magic/power/technology system with clear RULES (what it can and cannot do),
major factions/organizations, and a timeline of relevant history. Be specific
and consistent — every rule you state here will be treated as LOCKED and must
not contradict itself.

STORY CONCEPT: {idea_notes.content}
STRUCTURE: {story_structure.content}
```

**5b. Chapter-by-chapter outline generation**
```
You are a plot outline architect for a web novel. Break the structure below
into a chapter-by-chapter outline. Ask the user how many chapters to plan for
if not specified (default: outline in batches of 20 chapters at a time, not
the whole novel at once, to keep beats specific rather than vague).
For each chapter output: chapter number, POV character, a 1-3 sentence beat
summary, which characters appear, and any "must include" plot points.
Output as a JSON array matching this shape: [{chapter, pov_character,
beat_summary, characters_present, must_include}]

STORY CONCEPT: {idea_notes.content}
STRUCTURE: {story_structure.content}
WORLD BIBLE: {world_bible.content}
```
- Temperature: 0.5 (structural work needs more precision, less randomness)
- Important: generate outline in **batches** (e.g. 20 chapters at a time), never the whole novel in one call — this keeps each beat specific rather than generic filler.

Parse the JSON response and insert rows into `plot_outline`.

**Milestone 5 deliverable:** World bible editor + outline table view (editable grid: chapter #, POV, beat summary, status).

---

## 6. Phase 4 — Character Generation Screen

**UI:** "Generate Characters from Outline" button (scans the outline for character names/roles mentioned), plus a "+ Add Character Manually" button. Each character shows as an editable card matching the JSON shape in `ARCHITECTURE.md` section 5.

**System prompt template (Casting Agent):**
```
You are a character designer for a web novel. Create a full character sheet
for the character described below, consistent with the story concept, world
bible, and their role in the outline. Include a distinct VOICE FINGERPRINT
(specific speech patterns, sentence length habits, verbal tics, what they
would NEVER say) so their dialogue stays consistent across many chapters.
Mark 2-5 facts as "locked_facts" — permanent facts that must never change or
be contradicted later.

Output valid JSON matching this schema:
{name, role, appearance, personality_traits[], voice_fingerprint,
backstory, relationships[], arc_goal, locked_facts[], current_state}

CHARACTER TO CREATE: {name/role hint}
STORY CONCEPT: {idea_notes.content}
WORLD BIBLE: {world_bible.content}
RELEVANT OUTLINE BEATS: {beats mentioning this character}
```
- Temperature: 0.7

**Milestone 6 deliverable:** Character roster screen, cards saved to `characters` table.

---

## 7. Phase 5 — Chapter Writing Loop (the most important part)

**UI:** A "Chapters" list (from the outline), each row has a "Write Chapter" button. Clicking it runs a two-step pipeline shown as: `Drafting... → Editing/Continuity Check... → Ready for Review`.

### Step A — Build the Context Pack (code, not AI)
Before calling the Writer Agent, assemble automatically:
- The outline row for this chapter (`beat_summary`, `must_include`, `characters_present`)
- The full character sheets for only the characters in `characters_present`
- The relevant slice of `world_bible` (simple keyword match is fine for v1)
- The current `rolling_summary.content`
- The current `banned_phrases` list

### Step B — Writer Agent
```
You are writing Chapter {N} of a web novel. Write ONLY this chapter's prose.
Follow the beat summary and must-include points exactly — do not skip them,
do not add major plot points that are not implied by the outline or world
bible. Stay strictly consistent with each character's locked_facts and
voice_fingerprint below. Do not use any of the banned phrases listed.

CHAPTER BEAT: {beat_summary}
MUST INCLUDE: {must_include}
CHARACTERS IN THIS CHAPTER: {character sheets, only relevant ones}
WORLD RULES RELEVANT HERE: {world bible excerpt}
STORY SO FAR (summary): {rolling_summary.content}
BANNED PHRASES (do not use): {banned_phrases}

Write the chapter now, target length {user setting, e.g. 1500-2500 words}.
```
- Temperature: 0.75 for prose (creative but grounded by the strict context)

Save the draft to `chapters.content`, status `drafted`.

### Step C — Editor / Continuity Agent (runs automatically right after)
```
You are a continuity editor. Compare the chapter draft below against the
character sheets, world bible, and locked facts provided. Flag ANY
contradiction, out-of-character moment, broken world rule, or plot point
that deviates from the outline beat. Also list any repeated/overused
phrases suitable for a "banned phrases" list. Do NOT rewrite the chapter —
only report issues as a bullet list. If there are no issues, say "No issues
found."

CHAPTER DRAFT: {chapters.content}
OUTLINE BEAT IT SHOULD FOLLOW: {beat_summary + must_include}
CHARACTER SHEETS: {relevant character sheets}
WORLD BIBLE: {relevant excerpt}
```
- Temperature: 0.3 (strict, factual checking)

Save output to `chapters.editor_notes`. Show it to the user next to the draft — a simple side-by-side view. User can click "Regenerate" (feeds editor notes back into the Writer Agent as extra instructions) or "Approve."

### Step D — Update Rolling Memory (code, after approval)
When a chapter is approved:
- Append a 2-4 sentence summary of the chapter to `rolling_summary.content` (can be auto-generated with a cheap model call, or simply summarized by the Editor Agent as part of its response)
- Keep `rolling_summary` capped at roughly 500-800 words total — if it grows past that, run a "compress" pass that summarizes the summary itself, so early chapters don't bloat every future prompt
- Merge any newly-flagged repeated phrases into `banned_phrases`
- Update any character's `current_state` field if the chapter changed it (mood, location, injuries, etc.) — locked_facts are never touched here

**Milestone 7 deliverable:** Full working chapter loop: outline → draft → continuity check → approve → memory update, testable end-to-end on at least 3 chapters in a row to confirm consistency holds.

---

## 8. Polish (do last, after the pipeline works)

- Export project to a single `.docx` or `.epub` (combine approved chapters)
- Simple word-count / cost dashboard (sum of `generation_log.tokens_used`)
- Dark mode (nice for late-night writing sessions)
- Local backup/export of the whole project folder as a zip

---

## 9. Guardrails to remind Claude Code about throughout

- Every AI call in Phase 5 must go through the Context Pack — never let the Writer Agent see raw chat history as its only context.
- Locked facts are always included verbatim in prompts; never summarized or paraphrased.
- Never call more chapters ahead than the user has outlined — if the outline runs out, prompt the user to generate the next batch (Milestone 5b) before writing further chapters.
- All API keys stay local — never send the key anywhere except OpenRouter's endpoint.
