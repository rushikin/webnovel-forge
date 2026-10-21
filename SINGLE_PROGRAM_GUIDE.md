# WebNovel Forge — Single Program File Guide

**Project Root:** `C:\Users\rushi\OneDrive\Desktop\web\`  
**Single Launchers:** `LAUNCHER.js` + `RUN_SINGLE_FILE.bat` (this guide)  
**Built Single EXE (after build):** `C:\Users\rushi\OneDrive\Desktop\web\dist\WebNovel Forge 1.0.0.exe` (portable, double-click)

---

## 1. System Requirements

| Requirement | Version | Install Command | Why |
|-------------|---------|-----------------|-----|
| **Windows** | 10 / 11 64-bit | — | Electron target |
| **Node.js** | **22 LTS** (≥20 ok, 22 recommended) | https://nodejs.org — `winget install OpenJS.NodeJS.LTS` | Build + Hyperframes CLI |
| **npm** | 10+ (bundled with Node) | `npm -v` to verify | Dependency install |
| **FFmpeg** | latest | `winget install FFmpeg` or `choco install ffmpeg` | `npx hyperframes render` → `output.mp4` |
| **Disk** | 500 MB free + library folder | — | `Documents\WebNovelForge\` per story |
| **RAM** | 4 GB+ | — | Chapter drafting + video preview |
| **Optional: Ollama** | latest | https://ollama.ai — `ollama pull llama3` | Local free LLM if `nvidiaEnabled` off |
| **Optional: NVIDIA NIM** | API key | https://integrate.api.nvidia.com | `nvidiaEnabled` in Settings → AI Models |
| **Optional: OpenRouter** | API key | https://openrouter.ai/keys | Default cloud LLM |

Verify after install:
```powershell
node -v      # v22.x
npm -v       # 10.x
ffmpeg -version
npx --version
```

---

## 2. Path Instructions (Where Everything Lives)

After `git clone` or copy, keep this exact tree:

```
C:\Users\rushi\OneDrive\Desktop\web\          ← PROJECT_ROOT (keep here)
├── package.json
├── LAUNCHER.js                 ← SINGLE-FILE LAUNCHER (node LAUNCHER.js)
├── RUN_SINGLE_FILE.bat         ← double-click runner (Windows)
├── SINGLE_PROGRAM_GUIDE.md     ← this file
├── src/
│   ├── main/
│   │   ├── main.ts             ← Electron main (single program entry after build)
│   │   ├── preload.ts          ← IPC bridge (single contextBridge)
│   │   ├── pipeline.ts         ← 5-phase + NVIDIA + Ollama wrappers
│   │   ├── hyperframes.ts      ← video templates with <audio data-volume> placeholders
│   │   └── dataModel.ts        ← Zod + dedupe + ARIA normalization
│   ├── renderer/
│   │   ├── App.tsx             ← dark-only enforcement (light gated behind isDev)
│   │   ├── pages/
│   │   │   ├── LibraryScreen.tsx      (search 320px + chips All/In Progress/Completed + PhaseDots + Duplicate)
│   │   │   ├── SettingsScreen.tsx     (NVIDIA + Generation Log collapsible + Danger Zone)
│   │   │   ├── StoryWorkspace.tsx     (4px handle 30-70%, Copy/Search, OutlineTable, CharacterFactEditor modal, HighlightedDraft)
│   │   │   └── VideoStudioScreen.tsx  (sourceOptions 6 checkboxes, violet banner auto-collapse, bgmVolume slider, Save MP4 As, Preview modal, lint banner, violet progress)
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx          (Skills button + Drawer + 3-dot pulse + slide-up-fade + Draft Proposal fade)
│   │   │   ├── SkillsDrawer.tsx       (8 cards, h-[50vh] fixed bottom)
│   │   │   ├── VideoPreviewModal.tsx  (900px modal, 16:9 player 700×394, native controls)
│   │   │   ├── PhaseDots.tsx          (B·S·W·C·Ch filled/pulsing/grey)
│   │   │   ├── HighlightedDraft.tsx   (yellow/red span highlight)
│   │   │   └── CharacterFactEditor.tsx(modal pill-toggle 🔒/🟢 + dedupe)
│   │   └── styles/tokens.css          ← 8 exact tokens, dark-only
│   ├── shared/ipc.ts
│   └── main/preload.ts
├── dist/                       ← BUILT SINGLE PROGRAM (after npm run build)
│   ├── main/main.js            ← SINGLE-FILE ELECTRON MAIN (esbuild bundled)
│   ├── renderer/index.html + assets/  ← single renderer bundle
│   ├── WebNovel Forge 1.0.0.exe       ← PORTABLE SINGLE EXE (after electron-builder)
│   └── win-unpacked/WebNovel Forge.exe
├── node_modules/electron/      ← Electron runtime
└── Documents/WebNovelForge/    ← STORY LIBRARY (created on first run)
    └── <StoryName>/            ← self-contained per story
        ├── project.db
        ├── idea_notes.md, story_structure.md, world_bible.md, plot_outline.md
        ├── characters.json, rolling_summary.md, banned_phrases.json
        ├── chats/<phase>_chat.json
        ├── chapters/ch01.md …
        └── videos/<slug>/index.html + output.mp4
```

**Config & Logs:**
- App config: `%APPDATA%\WebNovelForge\config.json` (or `C:\Users\rushi\AppData\Roaming\WebNovelForge\config.json`)
- Generation log: per-story `project.db` table `generation_log` (view in Settings → Generation Log → Export CSV)

---

## 3. Single-File Build & Run

### Option A — One-Click (Recommended, Windows)
1. Double-click `C:\Users\rushi\OneDrive\Desktop\web\RUN_SINGLE_FILE.bat`
   - Auto-installs `node_modules` if missing
   - Auto-builds `dist\main\main.js` + renderer if missing
   - Launches portable EXE if exists, else `npx electron .`

### Option B — Node Single Launcher
```powershell
cd C:\Users\rushi\OneDrive\Desktop\web
node LAUNCHER.js          # built mode
node LAUNCHER.js --dev    # dev mode (vite + tsc -w)
```

### Option C — Manual Build to Single EXE (True Single File)
```powershell
# 1. Install
cd C:\Users\rushi\OneDrive\Desktop\web
npm install

# 2. Build single program files (44 → 46 modules after polish)
npm run build        # creates dist/main/main.js (single bundled main) + dist/renderer/* (single HTML+JS)

# 3. Package to ONE portable EXE (no installer)
npx electron-builder --win portable
# Output: dist\WebNovel Forge 1.0.0.exe  ← DOUBLE-CLICK THIS = single program file

# Alternative: installer + unpacked
npx electron-builder --win nsis
# Output: dist\WebNovel Forge Setup 1.0.0.exe + dist\win-unpacked\WebNovel Forge.exe
```

### Option D — Dev (Hot Reload)
```powershell
npm run dev          # concurrently: tsc -w -p tsconfig.main.json + vite
# Opens http://localhost:5173 + Electron with DevTools
```

---

## 4. First Run Checklist (60 sec)

1. Launch via `RUN_SINGLE_FILE.bat` or portable EXE.
2. **Onboarding card (560px, dark #1A1D26):** Paste `sk-or-v1-...` → Test Connection → pick `google/gemini-2.5-flash` → (optional) toggle *Use Local Ollama Instead* or *Enable NVIDIA NIM* + paste `nvapi-...` → Choose Library Folder `C:\Users\rushi\Documents\WebNovelForge\` → Chapter Length `2500` → Theme `🌑 Dark` (Light gated behind `isDev`) → `Save Settings →`.
3. **Library:** `+ New Story` → `The Ashen Crown` (dots B·S·W·C·Ch: 3 gold, 1 pulsing) → Search `Ashen` + filter `All` to test.
4. **Story Workspace:** Chat `Tell me a dark cultivation idea` → see *2-4 clarifying questions* before draft (chat-first gate), `💡 Brainstorm` draft proposal card with fade, `✨ Skills` drawer (8 cards) → `Run →` injects prompt, type 3-dot pulse visible, Send → streaming via `onAiStreamChunk` + `requestId`.
5. **Video Studio:** Left `AI Script` tab should show violet banner `⚙ One-Time Setup` with `Node 22+ ✓` / `FFmpeg ✗ + winget install FFmpeg` + `npx hyperframes doctor` chip; banner auto-collapses (`max-height 200→0`) when both ✓. Adjust `Story Source` 6 checkboxes + `Entire Story` dropdown, `BGM Volume` slider `0.8` updates `<audio data-volume>`, generate → center Code tab shows lint banner `✓ Composition valid` jade or `✗` red, `⚡ Render to MP4` fills violet left-to-right `Rendering... 64%`.
6. **Settings → Generation Log** (new tab `📊`): collapsible table `Timestamp|Phase|Model|Tokens|Cost` (3 sample rows) → `Export CSV` → save to `Documents\generation-log-....csv`; `Danger Zone` red `Reset All Settings` / `Clear Generation Log` with confirm modals.

---

## 5. Verification After Install

```powershell
npm run typecheck   # should PASS (no errors)
npm run build:main  # tsc -p tsconfig.main.json
npm run build:renderer  # tsc + vite 46 modules
```

Checklist:
- `src/renderer/styles/tokens.css` exists with 8 tokens + violet only S7/8 comment
- `tailwind.config.js` has `accent-gold #C9A84C` not `#D8A448` + `bg-primary #0D0F14`
- `.eslintrc.json` forbids `#D8A448` outside `hyperframes.ts`/`VideoStudioScreen.tsx`
- `src/main/hyperframes.ts:207` contains `<audio class="clip" data-start="0" data-duration="${duration}" data-volume="0.8" data-track-index="99"`
- `VideoStudioScreen.tsx` has `showSetupBanner = !doctorStatus?.allReady` + `bgmVolume` slider + `hyperframesLint` banner + `renderProgress` violet bar + `sourceOptions` 6 checkboxes + `handleSaveMp4As` + `VideoPreviewModal`
- `ChatPanel.tsx` has `showSkills`, `SkillsDrawer`, `isDraftProposal` fade, `handleClear`/`handleCopyChat`, `dots-pulse 3 dots`
- `StoryWorkspace.tsx` has `leftWidth 50%`, `handleMouseDown` 4px handle, `handleCopyRight`/`handleSearchRight`, `PhaseDots`, `HighlightedDraft`, `CharacterFactEditor` modal with `role="button"` + `onKeyDown Enter`

---

## 6. Uninstall / Backup

- **Backup a story:** Library `⋮` → `📦 Export ZIP` or Workspace `💾 Backup ZIP` → saves `StoryName-backup-YYYY-MM-DD.zip` to `Documents`.
- **Restore:** Library `📦 Import ZIP` → pick `.zip` → creates `Library/StoryName Copy`.
- **Reset:** Settings → `logs` tab → `Danger Zone` → `Reset All Settings` clears `%APPDATA%\WebNovelForge\config.json` + `localStorage`.
- **Uninstall:** Delete `C:\Users\rushi\OneDrive\Desktop\web\` + `Documents\WebNovelForge\` + `%APPDATA%\WebNovelForge\`.

---

## 7. Troubleshooting

- **App crashes on Select Library Folder:** Fixed via `ipcMain.handle('select-library-folder')` + `library:select-folder` alias + `preload selectLibraryFolder` fallback (Phase A).
- **Stories list empty:** Fixed `getStories` alias to `library:scan` (Phase A).
- **Chapter always writes ch 1:** Fixed `chapterNumber` prop passed from `selectedChapter` (Phase B).
- **Phase ribbon static:** Fixed `PhaseSealRibbon currentPhase/completedPhases` props (Phase B).
- **No streaming:** Fixed `onAiStreamChunk` + `requestId` placeholder bubble (Phase B).
- **Export missing:** Added `exportNovel` `docx/epub/markdown/pdf` via `dist` (Phase C).
- **No analytics:** Added `getAnalytics` modal `📊` with `totalWords/tokens/cost` (Phase C).
- **Outline not batched:** Added `OutlineTable` `+ Generate Next 20 Chapters` (Phase C).
- **Hyperframes silent:** Templates now inject `<audio data-volume="0.8">` + `bgmVolume` slider (Phase D).
- **Only Show in Explorer:** Added `hyperframesSaveMp4As` → `💾 Save MP4 As...` + `▶ Preview` modal 900px (Phase D).

For issues: `ctrl+p` in app to list actions, or report at https://github.com/anomalyco/opencode
