# WebNovel Forge — Architecture Document
*An OpenRouter-powered desktop app for writing long web novels without the AI losing the plot.*

> This document explains the **design**. A separate file, `APP_INSTRUCTIONS.md`, is the step-by-step build guide you give to Claude Code / Cursor to actually build it.

---

## 1. The Core Problem This App Solves

Every AI writing tool eventually breaks the same way on a long story:
- The AI forgets a character's eye color, or their dead brother suddenly shows up alive.
- The AI slowly drifts the plot away from what you planned.
- The AI repeats the same sentence structures and words ("a mixture of X and Y", "little did she know") over and over.
- The AI can't hold a 100,000-word novel in its head at once (no model can — context windows are too small).

**The fix used by every serious open-source novel-writing tool (NovelCrafter, ABook, AIStoryWriter, Novel Engine) is the same idea:**

> Never let the AI "remember" the story from its own memory. Force it to read a small, structured set of **fact files** (a "Story Bible") before every single generation step, and update those fact files after every step.

The AI is treated like a brilliant writer with amnesia who is handed the same reference folder before every scene. It never relies on "remembering" — it relies on **reading**.

---

## 2. The 5-Phase Pipeline

Your app runs the story through 5 phases, in order, each producing a **file**, not just chat text. Nothing gets thrown away.

```
Phase 1: BRAINSTORM  →  Phase 2: STRUCTURE  →  Phase 3: WORLD & PLOT  →  Phase 4: CHARACTERS  →  Phase 5: CHAPTER WRITING (loop)
     idea_notes.md          story_structure.md      plot_outline.md          characters.json         chapters/ch01.md, ch02.md...
```

| Phase | What it does | Output file | AI's job |
|---|---|---|---|
| **1. Brainstorm** | Genre, premise, tone, core hook, "what if" ideas, comparable web novels | `idea_notes.md` | Generate 3–5 concept options, you pick/merge one |
| **2. Structure** | Overall shape: 3-act / hero's journey / cultivation-arc progression, act breaks, ending | `story_structure.md` | Turn the chosen idea into a skeleton with major turning points |
| **3. World & Plot** | Setting rules, power systems/magic rules, factions, timeline, chapter-by-chapter beat outline | `plot_outline.md`, `world_bible.md` | Expand structure into a full outline, one line per planned chapter |
| **4. Characters** | Full character sheets: appearance, personality, speech pattern, motivations, relationships, arc | `characters.json` | Generate a "character bible" entry per character, including a **voice fingerprint** (how they talk) |
| **5. Story Generation** | Actual prose, chapter by chapter, using everything above as grounding | `chapters/chNN.md` | Write one chapter at a time, then **audit itself** for continuity errors |

Each phase's output becomes **required input** to the next phase and to Phase 5. This is what keeps phase 5 from hallucinating — it is never asked to "just write," it's always asked to "write chapter 14 using this outline beat, these character sheets, and this world bible."

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
After a chapter is drafted, a **second, separate AI call** (the "Editor" role) re-reads the new chapter against the Story Bible and checks:
- Did any character do something inconsistent with their sheet?
- Did any world rule get broken?
- Did the chapter follow its planned outline beat, or wander off?

If it finds a problem, it flags it for you to accept/reject a fix — the app never silently rewrites your story.

### 3.3 Banned Phrases List (repetition control)
Every time a chapter is generated, the app scans it for overused AI phrasing (a starter list of common "AI-isms" is included, and it grows automatically as your own generations repeat things). This list gets added to the *next* chapter's prompt as a "do not use these phrases" instruction.

### 3.4 Locked Facts vs. Open Facts
In the character/world files, each fact can be marked:
- 🔒 **Locked** — never allowed to change (e.g. "protagonist's sister died in chapter 2") — the AI is told this is non-negotiable.
- 🟢 **Open** — can evolve naturally (e.g. "current mood," "current goal")

This stops the AI from "fixing" or forgetting permanent plot facts while still letting characters grow.

---

## 3.5 Interaction Model: Chat-First, Not Auto-Pilot

The app must **feel like talking to ChatGPT/Claude**, not like clicking a button that dumps a finished result. This changes the UI and the agent behavior:

- Every phase (Brainstorm, Structure, World & Plot, Characters, Chapters) opens as a **chat thread**, not a form.
- The AI **does not generate the final artifact immediately.** Instead, it first asks 2-4 targeted clarifying questions (genre preferences, tone, things to avoid, character inspirations, etc.), waits for the user's replies in the same chat, and only then proposes a draft.
- After proposing a draft, the AI **asks if the user wants changes** before marking the phase "saved." The user can keep chatting/revising in that same thread indefinitely.
- Each phase's chat thread is saved with the project, so the user can scroll back and see *why* a decision was made (useful months later on chapter 80 when they forget why a character has a scar).
- The "Save & Continue" action only appears once the AI's proposed draft is visible in chat — the user always approves before moving to the next phase.

This is implemented with a **Clarifying Questions Agent** step that runs before every generation step in every phase (full system prompt in `SKILLS.md`).

## 4. Tech Stack (beginner-friendly choices, explained)

| Layer | Choice | Why this, in plain terms |
|---|---|---|
| Desktop shell | **Electron** | Lets you build a real Windows/Mac app using web tech (HTML/React) you already sort of know from React Native. Huge community, tons of AI-assistant training data, easiest to debug. |
| UI | **React + Tailwind CSS** | Same mental model as React Native, just for desktop windows instead of phone screens. |
| Backend logic | **Node.js** (runs inside Electron) | No separate server needed — it's one app. |
| Local database | **SQLite** (via `better-sqlite3`) | A single file on your computer holds your whole project (chapters, characters, outline). No internet/cloud database to manage. |
| AI calls | **OpenRouter and nvidea API** | One API key gives you access to many models (Claude, GPT, Gemini, DeepSeek, etc.) — you can pick a cheap fast model for brainstorming and a stronger model for final prose. |
| File storage | Plain `.md` / `.json` files inside your project folder (mirrored into SQLite for search) | So you can open your story bible in any text editor too, not locked into the app. |

You do **not** need Python, Docker, or a cloud server for this. Everything runs locally on your PC.

---

## 5. Data Model (what gets stored)

### 5.0 One Folder Per Story

The app manages a root **Library** folder (e.g. `Documents/WebNovelForge/`). Every time the user starts a new story, the app creates a brand-new subfolder named after the story, and **everything about that story lives inside it** — chat history, outline, characters, chapters, generation logs. This means:
- Stories are fully self-contained and portable (zip the folder, move it, back it up, share it).
- Nothing from Story A can ever leak into Story B's AI context by accident.
- Opening the app shows a "Library" screen listing all story folders, like a bookshelf.

```
Documents/WebNovelForge/
├── The Ashen Crown/                  # one folder per story
│   ├── project.db
│   ├── chats/                        # saved chat threads per phase
│   │   ├── brainstorm_chat.json
│   │   ├── structure_chat.json
│   │   ├── world_plot_chat.json
│   │   ├── characters_chat.json
│   │   └── chapters_chat.json
│   ├── idea_notes.md
│   ├── story_structure.md
│   ├── plot_outline.md
│   ├── world_bible.md
│   ├── characters.json
│   ├── rolling_summary.md
│   ├── banned_phrases.json
│   └── chapters/
│       ├── ch01.md
│       └── ch02.md
└── Murim Ballistics/                 # a second, completely separate story
    └── ... (same structure)
```

```
project/
├── project.db                # SQLite: chapters, metadata, generation logs
├── idea_notes.md              # Phase 1 output
├── story_structure.md         # Phase 2 output
├── plot_outline.md            # Phase 3 output — one row per chapter
├── world_bible.md             # Phase 3 output — rules, factions, locations
├── characters.json            # Phase 4 output — array of character sheets
├── rolling_summary.md         # Auto-updated after every chapter
├── banned_phrases.json        # Auto-growing repetition blocklist
└── chapters/
    ├── ch01.md
    ├── ch02.md
    └── ...
```

**Character sheet shape (`characters.json` entry):**
```json
{
  "id": "char_001",
  "name": "Kael Ashworth",
  "role": "protagonist",
  "appearance": "...",
  "personality_traits": ["stubborn", "secretly kind", "distrusts authority"],
  "voice_fingerprint": "short sentences, avoids contractions, sarcastic under stress",
  "backstory": "...",
  "relationships": [{"with": "char_002", "type": "rival-turned-ally"}],
  "arc_goal": "learn to trust others",
  "locked_facts": ["mother died when he was 12", "left-handed"],
  "current_state": "distrustful, injured, hiding in the eastern forest"
}
```

**Outline row shape (`plot_outline.md` / stored in DB):**
```json
{
  "chapter": 14,
  "pov_character": "char_001",
  "beat_summary": "Kael confronts the rival faction leader and learns the truth about the artifact.",
  "characters_present": ["char_001", "char_002"],
  "must_include": ["reveal: artifact is cursed"],
  "status": "not_written"
}
```

---

## 6. The Agent Roles (who does what, per phase)

Think of these as 4 different "hats" the same OpenRouter model wears, each with its own system prompt:

1. **Brainstorm Agent** — creative, high temperature, generates options
2. **Architect Agent** — structural, medium temperature, turns ideas into outlines
3. **Casting Agent** — generates character sheets + voice fingerprints
4. **Writer Agent** — drafts chapter prose, grounded strictly in the context pack, lower temperature for consistency
5. **Editor/Continuity Agent** — reviews the Writer Agent's output against the Story Bible, flags issues, updates `rolling_summary.md` and `banned_phrases.json`

Phases 1–4 run once (or when you ask to revise). Phase 5 (Writer → Editor) loops once per chapter.

---

## 7. Why This Won't "Take the Story in an Unknown Direction"

Three concrete guardrails, restated simply:
1. **The Writer Agent is never given a blank page.** It always receives the specific outline beat for that chapter — it's filling in a beat, not inventing the plot.
2. **Locked facts are non-negotiable** and repeated in every prompt, so the AI can't quietly retcon them.
3. **The Editor Agent checks the work** after every chapter, before you even read it, and flags drift for your approval.

---

## 8. What's Next

See `APP_INSTRUCTIONS.md` for the exact build steps, folder setup, and the prompt templates for each of the 5 phases — written so you can hand it directly to an AI coding assistant.

---

## 9. Multi-Engine Programmatic Video Generation Studio

WebNovel Forge includes an integrated **Video Studio** supporting six programmatic, code-driven video generation engines. Each engine enables author-directors to produce book trailers, character spotlights, chapter cliffhangers, and animated lore diagrams directly from novel metadata:

| Engine | Primary Language | Output & Rendering Mechanism | Ideal Web Novel Use Case |
|---|---|---|---|
| **HeyGen Hyperframes** | HTML5 / CSS3 / GSAP | `npx hyperframes render -o output.mp4` | 20 built-in templates, interactive timeline scrubber, book trailers, TikTok teasers |
| **Remotion** | React (TSX) | `npx remotion render Composition.tsx output.mp4` | Parameterized React components for bulk episode generation (Shorts/Reels) |
| **html-video** (nexu-io) | HTML / CSS + Data | `npx html-video render index.html -o output.mp4` | Agent-friendly HTML/CSS templating with AI soundtrack integration |
| **Motion Canvas** | TypeScript (2D Canvas) | `npx motion-canvas render scene.ts` | Frame-accurate vector animations: sect power hierarchies, magic circles, timeline maps |
| **Manim** (Code Video) | Python 3.9+ | `python -m manim scene.py SceneName --format mp4` | Mathematical, geographic, and schematic programmatic animations (3Blue1Brown engine) |
| **Prism Motion** | Python (FastAPI) + React | WebSocket / FastAPI pipeline | Full-stack AI pipeline: SadTalker avatars, Manim diagrams, Remotion compositor |

### 9.1 Storage & Scaffolding Hierarchy
Video projects are stored cleanly under the story's own library directory:
```
<storyPath>/
├── videos/
│   ├── hyperframes/
│   │   └── <slug>/
│   │       ├── index.html
│   │       ├── meta.json
│   │       └── output.mp4
│   ├── remotion/
│   │   └── <slug>/
│   │       ├── Composition.tsx
│   │       ├── remotion.config.ts
│   │       └── output.mp4
│   ├── motion-canvas/
│   │   └── <slug>/scene.ts
│   └── manim/
│       └── <slug>/scene.py
```

---

## 10. AI Provider Ecosystem: OpenRouter, Ollama & NVIDIA NIM

The app supports hybrid inference across cloud and local providers:
1. **OpenRouter API**: Access to Claude 3.5 Sonnet, Gemini 2.5 Flash, DeepSeek V3/R1, and 100+ free models.
2. **Ollama**: Free, offline local inference (Llama 3, Mistral, Qwen) via `http://localhost:11434`.
3. **NVIDIA NIM API**: Hosted inference via `integrate.api.nvidia.com` using NVIDIA's API key ecosystem. The API key is accessible in Settings → AI Models, with live connection verification testing.

---

## 11. Novel Export, Backup, and Library Management

- **Export Formats**: One-click manuscript export to Markdown (`.md`), Microsoft Word (`.docx`), EPUB (`.epub`), and printable PDF.
- **ZIP Backup & Migration**: Atomic `.zip` packaging of any story folder (including SQLite database, chapters, world bible, character sheets, and video compositions).
- **Library Actions**: Story duplication, renaming with database re-indexing, deletion with DB unmount, and dynamic library folder switching.

---

## 12. Auto-Episode Animator & Scene Breakdown Pipeline

WebNovel Forge includes an automated **Episode Animator** that transforms written web novel chapters directly into structured video scenes with spoken dialogue and cinematic animations:

### 12.1 End-to-End Workflow
```
Web Novel Chapter (chNN.md / DB)
              ↓
Director AI Parsing (Scenes, Settings, Emotions, Dialogue)
              ↓
Engine Code Compiler (Hyperframes GSAP / Remotion React TSX)
              ↓
Scaffolding & Project Registration (videos/<engine>/episode-<N>)
              ↓
Live Storyboard & Studio Player Scrubbing / CLI MP4 Rendering
```

### 12.2 Scene & Conversation Schema
Every episode breakdown produces:
1. **Episode Overview**: Episode number, title slam, premise synopsis, and total duration (seconds).
2. **Scene Beats**:
   - `sceneIndex`: Sequential beat (1 to 6).
   - `title`: Dramatic scene headline (e.g., *"Confrontation at the Azure Cliff"*).
   - `setting`: Visual environment description (e.g., *"Ancestral Hall, Rain-slicked rooftops"*).
   - `durationSeconds`: Calculated segment timing (4–8s).
   - `charactersPresent`: Array of active character names.
   - `actionDescription`: Physical movement, martial art stances, camera motion, or magical phenomena.
   - `conversations`: Array of dialogue lines with speaker name, emotion tag (`furious`, `cold`, `whispering`, `transcendent`), and formatted quote text.

### 12.3 Multi-Engine Compilation
- **Hyperframes Compilation**: Produces HTML5 with GSAP timelines, particle canvases, atmospheric gradient backgrounds, kinetic typographic lower-thirds, and speaker quote cards. Synchronizes both to `videos/<slug>` (for live iframe player scrub preview) and `videos/hyperframes/<slug>` (for CLI rendering).
- **Remotion Compilation**: Produces a React component hierarchy (`EpisodeComposition`) utilizing Remotion's `Sequence`, `AbsoluteFill`, and frame-based interpolations for bulk Shorts/TikTok/YouTube export.
- **Seamless Navigation**: An author can trigger animation directly from the Chapter sidebar or toolbar via `🎬 Animate Episode`, which automatically shifts focus to the Video Studio with the selected chapter queued and ready to render.

---

## 13. Automated Narrative Humanizer Middleware & Interactive Human Eyes System

WebNovel Forge integrates an automated, non-blocking narrative humanizer middleware designed to neutralize AI writing footprints, elevate sentence burstiness, and eliminate repetitive LLM vocabulary before text is presented or persisted.

### 13.1 Automated Pipeline Interception
```
[Raw LLM Generation (Phase 5 / Scene Expand / Autocomplete)]
                           │
                           ▼
[Phase 1: Footprint Scanner] ──► Extracts sentence lengths, calculates Mean (μ) and Std Dev (σ)
                           │
                           ▼
[Phase 2: Narrative Humanizer Engine] ──► Applies Stylistic Levers (Burstiness, Show-Don't-Tell)
                           │              Hyperparameters: Temp 0.88, Pres. Penalty 0.45, Freq. Penalty 0.30
                           ▼
[Phase 3: Automated Sanitizer & De-Slopper] ──► Regex Purge Matrix & Meta-text Stripping
                           │
                           ▼
[Final Web Novel Chapter Saved to Disk (chapters/chNN.md) & SQLite]
```

### 13.2 Core Pipeline Stages
1. **Phase 1: Footprint Scanner (`calculateFootprint`)**:
   - Parses text into individual sentence fragments using punctuation boundaries (`.`, `!`, `?`, `\n`).
   - Computes statistical metrics: word count, sentence count, average sentence length ($\mu$), standard deviation ($\sigma$).
   - Calculates the **Burstiness Score** ($(\sigma / \mu) \times 10$). AI-generated drafts typically register below 4.0; human prose routinely exceeds 5.0+.

2. **Phase 2: Narrative Humanizer Engine (`passiveHumanizerWorker`)**:
   - **Zero Alteration of Facts**: Retains every plot mechanic, character stance, magical power scale, and dialogue nuance.
   - **Break the Uniformity**: Enforces radical sentence length variance, combining 1–4 word punchy fragments with rich, multi-clause descriptions.
   - **Unsanitize Text**: Eliminates clinical, sterile corporate neutrality in favor of visceral physical action and immediate sensory grounding.
   - **Hyperparameters**: Injected into OpenRouter / NVIDIA NIM calls:
     - `temperature`: `0.88` (rich lexical diversity without narrative drift)
     - `presence_penalty`: `0.45` (forces vocabulary expansion)
     - `frequency_penalty`: `0.30` (penalizes repeated sentence rhythms)

3. **Phase 3: Automated Sanitizer & De-Slopping Engine (`runDeSlopEngine`, `cleanMetaText`)**:
   - Automatically removes AI conversational chatter, intro preambles ("Here is the revised chapter:"), and concluding pleasantries.
   - Executes regex replacement across target creative fiction clichés:
     - *Delve / Delved* → plunge, sink, dig, slide into, pierce
     - *Tapestry* → mosaic, web, chaos, shifting layout, landscape
     - *Testament to* → proof of, monument to, marked by, bared by
     - *Beacon of hope* → flicker, anchor, spark, cold comfort, rare light
     - *Whimsical / Symphony* → unpredictable, clash, tangle, ringing, echo
     - *Not only... but also...* → split into two chronological, active actions

### 13.3 Dual Modes of Operation
- **Passive Middleware**: Integrated directly into `src/main/pipeline.ts` during `runChapterWritingPhase`. All newly generated chapters pass through `passiveHumanizerWorker` automatically before being written to `chapters/chNN.md` and the SQLite database.
- **Interactive "Human Eyes" Action**: Authors editing or reviewing text in the Living Document panel can click the **`👁️ Humanize`** button on either the viewing toolbar or the active edit toolbar. This triggers on-demand humanization, saves updates atomically, and reports before/after burstiness scores via UI toast notifications.
- **Offline & Resilient Fallback**: If LLM API keys are unset or network connectivity fails, the engine seamlessly routes through `localHumanizerFallback()`, ensuring regex de-slopping, punctuation pacing, and burstiness improvements without ever losing user data.

---

## 14. Obsidian-Inspired UI Architecture, Dual Theme Engine & Bespoke Vector Logo

### 14.1 Bespoke Vector Logo Architecture
The WebNovel Forge logo is a custom-crafted SVG vector (`src/renderer/components/ForgeLogo.tsx` and `assets/logo.svg`) engineered mathematically with zero external stock or online asset dependencies:
1. **The Hexagonal Obsidian Monolith**: An outer geometric lattice representing the structured knowledge graph, world bible, and locked character constraints.
2. **The Anvil Hearth**: A beveled gradient base symbolizing the narrative forge and disciplined plot structure.
3. **The Radiant Celestial Stylus**: A centered diamond-cut quill blade with glowing ink channel, denoting human authorial craft and dynamic burstiness.
4. **Constellation Knowledge Nodes**: Interstellar nexus points joining worldbuilding, character voices, and generative scene threads.

### 14.2 Dual Theme Engine: Obsidian Dark & Obsidian Light
The application implements dynamic CSS variable tuples (`--*-rgb`) mapped to Tailwind CSS with full alpha-channel opacity support:
- **Obsidian Dark (Deep Graphite)**: Canvas `#141519`, Note surfaces `#1A1C23`, Sidebar `#101115`, Forge Gold `#C9A84C`, and Obsidian Amethyst `#8B5CF6`. High contrast, zero-eyestrain writing environment.
- **Obsidian Light (Clean Note Paper)**: Canvas `#F8F9FA`, Crisp note surfaces `#FFFFFF`, Sidebar `#EDEFF2`, Amber-Gold `#B45309`, and Obsidian Royal Amethyst `#7C3AED`. High legibility daylight note-taking workspace.
- **Instant Toggling & Persistence**: Seamless switching via the header sun/moon button or Settings → General, persisted in `localStorage` and synchronized dynamically to `document.documentElement.classList`.

### 14.3 Obsidian Note-Taking UX & Typography
- **Living Document Panel**: Styled with `.obsidian-note-prose`, minimal custom scrollbars (6px rounded track), and full Markdown syntax highlighting.
- **Phase Ribbon Tabs**: Horizontal segmented Obsidian tab ribbon with icon badges and active pill indicators.
- **Companion Floating Assistant**: Minimalist bottom-right Forge companion with glowing launcher emblem.




