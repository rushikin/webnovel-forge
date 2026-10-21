import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppConfig,
  StoryInfo,
  DbRunResult,
  CallOpenRouterPayload,
  CallOpenRouterResult,
  CallOllamaPayload,
  CallOllamaResult,
  CallAiStreamPayload,
  CallAiStreamResult,
  AiStreamChunk,
  OllamaModel,
  OpenRouterModel,
  PipelineStatus,
  ChatMessage,
  Phase,
  PipelineContext,
  BannedPhrase,
  FreeModel,
  GlobalBannedPhrase,
  ContinuityCheckResult,
  RollingSummaryResult,
  InvokeChannelName,
  EventChannelName,
} from '../shared/ipc'

// Type-safe invoke wrapper
const invoke = (channel: string, ...args: unknown[]): Promise<any> => {
  return ipcRenderer.invoke(channel, ...args)
}

// Type-safe event listener wrapper
const on = (channel: string, callback: (data: any) => void): (() => void) => {
  const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  getConfig: () => invoke('config:get'),
  saveConfig: (config: Partial<AppConfig>) => invoke('config:set', config),
  setConfig: (config: Partial<AppConfig>) => invoke('config:set', config),
  testOpenRouter: (apiKey: string, model: string) => invoke('config:test-openrouter', { apiKey, model }),

  // Library
  scanLibrary: () => invoke('library:scan'),
  getStories: () => invoke('library:scan'),
  createStory: (title: string) => invoke('library:create-story', { title }),
  openStoryFolder: (path: string) => invoke('library:open-folder', path),
  selectLibraryFolder: async () => {
    try {
      return await invoke('library:select-folder')
    } catch {
      return await invoke('select-library-folder')
    }
  },
  deleteStory: (storyPath: string) => invoke('library:delete-story', storyPath),
  renameStory: (oldPath: string, newTitle: string) => invoke('library:rename-story', { oldPath, newTitle }),

  // Database
  dbRun: (projectPath: string, sql: string, params: unknown[]) => invoke('db-run', { projectPath, sql, params }),
  dbGet: (projectPath: string, sql: string, params: unknown[]) => invoke('db-get', { projectPath, sql, params }),
  dbAll: (projectPath: string, sql: string, params: unknown[]) => invoke('db-all', { projectPath, sql, params }),
  closeDb: (projectPath: string) => invoke('close-db', projectPath),

  // AI / LLM
  callOpenRouter: (payload: CallOpenRouterPayload) => invoke('call-openrouter', payload),
  callOllama: (payload: CallOllamaPayload) => invoke('call-ollama', payload),
  callNvidia: (payload: { apiKey: string; model: string; systemPrompt: string; userPrompt: string; temperature: number; projectPath: string; phase: string }) => invoke('call-nvidia', payload),
  testNvidia: (apiKey: string, model?: string) => invoke('config:test-nvidia', { apiKey, model }),
  getOllamaModels: () => invoke('get-ollama-models'),
  fetchOpenRouterModels: (apiKey: string) => invoke('fetch-openrouter-models', apiKey),
  callAiStream: (payload: CallAiStreamPayload) => invoke('call-ai-stream', payload),
  onAiStreamChunk: (callback: (data: AiStreamChunk) => void) => on('ai-stream-chunk', callback),

  // Project Files
  saveProjectFile: (projectPath: string, filename: string, content: string) => invoke('save-project-file', { projectPath, filename, content }),

  // Pipeline
  pipelineStatus: (projectPath: string) => invoke('pipeline:status', projectPath),
  pipelineCurrentPhase: (projectPath: string) => invoke('pipeline:current-phase', projectPath),
  pipelineLoadChat: (projectPath: string, phase: string) => invoke('pipeline:load-chat', { projectPath, phase }),
  pipelineSaveChat: (projectPath: string, phase: string, messages: ChatMessage[]) => invoke('pipeline:save-chat', { projectPath, phase, messages }),
  pipelineReadFile: (projectPath: string, filename: string) => invoke('pipeline:read-file', { projectPath, filename }),
  pipelineContextPack: (projectPath: string, phase: Phase) => invoke('pipeline:context-pack', { projectPath, phase }),
  pipelineChapterContext: (projectPath: string, chapterNumber: number) => invoke('pipeline:chapter-context', { projectPath, chapterNumber }),
  pipelineBannedPhrases: (projectPath: string) => invoke('pipeline:banned-phrases', projectPath),
  pipelineAddBannedPhrase: (projectPath: string, phrase: string, reason: string) => invoke('pipeline:add-banned-phrase', { projectPath, phrase, reason }),
  pipelineClarifyingQuestions: (projectPath: string, phase: Phase, chatHistory: ChatMessage[]) => invoke('pipeline:clarifying-questions', { projectPath, phase, chatHistory }),
  pipelineBrainstorm: (projectPath: string, chatHistory: ChatMessage[]) => invoke('pipeline:brainstorm', { projectPath, chatHistory }),
  pipelineStructure: (projectPath: string, chatHistory: ChatMessage[], chosenTemplate?: string) => invoke('pipeline:structure', { projectPath, chatHistory, chosenTemplate }),
  pipelineWorldBuilding: (projectPath: string, chatHistory: ChatMessage[]) => invoke('pipeline:world-building', { projectPath, chatHistory }),
  pipelinePlotOutline: (projectPath: string, chatHistory: ChatMessage[]) => invoke('pipeline:plot-outline', { projectPath, chatHistory }),
  pipelineCharacter: (projectPath: string, chatHistory: ChatMessage[], characterHint?: string) => invoke('pipeline:character', { projectPath, chatHistory, characterHint }),
  pipelineWriteChapter: (projectPath: string, chatHistory: ChatMessage[], chapterNumber: number) => invoke('pipeline:write-chapter', { projectPath, chatHistory, chapterNumber }),
  pipelineAuditChapter: (projectPath: string, chapterContent: string, chapterNumber: number) => invoke('pipeline:audit-chapter', { projectPath, chapterContent, chapterNumber }),
  pipelineChapterLoop: (projectPath: string, chapterNumber: number) => invoke('pipeline:chapter-loop', { projectPath, chapterNumber }),

  // Free Models
  fetchFreeModels: (apiKey?: string) => invoke('fetch-free-models', apiKey),
  getCachedFreeModels: () => invoke('get-cached-free-models'),

  // Global Banned Phrases
  getGlobalBannedPhrases: () => invoke('get-global-banned-phrases'),
  addGlobalBannedPhrases: (phrases: Array<{ phrase: string; reason: string }>) => invoke('add-global-banned-phrases', phrases),
  removeGlobalBannedPhrase: (phrase: string) => invoke('remove-global-banned-phrase', phrase),
  detectBannedPhrases: (text: string) => invoke('detect-banned-phrases', text),

  // Editor Model
  getEditorModel: () => invoke('get-editor-model'),
  setEditorModel: (modelId: string) => invoke('set-editor-model', modelId),

  // Continuity Check
  runContinuityCheck: (projectPath: string, chapterNumber: number, draftContent: string, modelId?: string) => invoke('run-continuity-check', { projectPath, chapterNumber, draftContent, modelId }),

  // Rolling Summary
  updateRollingSummary: (projectPath: string, chapterNumber: number, chapterSummary: string) => invoke('update-rolling-summary', { projectPath, chapterNumber, chapterSummary }),
  getRollingSummary: (projectPath: string) => invoke('get-rolling-summary', projectPath),

  // Hyperframes Video Studio
  hyperframesDoctor: () => invoke('hyperframes:doctor'),
  hyperframesListVideos: (projectPath: string) => invoke('hyperframes:list-videos', projectPath),
  hyperframesCreateVideo: (payload: {
    projectPath: string
    slug: string
    templateType: any
    title: string
    aspectRatio: any
    duration: number
    storyContext?: any
  }) => invoke('hyperframes:create-video', payload),
  hyperframesGetComposition: (payload: { projectPath: string; slug: string }) => invoke('hyperframes:get-composition', payload),
  hyperframesSaveComposition: (payload: {
    projectPath: string
    slug: string
    htmlContent: string
    metadataUpdates?: any
  }) => invoke('hyperframes:save-composition', payload),
  hyperframesRenderVideo: (payload: { projectPath: string; slug: string }) => invoke('hyperframes:render-video', payload),
  hyperframesDeleteVideo: (payload: { projectPath: string; slug: string }) => invoke('hyperframes:delete-video', payload),
  hyperframesOpenFolder: (payload: { projectPath: string; slug?: string }) => invoke('hyperframes:open-folder', payload),
  hyperframesGenerateAi: (params: any) => invoke('hyperframes:generate-ai', params),
  hyperframesSaveMp4As: (payload: { projectPath: string; slug: string }) => invoke('hyperframes:save-mp4-as', payload),
  hyperframesLint: (payload: { htmlContent: string }) => invoke('hyperframes:lint', payload),

  // Milestone 8: Export / Backup / Analytics / Batch Outline
  exportNovel: (projectPath: string, format: 'docx' | 'epub' | 'markdown' | 'pdf') => invoke('export-novel', { projectPath, format }),
  backupStory: (projectPath: string) => invoke('backup-story', projectPath),
  importStory: () => invoke('import-story'),
  getAnalytics: (projectPath: string) => invoke('get-analytics', projectPath),
  generateOutlineBatch: (projectPath: string, chatHistory: any[], batchSize?: number, startChapter?: number) => invoke('generate-outline-batch', { projectPath, chatHistory, batchSize, startChapter }),

  // Generation Log + Duplicate
  getGenerationLog: () => invoke('get-generation-log'),
  exportGenerationLog: () => invoke('export-generation-log'),
  clearGenerationLog: () => invoke('clear-generation-log'),
  duplicateStory: (projectPath: string) => invoke('library:duplicate-story', projectPath),

  // Multi-Engine Video Studio (Hyperframes, Remotion, html-video, Motion Canvas, Manim, Prism Motion)
  videoEngineGetRegistry: () => invoke('video-engine:get-registry'),
  videoEngineCheck: (engine: string) => invoke('video-engine:check', engine),
  videoEngineList: (payload: { projectPath: string; engine?: string }) => invoke('video-engine:list', payload),
  videoEngineScaffold: (payload: { projectPath: string; engine: string; slug: string; title: string; storyContext?: any }) => invoke('video-engine:scaffold', payload),
  videoEngineRender: (payload: { projectPath: string; engine: string; slug: string }) => invoke('video-engine:render', payload),
  videoEngineReadSource: (payload: { projectPath: string; engine: string; slug: string }) => invoke('video-engine:read-source', payload),
  videoEngineWriteSource: (payload: { projectPath: string; engine: string; slug: string; content: string }) => invoke('video-engine:write-source', payload),
  videoEngineAnimateEpisode: (payload: {
    projectPath: string
    engine: string
    chapterNumber: number
    chapterText?: string
    beatSummary?: string
    characters?: any[]
    aspectRatio?: '16:9' | '9:16'
    stylePreset?: string
  }) => invoke('video-engine:animate-episode', payload),

  // Narrative Humanizer Skill
  humanizeNarrative: (payload: { text: string; voiceProfile?: string }) => invoke('humanizer:process', payload),
  scanNarrativeFootprint: (payload: { text: string }) => invoke('humanizer:scan', payload),
})

// Window.electronAPI type definitions are centralized in src/renderer/global.d.ts
