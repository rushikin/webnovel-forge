import os
import sys
import time
import threading
import http.server
import socketserver
from playwright.sync_api import sync_playwright

PORT = 9988
DIST_DIR = os.path.abspath('dist/renderer')

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)
    def log_message(self, format, *args):
        pass

def run_server():
    try:
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            httpd.serve_forever()
    except:
        pass

server_thread = threading.Thread(target=run_server, daemon=True)
server_thread.start()
time.sleep(1)

os.makedirs('assets/screenshots', exist_ok=True)

mock_script = """
window.electronAPI = {
  getConfig: async () => ({
    openRouterApiKey: 'sk-or-v1-••••••••••••••••',
    openRouterModel: 'deepseek/deepseek-r1',
    openRouterModels: ['deepseek/deepseek-r1', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.3-70b-instruct'],
    ollamaEnabled: true,
    ollamaHost: 'http://localhost:11434',
    ollamaModel: 'qwen2.5:72b',
    libraryPath: 'C:\\\\Novels\\\\ForgeLibrary',
    defaultChapterWordCount: 3000,
    theme: 'dark',
    editorModel: 'deepseek/deepseek-r1',
    nvidiaApiKey: '',
    nvidiaEnabled: false,
    preferredProvider: 'auto',
  }),
  saveConfig: async () => true,
  setConfig: async () => true,
  getStories: async () => [
    {
      id: 'ashen-crown',
      title: 'The Ashen Crown',
      chapterCount: 32,
      lastEdited: 'Just now',
      path: 'C:/Novels/The Ashen Crown',
    },
    {
      id: 'murim-ballistics',
      title: 'Murim Ballistics: Firearms in the Martial World',
      chapterCount: 18,
      lastEdited: '2 hours ago',
      path: 'C:/Novels/Murim Ballistics',
    },
    {
      id: 'astral-architect',
      title: 'Astral Architect: System Domain',
      chapterCount: 45,
      lastEdited: 'Yesterday',
      path: 'C:/Novels/Astral Architect',
    }
  ],
  scanLibrary: async () => [
    {
      id: 'ashen-crown',
      title: 'The Ashen Crown',
      chapterCount: 32,
      lastEdited: 'Just now',
      path: 'C:/Novels/The Ashen Crown',
    },
    {
      id: 'murim-ballistics',
      title: 'Murim Ballistics: Firearms in the Martial World',
      chapterCount: 18,
      lastEdited: '2 hours ago',
      path: 'C:/Novels/Murim Ballistics',
    },
    {
      id: 'astral-architect',
      title: 'Astral Architect: System Domain',
      chapterCount: 45,
      lastEdited: 'Yesterday',
      path: 'C:/Novels/Astral Architect',
    }
  ],
  pipelineStatus: async () => ({
    brainstorm: true,
    structure: true,
    worldBuilding: true,
    plotOutline: true,
    characters: true,
    writing: true,
    editing: true,
  }),
  pipelineCurrentPhase: async () => 'writing',
  pipelineLoadChat: async () => [
    { role: 'assistant', content: 'Welcome back, Author. I have analyzed Chapter 32 against our continuity bible: Lord Vaelin\\'s soul pact from Chapter 14 remains active, and the blood sigil at Castle Mourn is beginning to resonate.' },
    { role: 'user', content: 'Generate Scene 2: Vaelin confronts High Priest Kaelen at the obsidian altar.' }
  ],
  pipelineSaveChat: async () => true,
  pipelineReadFile: async (_p, filename) => {
    if (filename.includes('idea_notes')) return '# The Ashen Crown\\nA grim progression fantasy novel following Vaelin, a fallen knight who binds his lifeforce with an ancient soul-engine.';
    if (filename.includes('world_bible')) return '# The Realm of Valdor\\n- **The Broken Veil**: A tear between mortal earth and the abyssal astral forge.\\n- **Magic System**: Resonance via ancient sigil stones.';
    if (filename.includes('characters')) return JSON.stringify([
      { id: '1', name: 'Vaelin', role: 'Protagonist', traits: ['Relentless', 'Calculative'], status: 'Active' },
      { id: '2', name: 'High Priest Kaelen', role: 'Antagonist', traits: ['Fanatical', 'Manipulative'], status: 'Alive' }
    ]);
    return 'Chapter draft content...';
  },
  pipelineContextPack: async () => ({}),
  pipelineChapterContext: async () => ({}),
  pipelineBannedPhrases: async () => ['a testament to', 'shivers down the spine'],
  pipelineAddBannedPhrase: async () => true,
  getGlobalBannedPhrases: async () => ['tapestry of', 'delve into', 'a testament to'],
  getEditorModel: async () => 'deepseek/deepseek-r1',
  setEditorModel: async () => true,
  detectBannedPhrases: async () => [],
  runContinuityCheck: async () => ({ passes: true, issues: [], score: 98 }),
  updateRollingSummary: async () => true,
  getRollingSummary: async () => 'Lord Vaelin breached the inner sanctum of Castle Mourn after subduing the abyssal sentinels.',
  dbRun: async () => ({ lastInsertRowid: 1, changes: 1 }),
  dbGet: async () => ({ id: 1 }),
  dbAll: async () => [
    { chapter_number: 1, title: 'The Ruin of Blackthorn', status: 'published', words: 3410 },
    { chapter_number: 2, title: 'The Soul-Engine Awakens', status: 'published', words: 2980 },
    { chapter_number: 3, title: 'Whispers in the Astral Deep', status: 'published', words: 3250 },
    { chapter_number: 4, title: 'Trial of the Ashen Gate', status: 'drafted', words: 3120 }
  ],
  closeDb: async () => true,
  hyperframesDoctor: async () => ({ ready: true }),
  hyperframesListVideos: async () => [
    { slug: 'teaser-trailer', title: 'Chapter 1 Dramatic Teaser', duration: 15, aspectRatio: '16:9' },
    { slug: 'character-intro-vaelin', title: 'Character Spotlight: Vaelin', duration: 10, aspectRatio: '9:16' }
  ],
  hyperframesGetComposition: async () => ({ html: '<html><body>Preview Canvas</body></html>' }),
  onAiStreamChunk: () => () => {},
  videoEngineList: async () => [
    { slug: 'ch1-duel', title: 'Chapter 1 Cliffhanger Duel', engine: 'hyperframes', duration: 12 },
    { slug: 'magic-system', title: 'Soul-Engine Lore Breakdown', engine: 'remotion', duration: 30 }
  ],
  videoEngineCheck: async () => ({ engine: 'hyperframes', ready: true, issues: [], suggestions: [] }),
  videoEngineReadSource: async () => '<!-- Hyperframes Composition Source -->\\n<div class=\"scene\">\\n  <h1>The Ashen Crown</h1>\\n</div>',
  videoEngineScaffold: async () => ({ slug: 'new-anim', title: 'Episode Scene' }),
  videoEngineRender: async () => ({ success: true, duration: 12 })
};
"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(
        viewport={'width': 1440, 'height': 900},
        device_scale_factor=2
    )
    context.add_init_script(mock_script)
    page = context.new_page()

    page.goto(f'http://localhost:{PORT}')
    page.wait_for_timeout(1500)

    # 1. Library Screen
    page.screenshot(path='assets/screenshots/library-screen.png')

    # 2. Enter Story Workspace
    story_card = page.locator('text=The Ashen Crown').first
    if story_card.count() > 0:
        story_card.click()
        page.wait_for_timeout(1500)
        page.screenshot(path='assets/screenshots/story-workspace.png')

        # 3. Enter Video Studio
        video_tab = page.locator('text=Video Studio').first
        if video_tab.count() > 0:
            video_tab.click()
            page.wait_for_timeout(1500)
            page.screenshot(path='assets/screenshots/video-studio.png')

    browser.close()

print("All screenshots captured successfully!")
