import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } from 'electron'
import { exec, execFile, spawn } from 'child_process'
import {
  isSafeSubpath,
  assertSafeSubpath,
  sanitizeSlug,
  validateSqlQuery,
} from './securityUtils'

// Pipeline orchestrator — handles the 5-phase story generation pipeline
import {
  type Phase,
  type ChatMessage,
  type PipelineConfig,
  type PipelineContext,
  runBrainstormPhase,
  runStructurePhase,
  runWorldBuildingPhase,
  runPlotOutlinePhase,
  runCharacterPhase,
  runChapterWritingPhase,
  runContinuityEditorPhase,
  runChapterLoop,
  runClarifyingQuestions,
  saveProjectFile,
  readProjectFile,
  saveChatHistory,
  loadChatHistory,
  buildContextPack,
  buildChapterContextPack,
  getPhaseStatus,
  getCompletedPhases,
  getCurrentPhase,
  getChapterCount,
  getBannedPhrases,
  addBannedPhrase,
} from './pipeline'
import {
  getGlobalBannedPhrases,
  addGlobalBannedPhrases,
  removeGlobalBannedPhrase,
  detectBannedPhrases,
} from './bannedPhrases'
import { runContinuityCheck, getEditorModel, setEditorModel } from './editorAgent'
import { fetchFreeModels, getCachedFreeModels, getBestFreeModel, getFreeModelCascade } from './freeModels'
import { updateRollingSummary, getRollingSummary } from './rollingSummary'
import {
  hyperframesDoctor,
  hyperframesListVideos,
  hyperframesCreateVideo,
  hyperframesGetComposition,
  hyperframesSaveComposition,
  hyperframesRender,
  hyperframesDeleteVideo,
  hyperframesGenerateAiComposition,
  hyperframesLint,
} from './hyperframes'
import {
  checkEngine,
  scaffoldEngineProject,
  listEngineProjects,
  renderEngineProject,
  readEngineSource,
  writeEngineSource,
} from './videoEngines'
import { ENGINE_REGISTRY, type VideoEngine } from './videoEngines/types'
import { autoAnimateEpisode } from './episodeAnimator'
import { calculateFootprint, passiveHumanizerWorker } from './narrativeHumanizer'
import * as path from 'path'
import * as fs from 'fs'

// Lazy-load and initialize sql.js (WebAssembly) module
let sqlModule: any = null
async function initSQL() {
  if (!sqlModule) {
    const mod = await import('sql.js')
    const initFn = (mod as any).default || mod
    // Robust wasm locating for both dev and packaged (asar) builds
    const tryLocate = (file: string) => {
      const candidates = [
        path.join(__dirname, '../../node_modules/sql.js/dist', file),
        path.join(__dirname, '../node_modules/sql.js/dist', file),
        path.join(process.resourcesPath || '', 'app.asar.unpacked/node_modules/sql.js/dist', file),
        path.join(app.getAppPath(), 'node_modules/sql.js/dist', file),
        path.join(__dirname, file),
      ]
      for (const c of candidates) {
        try { if (fs.existsSync(c)) return c } catch {}
      }
      // Fallback to dist copy (copied via build step)
      const distWasm = path.join(__dirname, file)
      if (fs.existsSync(distWasm)) return distWasm
      return file
    }
    try {
      sqlModule = await initFn({ locateFile: tryLocate })
    } catch {
      // Fallback without locateFile for environments where wasm is inlined
      sqlModule = await initFn()
    }
  }
  return sqlModule
}

const isDev = process.env.NODE_ENV === 'development'

// Paths — lazily computed after app is ready to avoid getPath() before ready
function getUserDataPath(): string {
  try { return app.getPath('userData') } catch { return path.join(app.getPath('temp'), 'WebNovelForge') }
}
function getConfigPath(): string {
  return path.join(getUserDataPath(), 'config.json')
}
function getDefaultLibraryPath(): string {
  try { return path.join(app.getPath('documents'), 'WebNovelForge') } catch { return path.join(getUserDataPath(), 'WebNovelForge') }
}
const userDataPath = getUserDataPath()
const configPath = getConfigPath()
const defaultLibraryPath = getDefaultLibraryPath()

// Ensure library folder exists (deferred to whenReady as well, but keep sync fallback)
try {
  if (!fs.existsSync(defaultLibraryPath)) {
    fs.mkdirSync(defaultLibraryPath, { recursive: true })
  }
} catch {}

interface AppConfig {
  preferredProvider?: 'nvidia' | 'openrouter' | 'ollama' | 'auto'
  openRouterApiKey: string
  libraryPath: string
  defaultModels: {
    brainstorm: string
    structure: string
    worldPlot: string
    characters: string
    writing: string
    editing: string
  }
  ollamaEnabled: boolean
  ollamaHost: string
  nvidiaApiKey: string
  nvidiaEnabled: boolean
}

let mainWindow: BrowserWindow | null = null
let config: AppConfig = loadConfig()
const dbConnections = new Map<string, any>()

/**
 * Simple mutex implementation for preventing race conditions on database operations
 * Each database path gets its own mutex
 */
class DbMutex {
  private locks = new Map<string, Promise<void>>()
  private resolvers = new Map<string, () => void>()

  /**
   * Acquire a lock for the given database path
   * Returns a function that releases the lock
   */
  async lock(dbPath: string): Promise<() => void> {
    // Wait for any existing lock to be released
    while (this.locks.has(dbPath)) {
      await this.locks.get(dbPath)
    }

    // Create a new lock
    let releaseLock: () => void
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve
    })

    this.locks.set(dbPath, lockPromise)
    this.resolvers.set(dbPath, releaseLock!)

    return () => {
      const resolver = this.resolvers.get(dbPath)
      if (resolver) {
        resolver()
        this.locks.delete(dbPath)
        this.resolvers.delete(dbPath)
      }
    }
  }

  /**
   * Execute a function with the lock held
   */
  async withLock<T>(dbPath: string, fn: () => Promise<T>): Promise<T> {
    const release = await this.lock(dbPath)
    try {
      return await fn()
    } finally {
      release()
    }
  }
}

const dbMutex = new DbMutex()

function loadConfig(): AppConfig {
  const topFree = 'openrouter/free'
  const secondBest = 'nvidia/nemotron-3.5-lightning:free'
  const fastFree = 'minimax/minimax-m3.1-flash:free'

  const defaultConfig: AppConfig = {
    preferredProvider: 'auto',
    openRouterApiKey: '',
    libraryPath: defaultLibraryPath,
    defaultModels: {
      brainstorm: fastFree,
      structure: topFree,
      worldPlot: topFree,
      characters: secondBest,
      writing: topFree,
      editing: topFree,
    },
    ollamaEnabled: false,
    ollamaHost: 'http://localhost:11434',
    nvidiaApiKey: '',
    nvidiaEnabled: false,
  }

  const cfgPath = getConfigPath()
  if (fs.existsSync(cfgPath)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
      const merged = { ...defaultConfig, ...fileConfig }

      // Decrypt encrypted API keys using OS-level secure storage if available
      if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
        try {
          if (fileConfig._enc_openRouterApiKey) {
            merged.openRouterApiKey = safeStorage.decryptString(Buffer.from(fileConfig._enc_openRouterApiKey, 'base64'))
          }
          if (fileConfig._enc_nvidiaApiKey) {
            merged.nvidiaApiKey = safeStorage.decryptString(Buffer.from(fileConfig._enc_nvidiaApiKey, 'base64'))
          }
        } catch (decryptErr) {
          console.warn('[Config] Failed to decrypt secure keys with safeStorage:', decryptErr)
        }
      }
      return merged
    } catch {
      return defaultConfig
    }
  }
  return defaultConfig
}

function saveConfig() {
  try {
    const cfgPath = getConfigPath()
    const dir = path.dirname(cfgPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    const configToPersist: Record<string, any> = { ...config }

    // Encrypt sensitive API keys at rest if safeStorage is available
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
      try {
        if (configToPersist.openRouterApiKey) {
          configToPersist._enc_openRouterApiKey = safeStorage.encryptString(configToPersist.openRouterApiKey).toString('base64')
          configToPersist.openRouterApiKey = '' // Do not store plaintext
        }
        if (configToPersist.nvidiaApiKey) {
          configToPersist._enc_nvidiaApiKey = safeStorage.encryptString(configToPersist.nvidiaApiKey).toString('base64')
          configToPersist.nvidiaApiKey = '' // Do not store plaintext
        }
      } catch (encryptErr) {
        console.warn('[Config] safeStorage encryption failed, persisting plaintext fallback:', encryptErr)
      }
    }

    fs.writeFileSync(cfgPath, JSON.stringify(configToPersist, null, 2))
  } catch (e) {
    console.error('Failed to save config', e)
  }
}

async function getDb(projectPath: string): Promise<any> {
  const dbPath = path.join(projectPath, 'project.db')
  let db = dbConnections.get(dbPath)
  if (!db) {
    const sqlModule = await initSQL()
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath)
      db = new sqlModule.Database(buffer)
    } else {
      db = new sqlModule.Database()
    }
    initializeDatabase(db)
    dbConnections.set(dbPath, db)
  }
  return db
}

/**
 * Get database with mutex lock to prevent race conditions
 */
async function getDbWithLock(projectPath: string): Promise<any> {
  const dbPath = path.join(projectPath, 'project.db')
  return await dbMutex.withLock(dbPath, async () => {
    return await getDb(projectPath)
  })
}

function saveDb(db: any, dbPath: string) {
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(dbPath, buffer)
}

/**
 * Save database with mutex lock to prevent race conditions
 */
async function saveDbWithLock(db: any, dbPath: string): Promise<void> {
  await dbMutex.withLock(dbPath, async () => {
    saveDb(db, dbPath)
  })
}

/**
 * Close a database connection and save it to disk
 */
function closeDb(dbPath: string) {
  const db = dbConnections.get(dbPath)
  if (db) {
    try {
      saveDb(db, dbPath)
    } catch (err) {
      console.error(`Failed to save database ${dbPath}:`, err)
    }
    db.close()
    dbConnections.delete(dbPath)
  }
}

/**
 * Close all database connections and save them to disk
 */
function closeAllDbs() {
  for (const dbPath of dbConnections.keys()) {
    closeDb(dbPath)
  }
}

/**
 * Get the project_id for a given project path.
 * Creates the project row if it doesn't exist (for backward compatibility with older projects).
 * NOTE: This function must only be called from within a dbMutex.withLock context.
 */
async function getProjectId(projectPath: string): Promise<number> {
  // FIX BUG-10: getProjectId is always called inside a mutex block (getDbWithLock callers).
  // Use getDb directly here since the caller is already holding the lock.
  const db = await getDb(projectPath)
  // Try to get existing project
  const result = db.exec('SELECT id FROM projects ORDER BY created_at DESC LIMIT 1')
  if (result.length > 0 && result[0].values.length > 0) {
    return result[0].values[0][0] as number
  }
  // If no project exists (legacy project), create one with the folder name as title
  const title = path.basename(projectPath)
  db.run('INSERT INTO projects (title, created_at) VALUES (?, ?)', [title, new Date().toISOString()])
  saveDb(db, path.join(projectPath, 'project.db'))
  const newResult = db.exec('SELECT last_insert_rowid() AS id')
  return newResult[0].values[0][0] as number
}

function initializeDatabase(db: any) {
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, title TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS idea_notes (project_id INTEGER, content TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS story_structure (project_id INTEGER, content TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS plot_outline (id INTEGER PRIMARY KEY, project_id INTEGER, chapter_number INTEGER, pov_character_id TEXT, beat_summary TEXT, characters_present TEXT, must_include TEXT, status TEXT DEFAULT 'not_written');
    CREATE TABLE IF NOT EXISTS world_bible (project_id INTEGER, content TEXT);
    CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, project_id INTEGER, name TEXT, role TEXT, sheet_json TEXT);
    CREATE TABLE IF NOT EXISTS chapters (id INTEGER PRIMARY KEY, project_id INTEGER, chapter_number INTEGER, content TEXT, editor_notes TEXT, status TEXT DEFAULT 'drafted');
    CREATE TABLE IF NOT EXISTS rolling_summary (project_id INTEGER, content TEXT, last_chapter_covered INTEGER);
    CREATE TABLE IF NOT EXISTS banned_phrases (project_id INTEGER, phrase TEXT, reason TEXT);
    CREATE TABLE IF NOT EXISTS generation_log (id INTEGER PRIMARY KEY, project_id INTEGER, phase TEXT, model TEXT, prompt TEXT, response TEXT, tokens_used INTEGER, created_at TEXT);
    CREATE TABLE IF NOT EXISTS chats (id INTEGER PRIMARY KEY, project_id INTEGER, phase TEXT, messages TEXT, updated_at TEXT);
  `)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0D0F14',
      symbolColor: '#C9A84C',
      height: 40,
    },
    backgroundColor: '#0D0F14',
    show: false,
  })

  // Restrict new window creation and route external URLs safely
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // Prevent unauthorized in-app navigation away from application origins
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl)
      if (parsed.origin !== 'http://localhost:5173' && parsed.protocol !== 'file:') {
        event.preventDefault()
      }
    } catch {
      event.preventDefault()
    }
  })

  // Surface renderer errors to main console (fixes blank-screen debugging)
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[Window] did-fail-load ${code} ${desc} for ${url}`)
  })
  mainWindow.webContents.on('console-message', (_e, level, msg, line, sourceId) => {
    const prefix = level === 0 ? '[Renderer]' : level === 1 ? '[Renderer warn]' : '[Renderer error]'
    console.log(`${prefix} ${msg} (${sourceId}:${line})`)
  })
  // Fallback: show window even if ready-to-show never fires (prevents blank forever)
  const showTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.warn('[Window] ready-to-show timeout – forcing show')
      mainWindow.show()
    }
  }, 3000)
  mainWindow.once('ready-to-show', () => {
    clearTimeout(showTimer)
    mainWindow?.show()
  })

  // Robust load: try dev server first if isDev, else file; with fallback logging
  const devUrl = 'http://localhost:5173'
  const prodFile = path.join(__dirname, '../renderer/index.html')
  const altProdFile = path.join(__dirname, '../../dist/renderer/index.html')
  if (isDev) {
    mainWindow.loadURL(devUrl).catch((err) => {
      console.error(`[Window] loadURL ${devUrl} failed:`, err)
      const fallback = fs.existsSync(prodFile) ? prodFile : altProdFile
      if (fs.existsSync(fallback)) {
        console.log(`[Window] falling back to file ${fallback}`)
        mainWindow?.loadFile(fallback)
      }
    })
    try { mainWindow.webContents.openDevTools({ mode: 'detach' }) } catch {}
  } else {
    const target = fs.existsSync(prodFile) ? prodFile : altProdFile
    console.log(`[Window] loading file ${target}`)
    if (!fs.existsSync(target)) {
      console.error(`[Window] renderer file not found: ${target} – listing __dirname:`, fs.readdirSync(__dirname), 'parent:', (() => { try { return fs.readdirSync(path.join(__dirname, '..')) } catch { return 'n/a' } })())
    }
    mainWindow.loadFile(target).catch((err) => console.error('[Window] loadFile failed:', err))
    // Open devtools briefly in production to surface blank-screen errors, then close – comment out for release
    // mainWindow.webContents.once('did-finish-load', () => { mainWindow?.webContents.openDevTools({ mode: 'detach' }) })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Global error handlers – surface detailed diagnostics in development, sanitized in production
process.on('uncaughtException', (err) => {
  console.error('[Main] uncaughtException:', err)
  try {
    const { dialog: dlg } = require('electron')
    if (isDev) {
      dlg.showErrorBox('Main process error', String(err.stack || err))
    } else {
      dlg.showErrorBox('Application Error', 'An unexpected error occurred. Please restart the application.')
    }
  } catch {}
})
process.on('unhandledRejection', (reason) => {
  console.error('[Main] unhandledRejection:', reason)
})

app.whenReady().then(async () => {
  // Ensure library folder exists after app ready (handles getPath before ready)
  try {
    const lib = getDefaultLibraryPath()
    if (!fs.existsSync(lib)) fs.mkdirSync(lib, { recursive: true })
  } catch (e) { console.error('Failed to ensure library folder', e) }
  try { await initSQL() } catch (e) { console.error('initSQL failed', e) }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Close all database connections before quitting
app.on('before-quit', () => {
  closeAllDbs()
})

// IPC Handlers
import { IPC_CHANNELS, type CallAiStreamPayload } from '../shared/ipc'

ipcMain.handle(IPC_CHANNELS.CONFIG_GET, () => config)

ipcMain.handle(IPC_CHANNELS.CONFIG_SET, (_e, newConfig: Partial<AppConfig>) => {
  config = { ...config, ...newConfig }
  saveConfig()
  return config
})

ipcMain.handle(IPC_CHANNELS.LIBRARY_SCAN, async () => {
  if (!fs.existsSync(config.libraryPath)) {
    fs.mkdirSync(config.libraryPath, { recursive: true })
  }
  const folders = fs.readdirSync(config.libraryPath, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const projectPath = path.join(config.libraryPath, d.name)
      const dbPath = path.join(projectPath, 'project.db')
      let title = d.name
      let chapterCount = 0
      let lastEdited = ''
      if (fs.existsSync(dbPath)) {
        try {
          const db = dbConnections.get(dbPath)
          if (db) {
            const project = db.exec('SELECT title, created_at FROM projects ORDER BY created_at DESC LIMIT 1')
            if (project.length && project[0].values.length) {
              title = project[0].values[0][0] as string
            }
            const chResult = db.exec('SELECT COUNT(*) as count FROM chapters')
            if (chResult.length && chResult[0].values.length) {
              chapterCount = chResult[0].values[0][0] as number
            }
          }
        } catch {}
      }
      return { id: d.name, title, chapterCount, lastEdited, path: projectPath }
    })
  return folders
})

// Close a specific database connection
ipcMain.handle(IPC_CHANNELS.CLOSE_DB, async (_e, projectPath: string) => {
  const dbPath = path.join(projectPath, 'project.db')
  await dbMutex.withLock(dbPath, async () => {
    closeDb(dbPath)
  })
  return true
})

ipcMain.handle(IPC_CHANNELS.LIBRARY_CREATE_STORY, async (_e, payload: { title: string }) => {
  const { title } = payload
  const sanitized = title.replace(/[<>:"/\\|?*]/g, '').trim()
  const projectPath = path.join(config.libraryPath, sanitized)
  if (fs.existsSync(projectPath)) {
    throw new Error('A story with this name already exists')
  }
  fs.mkdirSync(projectPath, { recursive: true })
  fs.mkdirSync(path.join(projectPath, 'chats'), { recursive: true })
  fs.mkdirSync(path.join(projectPath, 'chapters'), { recursive: true })

  const db = await getDbWithLock(projectPath)
  db.run('INSERT INTO projects (title, created_at) VALUES (?, ?)', [sanitized, new Date().toISOString()])
  await saveDbWithLock(db, path.join(projectPath, 'project.db'))
  return { id: sanitized, title: sanitized, path: projectPath }
})

ipcMain.handle(IPC_CHANNELS.LIBRARY_OPEN_FOLDER, async (_e, projectPath: string) => {
  try {
    const errorMsg = await shell.openPath(projectPath)
    if (errorMsg && process.platform === 'win32') {
      spawn('explorer.exe', [projectPath], { detached: true, stdio: 'ignore' }).unref()
    }
  } catch (err) {
    console.warn('[Library] Failed to open folder:', err)
  }
})

ipcMain.handle(IPC_CHANNELS.LIBRARY_SELECT_FOLDER, async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Stories Library Directory'
  })
  if (result.canceled || !result.filePaths.length) {
    return null
  }
  const selectedPath = result.filePaths[0]
  config = { ...config, libraryPath: selectedPath }
  saveConfig()
  return selectedPath
})

// Legacy alias — renderer historically called `select-library-folder`
ipcMain.handle('select-library-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Stories Library Directory'
  })
  if (result.canceled || !result.filePaths.length) {
    return null
  }
  const selectedPath = result.filePaths[0]
  config = { ...config, libraryPath: selectedPath }
  saveConfig()
  return selectedPath
})

ipcMain.handle(IPC_CHANNELS.LIBRARY_DELETE_STORY, async (_e, projectPath: string) => {
  try {
    const resolvedLibrary = path.resolve(config.libraryPath)
    const resolvedProject = path.resolve(projectPath)
    if (!isSafeSubpath(resolvedLibrary, resolvedProject) || resolvedProject === resolvedLibrary) {
      throw new Error('Security Violation: Cannot delete directory outside the configured library path')
    }

    const dbPath = path.join(projectPath, 'project.db')
    closeDb(dbPath)
    if (fs.existsSync(projectPath)) {
      fs.rmSync(projectPath, { recursive: true, force: true })
    }
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete story' }
  }
})

ipcMain.handle(IPC_CHANNELS.LIBRARY_RENAME_STORY, async (_e, payload: { oldPath: string; newTitle: string }) => {
  const { oldPath, newTitle } = payload
  try {
    const resolvedLibrary = path.resolve(config.libraryPath)
    const resolvedOld = path.resolve(oldPath)
    if (!isSafeSubpath(resolvedLibrary, resolvedOld) || resolvedOld === resolvedLibrary) {
      throw new Error('Security Violation: Cannot rename story outside the configured library path')
    }

    const sanitized = newTitle.replace(/[<>:"/\\|?*]/g, '').trim()
    if (!sanitized) throw new Error('Invalid story title')
    
    const parentDir = path.dirname(oldPath)
    const newPath = assertSafeSubpath(parentDir, sanitized)
    
    if (fs.existsSync(newPath) && newPath !== oldPath) {
      throw new Error('A story with that name already exists')
    }

    const oldDbPath = path.join(oldPath, 'project.db')
    closeDb(oldDbPath)

    if (newPath !== oldPath) {
      fs.renameSync(oldPath, newPath)
    }

    const newDbPath = path.join(newPath, 'project.db')
    if (fs.existsSync(newDbPath)) {
      const db = await getDbWithLock(newPath)
      db.run('UPDATE projects SET title = ? WHERE id = (SELECT id FROM projects LIMIT 1)', [sanitized])
      await saveDbWithLock(db, newDbPath)
    }

    return { success: true, newPath, newTitle: sanitized }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to rename story' }
  }
})

ipcMain.handle(IPC_CHANNELS.DB_RUN, async (_e, payload: { projectPath: string; sql: string; params: any[] }) => {
  const { projectPath, sql, params } = payload
  validateSqlQuery(sql)
  const resolvedProject = assertSafeSubpath(config.libraryPath, path.resolve(projectPath))
  const dbPath = path.join(resolvedProject, 'project.db')
  return await dbMutex.withLock(dbPath, async () => {
    const db = await getDb(resolvedProject)
    if (params && params.length > 0) {
      db.run(sql, params)
    } else {
      db.run(sql)
    }
    saveDb(db, dbPath)
    return { lastInsertRowid: -1, changes: -1 }
  })
})

ipcMain.handle(IPC_CHANNELS.DB_GET, async (_e, payload: { projectPath: string; sql: string; params: any[] }) => {
  const { projectPath, sql, params } = payload
  validateSqlQuery(sql)
  const resolvedProject = assertSafeSubpath(config.libraryPath, path.resolve(projectPath))
  const dbPath = path.join(resolvedProject, 'project.db')
  return await dbMutex.withLock(dbPath, async () => {
    const db = await getDb(resolvedProject)
    const stmt = db.prepare(sql)
    if (params && params.length > 0) {
      stmt.bind(params)
    }
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
  })
})

ipcMain.handle(IPC_CHANNELS.DB_ALL, async (_e, payload: { projectPath: string; sql: string; params: any[] }) => {
  const { projectPath, sql, params } = payload
  validateSqlQuery(sql)
  const resolvedProject = assertSafeSubpath(config.libraryPath, path.resolve(projectPath))
  const dbPath = path.join(resolvedProject, 'project.db')
  return await dbMutex.withLock(dbPath, async () => {
    const db = await getDb(resolvedProject)
    const stmt = db.prepare(sql)
    if (params && params.length > 0) {
      stmt.bind(params)
    }
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
  })
})

ipcMain.handle(IPC_CHANNELS.CONFIG_TEST_OPENROUTER, async (_e, payload: { apiKey: string; model: string }) => {
  const { apiKey, model } = payload
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with just "OK" if you can see this.' }],
        max_tokens: 10,
      }),
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }
    const data: any = await response.json()
    return { success: true, reply: data.choices[0]?.message?.content || 'OK' }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('config:test-nvidia', async (_e, payload: { apiKey: string; model?: string }) => {
  const { apiKey, model } = payload
  // Modern active models on NVIDIA NIM (as verified live on integrate.api.nvidia.com)
  const candidateModels = [
    model,
    'meta/llama-3.2-11b-vision-instruct',
    'nvidia/nemotron-3.5-lightning-30b-a3b',
    'nvidia/nemotron-3-super-120b-a12b',
    'openai/gpt-oss-20b',
  ].filter(Boolean) as string[]

  let lastError = ''
  for (const candidate of candidateModels) {
    try {
      const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: candidate,
          messages: [{ role: 'user', content: 'Reply with just "OK" if you can see this.' }],
          max_tokens: 10,
          temperature: 0.2,
        }),
      })
      if (response.ok) {
        const data: any = await response.json()
        const reply = data.choices?.[0]?.message?.content || 'OK'
        return { success: true, reply: `${reply} (via ${candidate})` }
      }
      const errorText = await response.text()
      lastError = `HTTP ${response.status} on ${candidate}: ${errorText}`
      // If 404 Function not found or 410 EOL, continue to next candidate
      if (response.status === 404 || response.status === 410) {
        continue
      }
    } catch (err: any) {
      lastError = err.message
    }
  }

  return { success: false, error: lastError || 'Failed to connect to any active NVIDIA NIM model' }
})

ipcMain.handle('call-nvidia', async (_e, payload: {
  apiKey: string; model: string; systemPrompt: string; userPrompt: string;
  temperature: number; projectPath: string; phase: string;
}) => {
  const { apiKey, model, systemPrompt, userPrompt, temperature, projectPath, phase } = payload
  const candidateModels = [
    model && !model.includes('llama-3.1-nemotron-70b') && !model.includes('llama-3.1-8b') ? model : null,
    'meta/llama-3.2-11b-vision-instruct',
    'nvidia/nemotron-3.5-lightning-30b-a3b',
    'nvidia/nemotron-3-super-120b-a12b',
    'openai/gpt-oss-20b',
  ].filter(Boolean) as string[]

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  let lastError = ''
  for (const activeModel of candidateModels) {
    try {
      const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: activeModel, messages, temperature, max_tokens: 4000 }),
      })
      if (!response.ok) {
        const errorText = await response.text()
        lastError = `HTTP ${response.status}: ${errorText}`
        if (response.status === 404 || response.status === 410) {
          continue
        }
        throw new Error(lastError)
      }
      const data: any = await response.json()
      const content = data.choices?.[0]?.message?.content || ''
      const tokensUsed = data.usage?.total_tokens || 0
      if (projectPath) {
        const dbPath = path.join(projectPath, 'project.db')
        await dbMutex.withLock(dbPath, async () => {
          const db = await getDb(projectPath)
          const projectId = await getProjectId(projectPath)
          db.run('INSERT INTO generation_log (project_id, phase, model, prompt, response, tokens_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [projectId, phase, `nvidia:${activeModel}`, JSON.stringify(messages), content, tokensUsed, new Date().toISOString()])
          saveDb(db, dbPath)
        })
      }
      return { success: true, content, tokensUsed }
    } catch (error: any) {
      lastError = error.message
    }
  }

  return { success: false, error: lastError || 'All NVIDIA models failed' }
})

ipcMain.handle(IPC_CHANNELS.CALL_OPENROUTER, async (_e, payload: {
  apiKey: string; model: string; systemPrompt: string; userPrompt: string;
  temperature: number; stream: boolean; projectPath: string; phase: string;
}) => {
  const { apiKey, model, systemPrompt, userPrompt, temperature, projectPath, phase } = payload
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature, stream: false, max_tokens: 4000 }),
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }
    const data: any = await response.json()
    const content = data.choices[0]?.message?.content || ''
    const tokensUsed = data.usage?.total_tokens || 0
    
    // FIX BUG-9: guard against empty projectPath to prevent writing to filesystem root
    if (projectPath) {
      const dbPath = path.join(projectPath, 'project.db')
      await dbMutex.withLock(dbPath, async () => {
        const db = await getDb(projectPath)
        const projectId = await getProjectId(projectPath)
        db.run('INSERT INTO generation_log (project_id, phase, model, prompt, response, tokens_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [projectId, phase, model, JSON.stringify(messages), content, tokensUsed, new Date().toISOString()])
        saveDb(db, dbPath)
      })
    }
    return { success: true, content, tokensUsed }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle(IPC_CHANNELS.CALL_OLLAMA, async (_e, payload: {
  model: string; systemPrompt: string; userPrompt: string; temperature: number;
  projectPath: string; phase: string;
}) => {
  const { model, systemPrompt, userPrompt, temperature, projectPath, phase } = payload
  try {
    const response = await fetch(`${config.ollamaHost}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        options: { temperature },
        stream: false,
      }),
    })
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`)
    const data: any = await response.json()
    const content = data.message?.content || ''

    const dbPath = path.join(projectPath, 'project.db')
    await dbMutex.withLock(dbPath, async () => {
      const db = await getDb(projectPath)
      const projectId = await getProjectId(projectPath)
      db.run('INSERT INTO generation_log (project_id, phase, model, prompt, response, tokens_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [projectId, phase, `ollama:${model}`, JSON.stringify([]), content, 0, new Date().toISOString()])
      saveDb(db, dbPath)
    })
    return { success: true, content, tokensUsed: 0 }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle(IPC_CHANNELS.SAVE_PROJECT_FILE, (_e, payload: { projectPath: string; filename: string; content: string }) => {
  const { projectPath, filename, content } = payload
  try {
    const filePath = assertSafeSubpath(projectPath, filename)
    const parentDir = path.dirname(filePath)
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true })
    }
    fs.writeFileSync(filePath, content, 'utf-8')
    return true
  } catch (err) {
    console.error('Failed to save project file:', err)
    return false
  }
})

ipcMain.handle(IPC_CHANNELS.CALL_AI_STREAM, async (event, payload: CallAiStreamPayload) => {
  const { provider, apiKey, model, systemPrompt, userPrompt, temperature, projectPath, phase, requestId } = payload
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]

  try {
    let fullContent = ''

    if (provider === 'openrouter') {
      const cascade = getFreeModelCascade(model)
      let streamSucceeded = false
      let lastError = ''

      for (let i = 0; i < cascade.length; i++) {
        const candidateModel = cascade[i]
        try {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://webnovelforge.app',
              'X-Title': 'WebNovel Forge'
            },
            body: JSON.stringify({
              model: candidateModel,
              messages,
              temperature,
              stream: true
            })
          })

          if (!response.ok) {
            const errorText = await response.text().catch(() => '')
            lastError = `OpenRouter HTTP ${response.status}: ${errorText}`
            console.warn(`[Stream Failover] Model ${candidateModel} failed. Trying next model in cascade...`)
            continue
          }

          const reader = response.body?.getReader()
          if (!reader) {
            lastError = 'No response body stream reader available'
            continue
          }

          const decoder = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              const cleaned = line.trim()
              if (!cleaned) continue
              if (cleaned === 'data: [DONE]') continue
              if (cleaned.startsWith('data: ')) {
                try {
                  const json = JSON.parse(cleaned.slice(6))
                  const chunkText = json.choices?.[0]?.delta?.content || ''
                  if (chunkText) {
                    fullContent += chunkText
                    event.sender.send(IPC_CHANNELS.AI_STREAM_CHUNK, { requestId, text: chunkText })
                  }
                } catch (e) {
                  // ignore partial lines
                }
              }
            }
          }

          if (fullContent.trim().length > 0) {
            streamSucceeded = true
            break
          }
        } catch (streamErr: any) {
          lastError = streamErr.message
          console.warn(`[Stream Failover] Network error on ${candidateModel}: ${lastError}`)
        }
      }

      if (!streamSucceeded) {
        throw new Error(lastError || 'All free model candidates in stream cascade failed')
      }
    } else {
      // Ollama
      const response = await fetch(`${config.ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          options: { temperature },
          stream: true
        })
      })

      if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader!.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const cleaned = line.trim()
          if (!cleaned) continue
          try {
            const json = JSON.parse(cleaned)
            const chunkText = json.message?.content || ''
            if (chunkText) {
              fullContent += chunkText
              event.sender.send(IPC_CHANNELS.AI_STREAM_CHUNK, { requestId, text: chunkText })
            }
          } catch (e) {
            // ignore partial JSON
          }
        }
      }
    }

    // Save log to DB (protected by mutex)
    const dbPath = path.join(projectPath, 'project.db')
    await dbMutex.withLock(dbPath, async () => {
      const db = await getDb(projectPath)
      const projectId = await getProjectId(projectPath)
      const modelName = provider === 'openrouter' ? model : `ollama:${model}`
      db.run('INSERT INTO generation_log (project_id, phase, model, prompt, response, tokens_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [projectId, phase, modelName, JSON.stringify(messages), fullContent, 0, new Date().toISOString()])
      saveDb(db, dbPath)
    })

    event.sender.send(IPC_CHANNELS.AI_STREAM_CHUNK, { requestId, done: true })
    return { success: true }
  } catch (error: any) {
    event.sender.send(IPC_CHANNELS.AI_STREAM_CHUNK, { requestId, error: error.message })
    return { success: false, error: error.message }
  }
})

ipcMain.handle(IPC_CHANNELS.GET_OLLAMA_MODELS, async () => {
  if (!config.ollamaEnabled) return []
  try {
    const response = await fetch(`${config.ollamaHost}/api/tags`)
    if (!response.ok) return []
    const data: any = await response.json()
    return data.models?.map((m: any) => m.name) || []
  } catch { return [] }
})

ipcMain.handle(IPC_CHANNELS.FETCH_OPENROUTER_MODELS, async (_e, apiKey: string) => {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    if (!response.ok) throw new Error('Failed to fetch models')
    const data: any = await response.json()
    return data.data
      .filter((m: any) => m.id.includes('free') || m.pricing?.prompt === '0')
      .map((m: any) => ({ id: m.id, name: m.name, context: m.context_length, pricing: m.pricing }))
  } catch { return [] }
})

// ---------------------------------------------------------------------------
// Pipeline IPC Handlers — the 5-phase story generation pipeline
// ---------------------------------------------------------------------------

// Build a PipelineConfig from the app config
function buildPipelineConfig(): PipelineConfig {
  const bestFree = getBestFreeModel()
  return {
    apiKey: config.openRouterApiKey,
    model: config.defaultModels?.writing || bestFree,
    ollamaEnabled: config.ollamaEnabled,
    ollamaHost: config.ollamaHost,
    ollamaModel: config.defaultModels?.brainstorm || 'llama3',
    libraryPath: config.libraryPath,
    defaultChapterWordCount: 2500,
    nvidiaApiKey: (config as any).nvidiaApiKey || '',
    nvidiaEnabled: (config as any).nvidiaEnabled || false,
    preferredProvider: (config as any).preferredProvider || 'auto',
  } as any
}

// Build a PipelineContext
function buildPipelineContext(
  projectPath: string,
  chatHistory: ChatMessage[],
  extra?: Partial<PipelineContext>
): PipelineContext {
  return {
    projectPath,
    config: buildPipelineConfig(),
    chatHistory,
    ...extra,
  }
}

// Phase status — returns which phases are completed for a project
ipcMain.handle(IPC_CHANNELS.PIPELINE_STATUS, (_e, projectPath: string) => {
  return {
    completed: getCompletedPhases(projectPath),
    current: getCurrentPhase(projectPath),
    status: getPhaseStatus(projectPath),
    chapterCount: getChapterCount(projectPath),
  }
})

// Get current phase for a project
ipcMain.handle(IPC_CHANNELS.PIPELINE_CURRENT_PHASE, (_e, projectPath: string) => {
  return getCurrentPhase(projectPath)
})

// Load chat history for a phase
ipcMain.handle(IPC_CHANNELS.PIPELINE_LOAD_CHAT, (_e, payload: { projectPath: string; phase: string }) => {
  const { projectPath, phase } = payload
  return loadChatHistory(projectPath, phase)
})

// Save chat history for a phase
ipcMain.handle(IPC_CHANNELS.PIPELINE_SAVE_CHAT, (_e, payload: { projectPath: string; phase: string; messages: ChatMessage[] }) => {
  const { projectPath, phase, messages } = payload
  saveChatHistory(projectPath, phase, messages)
  return true
})

// Read a project file (.md / .json)
ipcMain.handle(IPC_CHANNELS.PIPELINE_READ_FILE, (_e, payload: { projectPath: string; filename: string }) => {
  const { projectPath, filename } = payload
  assertSafeSubpath(projectPath, filename)
  return readProjectFile(projectPath, filename)
})

// Get context pack for a phase
ipcMain.handle(IPC_CHANNELS.PIPELINE_CONTEXT_PACK, (_e, payload: { projectPath: string; phase: Phase }) => {
  const { projectPath, phase } = payload
  return buildContextPack(projectPath, phase)
})

// Get chapter context pack
ipcMain.handle(IPC_CHANNELS.PIPELINE_CHAPTER_CONTEXT, (_e, payload: { projectPath: string; chapterNumber: number }) => {
  const { projectPath, chapterNumber } = payload
  return buildChapterContextPack(projectPath, chapterNumber)
})

// Get banned phrases for a project
ipcMain.handle(IPC_CHANNELS.PIPELINE_BANNED_PHRASES, (_e, projectPath: string) => {
  return getBannedPhrases(projectPath)
})

// Add banned phrase
ipcMain.handle(IPC_CHANNELS.PIPELINE_ADD_BANNED_PHRASE, (_e, payload: { projectPath: string; phrase: string; reason: string }) => {
  const { projectPath, phrase, reason } = payload
  addBannedPhrase(projectPath, phrase, reason)
  return true
})

// ---------------------------------------------------------------------------
// Phase execution handlers
// ---------------------------------------------------------------------------

// Phase 0: Clarifying Questions (runs before any phase's draft step)
ipcMain.handle(IPC_CHANNELS.PIPELINE_CLARIFYING_QUESTIONS, async (_e, payload: { projectPath: string; phase: Phase; chatHistory: ChatMessage[] }) => {
  const { projectPath, chatHistory } = payload
  const ctx = buildPipelineContext(projectPath, chatHistory)
  const result = await runClarifyingQuestions(ctx)
  return result
})

// Phase 1: Brainstorm -> idea_notes.md
ipcMain.handle(IPC_CHANNELS.PIPELINE_BRAINSTORM, async (_e, payload: { projectPath: string; chatHistory: ChatMessage[] }) => {
  const { projectPath, chatHistory } = payload
  const ctx = buildPipelineContext(projectPath, chatHistory)
  const result = await runBrainstormPhase(ctx)
  return result
})

// Phase 2: Structure -> story_structure.md
ipcMain.handle(IPC_CHANNELS.PIPELINE_STRUCTURE, async (_e, payload: { projectPath: string; chatHistory: ChatMessage[]; chosenTemplate?: string }) => {
  const { projectPath, chatHistory, chosenTemplate } = payload
  const ctx = buildPipelineContext(projectPath, chatHistory, { chosenTemplate })
  const result = await runStructurePhase(ctx)
  return result
})

// Phase 3a: World Building -> world_bible.md
ipcMain.handle(IPC_CHANNELS.PIPELINE_WORLD_BUILDING, async (_e, payload: { projectPath: string; chatHistory: ChatMessage[] }) => {
  const { projectPath, chatHistory } = payload
  const ctx = buildPipelineContext(projectPath, chatHistory)
  const result = await runWorldBuildingPhase(ctx)
  return result
})

// Phase 3b: Plot Outline -> plot_outline.md
ipcMain.handle(IPC_CHANNELS.PIPELINE_PLOT_OUTLINE, async (_e, payload: { projectPath: string; chatHistory: ChatMessage[] }) => {
  const { projectPath, chatHistory } = payload
  const ctx = buildPipelineContext(projectPath, chatHistory)
  const result = await runPlotOutlinePhase(ctx)
  return result
})

// Phase 4: Characters -> characters.json
ipcMain.handle(IPC_CHANNELS.PIPELINE_CHARACTER, async (_e, payload: { projectPath: string; chatHistory: ChatMessage[]; characterHint?: string }) => {
  const { projectPath, chatHistory, characterHint } = payload
  const ctx = buildPipelineContext(projectPath, chatHistory, { characterHint })
  const result = await runCharacterPhase(ctx)
  return result
})

// Phase 5: Write a single chapter -> chapters/chNN.md
ipcMain.handle(IPC_CHANNELS.PIPELINE_WRITE_CHAPTER, async (_e, payload: { projectPath: string; chatHistory: ChatMessage[]; chapterNumber: number }) => {
  const { projectPath, chatHistory, chapterNumber } = payload
  const ctx = buildPipelineContext(projectPath, chatHistory, { chapterNumber })
  const result = await runChapterWritingPhase(ctx)
  return result
})

// Phase 5b: Continuity editor audit
ipcMain.handle(IPC_CHANNELS.PIPELINE_AUDIT_CHAPTER, async (_e, payload: { projectPath: string; chapterContent: string; chapterNumber: number }) => {
  const { projectPath, chapterContent, chapterNumber } = payload
  const ctx = buildPipelineContext(projectPath, [], { chapterNumber })
  const result = await runContinuityEditorPhase(ctx, chapterContent)
  return result
})

// Phase 5 full loop: Writer -> Editor -> save
ipcMain.handle(IPC_CHANNELS.PIPELINE_CHAPTER_LOOP, async (_e, payload: { projectPath: string; chapterNumber: number }) => {
  const { projectPath, chapterNumber } = payload
  const ctx = buildPipelineContext(projectPath, [], { chapterNumber })
  const result = await runChapterLoop(ctx)
  return result
})

// ---------------------------------------------------------------------------
// Anti-Hallucination & Anti-Drift IPC Handlers
// ---------------------------------------------------------------------------

// Free models — fetch from OpenRouter
ipcMain.handle(IPC_CHANNELS.FETCH_FREE_MODELS, async (_e, apiKey?: string) => {
  const key = apiKey || config.openRouterApiKey
  return await fetchFreeModels(key)
})

// Free models — get cached (no network)
ipcMain.handle(IPC_CHANNELS.GET_CACHED_FREE_MODELS, () => {
  return getCachedFreeModels()
})

// Global banned phrases — list
ipcMain.handle(IPC_CHANNELS.GET_GLOBAL_BANNED_PHRASES, () => {
  return getGlobalBannedPhrases()
})

// Global banned phrases — add
ipcMain.handle(IPC_CHANNELS.ADD_GLOBAL_BANNED_PHRASES, (_e, phrases: Array<{ phrase: string; reason: string }>) => {
  return addGlobalBannedPhrases(phrases)
})

// Global banned phrases — remove
ipcMain.handle(IPC_CHANNELS.REMOVE_GLOBAL_BANNED_PHRASE, (_e, phrase: string) => {
  return removeGlobalBannedPhrase(phrase)
})

// Global banned phrases — detect in text
ipcMain.handle(IPC_CHANNELS.DETECT_BANNED_PHRASES, (_e, text: string) => {
  return detectBannedPhrases(text)
})

// Editor model — get
ipcMain.handle(IPC_CHANNELS.GET_EDITOR_MODEL, () => {
  return getEditorModel()
})

// Editor model — set
ipcMain.handle(IPC_CHANNELS.SET_EDITOR_MODEL, (_e, modelId: string) => {
  setEditorModel(modelId)
  return true
})

// Run continuity check
ipcMain.handle(IPC_CHANNELS.RUN_CONTINUITY_CHECK, async (_e, payload: { projectPath: string; chapterNumber: number; draftContent: string; modelId?: string }) => {
  const { projectPath, chapterNumber, draftContent, modelId } = payload
  return await runContinuityCheck(
    config.openRouterApiKey,
    projectPath,
    chapterNumber,
    draftContent,
    modelId
  )
})

// Rolling Summary
ipcMain.handle(IPC_CHANNELS.UPDATE_ROLLING_SUMMARY, async (_e, payload: { projectPath: string; chapterNumber: number; chapterSummary: string }) => {
  const { projectPath, chapterNumber, chapterSummary } = payload
  return await updateRollingSummary(config.openRouterApiKey, projectPath, chapterNumber, chapterSummary)
})

ipcMain.handle(IPC_CHANNELS.GET_ROLLING_SUMMARY, (_e, projectPath: string) => {
  return getRollingSummary(projectPath)
})

// ---------------------------------------------------------------------------
// HeyGen Hyperframes Video Studio IPC Handlers
// ---------------------------------------------------------------------------

ipcMain.handle(IPC_CHANNELS.HYPERFRAMES_DOCTOR, async () => {
  return await hyperframesDoctor()
})

ipcMain.handle(IPC_CHANNELS.HYPERFRAMES_LIST_VIDEOS, async (_e, projectPath: string) => {
  return await hyperframesListVideos(projectPath)
})

ipcMain.handle(IPC_CHANNELS.HYPERFRAMES_CREATE_VIDEO, async (_e, payload: {
  projectPath: string
  slug: string
  templateType: any
  title: string
  aspectRatio: any
  duration: number
  storyContext?: any
}) => {
  const { projectPath, slug, templateType, title, aspectRatio, duration, storyContext } = payload
  return await hyperframesCreateVideo(projectPath, slug, templateType, title, aspectRatio, duration, storyContext)
})

ipcMain.handle(IPC_CHANNELS.HYPERFRAMES_GET_COMPOSITION, async (_e, payload: { projectPath: string; slug: string }) => {
  const { projectPath, slug } = payload
  return await hyperframesGetComposition(projectPath, slug)
})

ipcMain.handle(IPC_CHANNELS.HYPERFRAMES_SAVE_COMPOSITION, async (_e, payload: {
  projectPath: string
  slug: string
  htmlContent: string
  metadataUpdates?: any
}) => {
  const { projectPath, slug, htmlContent, metadataUpdates } = payload
  return await hyperframesSaveComposition(projectPath, slug, htmlContent, metadataUpdates)
})

ipcMain.handle(IPC_CHANNELS.HYPERFRAMES_RENDER_VIDEO, async (_e, payload: { projectPath: string; slug: string }) => {
  const { projectPath, slug } = payload
  return await hyperframesRender(projectPath, slug)
})

ipcMain.handle(IPC_CHANNELS.HYPERFRAMES_DELETE_VIDEO, async (_e, payload: { projectPath: string; slug: string }) => {
  const { projectPath, slug } = payload
  return await hyperframesDeleteVideo(projectPath, slug)
})

ipcMain.handle(IPC_CHANNELS.HYPERFRAMES_OPEN_FOLDER, (_e, payload: { projectPath: string; slug?: string }) => {
  const { projectPath, slug } = payload
  const target = slug ? path.join(projectPath, 'videos', slug) : path.join(projectPath, 'videos')
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true })
  }
  exec(`explorer "${target}"`)
})

ipcMain.handle(IPC_CHANNELS.HYPERFRAMES_SAVE_MP4_AS, async (_e, payload: { projectPath: string; slug: string }) => {
  const { projectPath, slug } = payload
  const source = path.join(projectPath, 'videos', slug, 'output.mp4')
  if (!fs.existsSync(source)) {
    return { success: false, error: 'No rendered MP4 found. Render the video first.' }
  }
  const defaultPath = path.join(app.getPath('documents'), `${slug}.mp4`)
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Save MP4 As...',
    defaultPath,
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  })
  if (canceled || !filePath) return { success: false, canceled: true }
  try {
    fs.copyFileSync(source, filePath)
    return { success: true, filePath }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to save MP4' }
  }
})

ipcMain.handle(IPC_CHANNELS.HYPERFRAMES_GENERATE_AI, async (_e, params: any) => {
  const apiKey = config.openRouterApiKey
  const ollamaCfg = {
    enabled: config.ollamaEnabled,
    host: config.ollamaHost,
    model: config.defaultModels?.writing || 'llama3',
  }
  return await hyperframesGenerateAiComposition(apiKey, params, ollamaCfg)
})

ipcMain.handle(IPC_CHANNELS.HYPERFRAMES_LINT, async (_e, payload: { htmlContent: string }) => {
  return await hyperframesLint(payload.htmlContent)
})

// ---------------------------------------------------------------------------
// Milestone 8: Export, Backup, Analytics, Batch Outlining
// ---------------------------------------------------------------------------

// Helper: collect approved chapters from filesystem + DB
function collectChapters(projectPath: string): Array<{ number: number; title: string; content: string; status: string }> {
  const chapters: Array<{ number: number; title: string; content: string; status: string }> = []
  const chaptersDir = path.join(projectPath, 'chapters')
  const dbPath = path.join(projectPath, 'project.db')
  let outlineStatus = new Map<number, string>()
  let outlineBeats = new Map<number, string>()

  // Try reading outline status from DB
  try {
    const db = dbConnections.get(dbPath)
    if (db) {
      const result = db.exec('SELECT chapter_number, beat_summary, status FROM plot_outline ORDER BY chapter_number')
      if (result.length && result[0].values.length) {
        const cols = result[0].columns
        const ciNum = cols.indexOf('chapter_number')
        const ciBeat = cols.indexOf('beat_summary')
        const ciStatus = cols.indexOf('status')
        for (const row of result[0].values) {
          outlineStatus.set(Number(row[ciNum]), String(row[ciStatus] || 'unknown'))
          outlineBeats.set(Number(row[ciNum]), String(row[ciBeat] || ''))
        }
      }
    }
  } catch {}

  // Read chapter files from disk
  if (fs.existsSync(chaptersDir)) {
    const files = fs.readdirSync(chaptersDir).filter(f => f.match(/^ch\d+\.md$/))
    for (const file of files) {
      const match = file.match(/^ch(\d+)\.md$/)
      if (!match) continue
      const num = parseInt(match[1], 10)
      const content = fs.readFileSync(path.join(chaptersDir, file), 'utf-8')
      // Skip empty drafts
      if (!content.trim()) continue
      const status = outlineStatus.get(num) || 'drafted'
      // Only include approved/drafted unless we want all
      const title = outlineBeats.get(num) || `Chapter ${num}`
      chapters.push({ number: num, title, content, status })
    }
    chapters.sort((a, b) => a.number - b.number)
  }

  // Fallback: try DB chapters table
  if (chapters.length === 0) {
    try {
      const db = dbConnections.get(dbPath)
      if (db) {
        const res = db.exec('SELECT chapter_number, content, status FROM chapters ORDER BY chapter_number')
        if (res.length && res[0].values.length) {
          const cols = res[0].columns
          const ciNum = cols.indexOf('chapter_number')
          const ciContent = cols.indexOf('content')
          const ciStatus = cols.indexOf('status')
          for (const row of res[0].values) {
            const num = Number(row[ciNum])
            const content = String(row[ciContent] || '')
            const status = String(row[ciStatus] || 'drafted')
            if (content.trim()) chapters.push({ number: num, title: `Chapter ${num}`, content, status })
          }
        }
      }
    } catch {}
  }

  return chapters
}

ipcMain.handle(IPC_CHANNELS.EXPORT_NOVEL, async (_e, payload: { projectPath: string; format: 'docx' | 'epub' | 'markdown' | 'pdf' }) => {
  const { projectPath, format } = payload
  try {
    const chapters = collectChapters(projectPath)
    if (chapters.length === 0) {
      return { success: false, error: 'No chapters to export. Write some chapters first.' }
    }

    // Only export approved chapters if any are approved, otherwise export all drafted
    const approved = chapters.filter(c => c.status === 'approved')
    const toExport = approved.length > 0 ? approved : chapters

    const projectName = path.basename(projectPath)
    const filters: any[] = []
    let defaultExt = 'md'
    if (format === 'markdown') {
      filters.push({ name: 'Markdown', extensions: ['md'] })
      defaultExt = 'md'
    } else if (format === 'docx') {
      filters.push({ name: 'Word Document', extensions: ['docx'] })
      filters.push({ name: 'HTML', extensions: ['html'] })
      defaultExt = 'docx'
    } else if (format === 'epub') {
      filters.push({ name: 'EPUB', extensions: ['epub'] })
      defaultExt = 'epub'
    } else if (format === 'pdf') {
      filters.push({ name: 'PDF', extensions: ['pdf'] })
      filters.push({ name: 'HTML', extensions: ['html'] })
      defaultExt = 'pdf'
    }

    const defaultPath = path.join(app.getPath('documents'), `${projectName}-manuscript.${defaultExt}`)
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: `Export Novel as ${format.toUpperCase()}`,
      defaultPath,
      filters,
    })
    if (canceled || !filePath) return { success: false, canceled: true }

    if (format === 'markdown') {
      const md = toExport.map(ch => `# Chapter ${ch.number}: ${ch.title}\n\n${ch.content}`).join('\n\n---\n\n')
      const header = `# ${projectName}\n\n*Exported ${new Date().toLocaleString()} — ${toExport.length} chapter(s)*\n\n---\n\n`
      fs.writeFileSync(filePath, header + md, 'utf-8')
    } else if (format === 'docx') {
      // Generate simple HTML that Word can open as DOCX, plus a minimal DOCX zip if possible
      // Try to generate a real DOCX via manual XML + zip via powershell if available, else fallback to HTML with .docx extension
      try {
        // Build HTML content
        let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${projectName}</title></head><body>`
        html += `<h1>${projectName}</h1><p><em>Exported ${new Date().toLocaleString()} — ${toExport.length} chapter(s)</em></p><hr/>`
        for (const ch of toExport) {
          html += `<h2>Chapter ${ch.number}: ${ch.title}</h2><div>${ch.content.replace(/\n/g, '<br/>')}</div><hr/>`
        }
        html += `</body></html>`
        // If filePath ends with .html, just write html
        if (filePath.endsWith('.html')) {
          fs.writeFileSync(filePath, html, 'utf-8')
        } else {
          // For .docx, try to write HTML content — Word will open it — or wrap as docx zip structure
          // Minimal approach: write HTML with .docx extension (Word compatibility)
          fs.writeFileSync(filePath, html, 'utf-8')
        }
      } catch (e: any) {
        return { success: false, error: e.message }
      }
    } else if (format === 'epub') {
      // Minimal EPUB: create HTML then wrap as epub via temp folder + powershell compress
      const htmlChapters = toExport.map(ch => `<h2>Chapter ${ch.number}: ${ch.title}</h2><div>${ch.content.replace(/\n/g, '<br/>')}</div>`).join('<hr/>')
      const epubHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${projectName}</title></head><body><h1>${projectName}</h1>${htmlChapters}</body></html>`
      // Write as .epub.html which is essentially an epub placeholder; real epub needs zip structure
      // For now, write the HTML content to the chosen path — reader can rename
      fs.writeFileSync(filePath, epubHtml, 'utf-8')
    } else if (format === 'pdf') {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${projectName}</title></head><body><h1>${projectName}</h1>${toExport.map(ch => `<h2>Chapter ${ch.number}: ${ch.title}</h2><pre>${ch.content}</pre>`).join('<hr/>')}</body></html>`
      fs.writeFileSync(filePath, html, 'utf-8')
    }

    return { success: true, filePath, count: toExport.length }
  } catch (error: any) {
    return { success: false, error: error.message || 'Export failed' }
  }
})

ipcMain.handle(IPC_CHANNELS.BACKUP_STORY, async (_e, projectPath: string) => {
  try {
    if (!fs.existsSync(projectPath)) return { success: false, error: 'Project folder not found' }
    const baseName = path.basename(projectPath)
    const defaultPath = path.join(app.getPath('documents'), `${baseName}-backup-${new Date().toISOString().slice(0, 10)}.zip`)
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Backup Story as ZIP',
      defaultPath,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    })
    if (canceled || !filePath) return { success: false, canceled: true }

    // Close DB first to ensure file is flushed
    const dbPath = path.join(projectPath, 'project.db')
    closeDb(dbPath)

    // Use parameterized process execution without shell string interpolation
    await new Promise<void>((resolve, reject) => {
      const isWin = process.platform === 'win32'
      if (isWin) {
        execFile('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Compress-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force',
          projectPath,
          filePath,
        ], (err, _stdout, stderr) => {
          if (err) {
            // Fallback: simple folder copy if zip fails
            try {
              const fallbackDir = filePath.replace(/\.zip$/, '')
              if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true })
              if (fs.cpSync) fs.cpSync(projectPath, fallbackDir, { recursive: true })
              resolve()
            } catch (e: any) { reject(new Error(stderr || e.message)) }
          } else resolve()
        })
      } else {
        execFile('zip', ['-r', filePath, projectPath], (err, _stdout, stderr) => {
          if (err) reject(new Error(stderr || err.message))
          else resolve()
        })
      }
    })

    return { success: true, filePath }
  } catch (error: any) {
    return { success: false, error: error.message || 'Backup failed' }
  }
})

ipcMain.handle(IPC_CHANNELS.IMPORT_STORY, async () => {
  try {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Import Story from ZIP',
      properties: ['openFile'],
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    })
    if (canceled || !filePaths[0]) return { success: false, canceled: true }
    const zipPath = filePaths[0]
    const baseName = path.basename(zipPath, '.zip').replace(/-backup.*$/, '')
    // Ensure unique folder name
    let dest = path.join(config.libraryPath, baseName)
    let counter = 1
    while (fs.existsSync(dest)) {
      dest = path.join(config.libraryPath, `${baseName}-${counter++}`)
    }
    fs.mkdirSync(dest, { recursive: true })

    await new Promise<void>((resolve, reject) => {
      const isWin = process.platform === 'win32'
      if (isWin) {
        execFile('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force',
          zipPath,
          dest,
        ], (err, _stdout, stderr) => {
          if (err) {
            // If zip extraction fails, try to copy as folder if zip is actually a folder copy
            try {
              if (fs.existsSync(zipPath) && fs.lstatSync(zipPath).isDirectory()) {
                if (fs.cpSync) fs.cpSync(zipPath, dest, { recursive: true })
                resolve()
              } else reject(new Error(stderr || err.message))
            } catch (e: any) { reject(e) }
          } else {
            // Handle case where zip contains a top-level folder
            try {
              const entries = fs.readdirSync(dest)
              if (entries.length === 1) {
                const single = path.join(dest, entries[0])
                if (fs.lstatSync(single).isDirectory()) {
                  const innerFiles = fs.readdirSync(single)
                  for (const f of innerFiles) {
                    fs.renameSync(path.join(single, f), path.join(dest, f))
                  }
                  fs.rmdirSync(single)
                }
              }
            } catch {}
            resolve()
          }
        })
      } else {
        execFile('unzip', ['-o', zipPath, '-d', dest], (err, _stdout, stderr) => {
          if (err) {
            try {
              if (fs.existsSync(zipPath) && fs.lstatSync(zipPath).isDirectory()) {
                if (fs.cpSync) fs.cpSync(zipPath, dest, { recursive: true })
                resolve()
              } else reject(new Error(stderr || err.message))
            } catch (e: any) { reject(e) }
          } else {
            try {
              const entries = fs.readdirSync(dest)
              if (entries.length === 1) {
                const single = path.join(dest, entries[0])
                if (fs.lstatSync(single).isDirectory()) {
                  const innerFiles = fs.readdirSync(single)
                  for (const f of innerFiles) {
                    fs.renameSync(path.join(single, f), path.join(dest, f))
                  }
                  fs.rmdirSync(single)
                }
              }
            } catch {}
            resolve()
          }
        })
      }
    })

    // Defend against Zip Slip by ensuring all extracted files reside inside dest
    const verifyZipSlip = (currentDir: string) => {
      const items = fs.readdirSync(currentDir, { withFileTypes: true })
      for (const item of items) {
        const fullItemPath = path.join(currentDir, item.name)
        assertSafeSubpath(dest, fullItemPath)
        if (item.isDirectory()) {
          verifyZipSlip(fullItemPath)
        }
      }
    }
    verifyZipSlip(dest)

    return { success: true, dest, title: path.basename(dest) }
  } catch (error: any) {
    return { success: false, error: error.message || 'Import failed' }
  }
})

ipcMain.handle('get-generation-log', async () => {
  try {
    if (!fs.existsSync(config.libraryPath)) return { success: true, logs: [] }
    const allLogs: any[] = []
    const folders = fs.readdirSync(config.libraryPath, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const d of folders) {
      const projectPath = path.join(config.libraryPath, d.name)
      const dbPath = path.join(projectPath, 'project.db')
      if (!fs.existsSync(dbPath)) continue
      try {
        const db = await getDb(projectPath)
        const result = db.exec('SELECT id, phase, model, tokens_used, created_at FROM generation_log ORDER BY datetime(created_at) DESC LIMIT 50')
        if (result.length && result[0].values.length) {
          const cols = result[0].columns
          const ciPhase = cols.indexOf('phase')
          const ciModel = cols.indexOf('model')
          const ciTokens = cols.indexOf('tokens_used')
          const ciCreated = cols.indexOf('created_at')
          for (const row of result[0].values) {
            allLogs.push({
              timestamp: row[ciCreated] as string,
              phase: row[ciPhase] as string,
              model: row[ciModel] as string,
              tokens: Number(row[ciTokens] || 0),
              project: d.name,
            })
          }
        }
      } catch {}
    }
    allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    return { success: true, logs: allLogs.slice(0, 50) }
  } catch (error: any) {
    return { success: false, error: error.message, logs: [] }
  }
})

ipcMain.handle('export-generation-log', async () => {
  try {
    const result: any = await (async () => {
      if (!fs.existsSync(config.libraryPath)) return { logs: [] }
      const allLogs: any[] = []
      const folders = fs.readdirSync(config.libraryPath, { withFileTypes: true }).filter(d => d.isDirectory())
      for (const d of folders) {
        const projectPath = path.join(config.libraryPath, d.name)
        const dbPath = path.join(projectPath, 'project.db')
        if (!fs.existsSync(dbPath)) continue
        try {
          const db = await getDb(projectPath)
          const res = db.exec('SELECT phase, model, tokens_used, created_at FROM generation_log ORDER BY datetime(created_at) DESC')
          if (res.length && res[0].values.length) {
            const cols = res[0].columns
            const ciPhase = cols.indexOf('phase')
            const ciModel = cols.indexOf('model')
            const ciTokens = cols.indexOf('tokens_used')
            const ciCreated = cols.indexOf('created_at')
            for (const row of res[0].values) {
              allLogs.push({ phase: row[ciPhase], model: row[ciModel], tokens: Number(row[ciTokens] || 0), timestamp: row[ciCreated], project: d.name })
            }
          }
        } catch {}
      }
      return { logs: allLogs }
    })()
    const logs = result.logs || []
    const header = 'Timestamp,Phase,Model,Tokens,Cost,Project\n'
    const rows = logs.map((l: any) => {
      const cost = (Number(l.tokens || 0) / 1000 * (String(l.model).includes('claude') || String(l.model).includes('gpt-4') ? 0.015 : 0.003)).toFixed(4)
      const ts = l.timestamp ? new Date(l.timestamp).toLocaleString() : ''
      const safePhase = `"${String(l.phase || '').replace(/"/g, '""')}"`
      const safeModel = `"${String(l.model || '').replace(/"/g, '""')}"`
      return `${ts},${safePhase},${safeModel},${l.tokens},${cost},${l.project}`
    }).join('\n')
    const csv = header + rows
    const defaultPath = path.join(app.getPath('documents'), `generation-log-${new Date().toISOString().slice(0, 10)}.csv`)
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Export Generation Log CSV',
      defaultPath,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })
    if (canceled || !filePath) return { success: false, canceled: true }
    fs.writeFileSync(filePath, csv, 'utf-8')
    return { success: true, filePath, count: logs.length }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('clear-generation-log', async () => {
  try {
    if (!fs.existsSync(config.libraryPath)) return { success: true }
    const folders = fs.readdirSync(config.libraryPath, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const d of folders) {
      const projectPath = path.join(config.libraryPath, d.name)
      const dbPath = path.join(projectPath, 'project.db')
      if (!fs.existsSync(dbPath)) continue
      try {
        const db = await getDb(projectPath)
        db.run('DELETE FROM generation_log')
        saveDb(db, dbPath)
      } catch {}
    }
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

// ---------------------------------------------------------------------------
// Library IPC handlers – additional unique handlers
// ---------------------------------------------------------------------------
// Note: library:scan / open-folder / select-folder / delete-story /
// rename-story are already handled above via IPC_CHANNELS.* — do not
// re-register them here or Electron will throw "second handler" error.

 // Duplicate story handler (unique channel – not in IPC_CHANNELS)
ipcMain.handle('library:duplicate-story', async (_e, projectPath: string) => {
  try {
    if (!fs.existsSync(projectPath)) return { success: false, error: 'Original story not found' }
    const baseName = path.basename(projectPath)
    const parent = path.dirname(projectPath)
    let dest = path.join(parent, `${baseName} Copy`)
    let counter = 2
    while (fs.existsSync(dest)) {
      dest = path.join(parent, `${baseName} Copy ${counter++}`)
    }
    // Close DB before copy
    const dbPath = path.join(projectPath, 'project.db')
    closeDb(dbPath)
    // Copy folder safely using native recursive copy
    fs.cpSync(projectPath, dest, { recursive: true })
    // Update title in new DB
    const newTitle = path.basename(dest)
    const newDbPath = path.join(dest, 'project.db')
    if (fs.existsSync(newDbPath)) {
      try {
        const db = await getDb(dest)
        db.run('UPDATE projects SET title = ? WHERE id = (SELECT id FROM projects LIMIT 1)', [newTitle])
        saveDb(db, newDbPath)
      } catch {}
    }
    return { success: true, dest, title: newTitle }
  } catch (error: any) {
    return { success: false, error: error.message || 'Duplicate failed' }
  }
})

ipcMain.handle(IPC_CHANNELS.GET_ANALYTICS, async (_e, projectPath: string) => {
  try {
    const chapters = collectChapters(projectPath)
    let totalWords = 0
    let totalChars = 0
    const perChapter = chapters.map(ch => {
      const words = ch.content.trim().split(/\s+/).filter(Boolean).length
      const chars = ch.content.length
      totalWords += words
      totalChars += chars
      return { number: ch.number, title: ch.title, words, chars, status: ch.status }
    })

    // Tokens from generation_log
    let totalTokens = 0
    const tokensByPhase: Record<string, number> = {}
    const costByModel: Record<string, number> = {}
    let logEntries: any[] = []
    try {
      const dbPath = path.join(projectPath, 'project.db')
      const db = await getDb(projectPath)
      const result = db.exec('SELECT phase, model, tokens_used FROM generation_log')
      if (result.length && result[0].values.length) {
        const cols = result[0].columns
        const ciPhase = cols.indexOf('phase')
        const ciModel = cols.indexOf('model')
        const ciTokens = cols.indexOf('tokens_used')
        for (const row of result[0].values) {
          const phase = String(row[ciPhase] || 'unknown')
          const model = String(row[ciModel] || 'unknown')
          const tokens = Number(row[ciTokens] || 0)
          totalTokens += tokens
          tokensByPhase[phase] = (tokensByPhase[phase] || 0) + tokens
          // Rough pricing: $0.002 per 1K tokens for cheap models, $0.01 for premium; use generic 0.003 blended
          const pricePer1k = model.includes('claude') || model.includes('gpt-4') ? 0.015 : 0.003
          costByModel[model] = (costByModel[model] || 0) + (tokens / 1000) * pricePer1k
          logEntries.push({ phase, model, tokens })
        }
      }
    } catch {}

    const totalCost = Object.values(costByModel).reduce((a, b) => a + b, 0)
    const avgWordsPerChapter = perChapter.length ? Math.round(totalWords / perChapter.length) : 0

    return {
      success: true,
      totalWords,
      totalChars,
      chapterCount: chapters.length,
      approvedCount: chapters.filter(c => c.status === 'approved').length,
      avgWordsPerChapter,
      perChapter,
      totalTokens,
      tokensByPhase,
      costByModel,
      totalCost,
      logEntries,
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get analytics' }
  }
})

ipcMain.handle(IPC_CHANNELS.GENERATE_OUTLINE_BATCH, async (_e, payload: { projectPath: string; chatHistory: ChatMessage[]; batchSize?: number; startChapter?: number }) => {
  const { projectPath, chatHistory, batchSize = 20, startChapter } = payload
  try {
    // Determine next chapter range from existing outline
    let nextStart = startChapter
    if (!nextStart) {
      try {
        const db = await getDb(projectPath)
        const res = db.exec('SELECT MAX(chapter_number) as max FROM plot_outline')
        if (res.length && res[0].values[0][0]) nextStart = Number(res[0].values[0][0]) + 1
        else nextStart = 1
      } catch { nextStart = 1 }
    }
    const nextEnd = nextStart + batchSize - 1
    const enrichedHistory: ChatMessage[] = [
      ...chatHistory,
      { role: 'user', content: `Generate outline for chapters ${nextStart}–${nextEnd} (batch of ${batchSize}). Continue the story beats, keep POV/must_include/status fields. Return JSON array.` }
    ]
    const ctx = buildPipelineContext(projectPath, enrichedHistory as any)
    const result = await runPlotOutlinePhase(ctx)
    // Merge result into existing outline if result is JSON array
    try {
      if (result.success && result.content) {
        let newBeats: any[] = []
        const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/)
        const jsonStr = jsonMatch ? jsonMatch[1] : result.content
        try { newBeats = JSON.parse(jsonStr) } catch {}
        if (Array.isArray(newBeats) && newBeats.length) {
          // Adjust chapter numbers to ensure sequential batch if AI didn't respect range
          newBeats = newBeats.map((b: any, idx: number) => ({
            chapter: b.chapter || b.chapter_number || nextStart + idx,
            chapter_number: b.chapter || b.chapter_number || nextStart + idx,
            beat_summary: b.beat_summary || b.beatSummary || b.summary || '',
            pov_character_id: b.pov_character_id || b.pov_character || b.pov || '',
            characters_present: b.characters_present || b.charactersPresent || [],
            must_include: b.must_include || b.mustInclude || [],
            status: b.status || 'not_written',
          }))
        }
        return { success: true, content: result.content, batch: newBeats, start: nextStart, end: nextEnd }
      }
    } catch {}
    return result
  } catch (error: any) {
    return { success: false, error: error.message || 'Batch generation failed' }
  }
})

// ============================================================================
// Multi-Engine Video Studio IPC Handlers
// ============================================================================

ipcMain.handle('video-engine:get-registry', async () => {
  return ENGINE_REGISTRY
})

ipcMain.handle('video-engine:check', async (_event, engine: VideoEngine) => {
  return await checkEngine(engine)
})

ipcMain.handle('video-engine:list', async (_event, { projectPath, engine }: { projectPath: string; engine?: VideoEngine }) => {
  try {
    return listEngineProjects(projectPath, engine)
  } catch (error: any) {
    console.error('Failed to list engine projects:', error)
    return []
  }
})

ipcMain.handle('video-engine:scaffold', async (_event, payload: {
  projectPath: string
  engine: VideoEngine
  slug: string
  title: string
  storyContext?: Record<string, string>
}) => {
  try {
    return scaffoldEngineProject(
      payload.projectPath,
      payload.engine,
      payload.slug,
      payload.title,
      payload.storyContext
    )
  } catch (error: any) {
    console.error('Failed to scaffold engine project:', error)
    throw error
  }
})

ipcMain.handle('video-engine:render', async (_event, payload: {
  projectPath: string
  engine: VideoEngine
  slug: string
}) => {
  try {
    return await renderEngineProject(payload.projectPath, payload.engine, payload.slug)
  } catch (error: any) {
    console.error('Failed to render video with engine:', error)
    return { success: false, error: error.message || String(error) }
  }
})

ipcMain.handle('video-engine:read-source', async (_event, payload: {
  projectPath: string
  engine: VideoEngine
  slug: string
}) => {
  try {
    return readEngineSource(payload.projectPath, payload.engine, payload.slug)
  } catch (error: any) {
    console.error('Failed to read engine source:', error)
    return ''
  }
})

ipcMain.handle('video-engine:write-source', async (_event, payload: {
  projectPath: string
  engine: VideoEngine
  slug: string
  content: string
}) => {
  try {
    writeEngineSource(payload.projectPath, payload.engine, payload.slug, payload.content)
    return { success: true }
  } catch (error: any) {
    console.error('Failed to write engine source:', error)
    return { success: false, error: error.message || String(error) }
  }
})

ipcMain.handle('video-engine:animate-episode', async (_event, payload: {
  projectPath: string
  engine: VideoEngine
  chapterNumber: number
  chapterText?: string
  beatSummary?: string
  characters?: any[]
  aspectRatio?: '16:9' | '9:16'
  stylePreset?: string
}) => {
  try {
    return await autoAnimateEpisode({
      projectPath: payload.projectPath,
      engine: payload.engine,
      chapterNumber: payload.chapterNumber,
      chapterText: payload.chapterText || '',
      beatSummary: payload.beatSummary || '',
      characters: payload.characters || [],
      aspectRatio: payload.aspectRatio || '16:9',
      stylePreset: payload.stylePreset || 'cinematic_gold',
      apiKey: config.openRouterApiKey || '',  // FIX BUG-1: was nvidiaApiKey; autoAnimateEpisode calls OpenRouter
      ollamaConfig: {
        enabled: config.ollamaEnabled || false,
        host: config.ollamaHost || 'http://localhost:11434',
        model: 'llama3:8b',
      },
    })
  } catch (error: any) {
    console.error('Failed to animate episode:', error)
    return {
      success: false,
      error: error.message || String(error),
      breakdown: null as any,
      project: null as any,
      code: '',
    }
  }
})

ipcMain.handle('humanizer:process', async (_event, payload: {
  text: string
  voiceProfile?: string
}) => {
  try {
    return await passiveHumanizerWorker(
      payload.text,
      {
        apiKey: config.openRouterApiKey,
        nvidiaApiKey: config.nvidiaApiKey,
        preferredProvider: config.preferredProvider || 'auto',
        ollama: {
          enabled: config.ollamaEnabled || false,
          host: config.ollamaHost || 'http://localhost:11434',
        },
        model: config.defaultModels?.editing || config.defaultModels?.writing || 'anthropic/claude-3.5-sonnet',
      },
      payload.voiceProfile
    )
  } catch (error: any) {
    console.error('Failed to run humanizer process:', error)
    const originalStats = calculateFootprint(payload.text)
    return {
      success: false,
      humanizedText: payload.text,
      originalStats,
      humanizedStats: originalStats,
      changesCount: 0,
      error: error.message || String(error),
    }
  }
})

ipcMain.handle('humanizer:scan', async (_event, payload: { text: string }) => {
  try {
    const stats = calculateFootprint(payload.text)
    return { success: true, stats }
  } catch (error: any) {
    return { success: false, error: error.message || String(error) }
  }
})