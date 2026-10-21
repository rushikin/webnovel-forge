/**
 * Shared IPC Type Definitions
 * 
 * This file defines all IPC channel types for type-safe communication
 * between the main process and renderer process.
 * 
 * All channels are defined here to ensure type consistency across
 * preload.ts (renderer side) and main.ts (main process side).
 */

import type { PipelineConfig, PipelineContext } from '../main/pipeline'

export type Phase = 'brainstorm' | 'structure' | 'world_plot' | 'characters' | 'chapters' | 'video_studio'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface BannedPhrase {
  id: number
  projectId: number
  phrase: string
  reason: string
  createdAt: string
}

export interface FreeModel {
  id: string
  name: string
  contextLength: number
  provider: string
}

export interface ContinuityCheckResult {
  success: boolean
  issues: string[]
  bannedPhrasesFound: Array<{ phrase: string; count: number }>
  summary: string
  rawResponse: string
  error?: string
}

export interface RollingSummaryResult {
  success: boolean
  summary: string
  error?: string
}

export type { PipelineConfig, PipelineContext }

// ============================================================================
// Configuration Types
// ============================================================================

export interface AppConfig {
  preferredProvider?: 'nvidia' | 'openrouter' | 'ollama' | 'auto'
  openRouterApiKey: string
  ollamaEnabled: boolean
  ollamaHost: string
  defaultModels: {
    brainstorm: string
    structure?: string
    worldPlot?: string
    characters?: string
    writing: string
    editing?: string
    editor?: string
  }
  libraryPath: string
  defaultChapterWordCount: number
  editorModel: string
  nvidiaApiKey: string
  nvidiaEnabled: boolean
}

export interface ConfigGetChannel {
  channel: 'config:get'
  request: void
  response: AppConfig
}

export interface ConfigSetChannel {
  channel: 'config:set'
  request: Partial<AppConfig>
  response: boolean
}

export interface ConfigTestOpenRouterChannel {
  channel: 'config:test-openrouter'
  request: { apiKey: string; model: string }
  response: { success: boolean; reply?: string; error?: string }
}

// ============================================================================
// Library / Project Types
// ============================================================================

export interface StoryInfo {
  id: string
  title: string
  path: string
}

export interface LibraryScanChannel {
  channel: 'library:scan'
  request: void
  response: StoryInfo[]
}

export interface LibraryCreateStoryChannel {
  channel: 'library:create-story'
  request: { title: string }
  response: { id: string; title: string; path: string }
}

export interface LibraryOpenFolderChannel {
  channel: 'library:open-folder'
  request: string
  response: void
}

// ============================================================================
// Database Types
// ============================================================================

export interface DbRunResult {
  lastInsertRowid: number
  changes: number
}

export interface DbRunChannel {
  channel: 'db-run'
  request: { projectPath: string; sql: string; params: unknown[] }
  response: DbRunResult
}

export interface DbGetChannel {
  channel: 'db-get'
  request: { projectPath: string; sql: string; params: unknown[] }
  response: Record<string, unknown> | null
}

export interface DbAllChannel {
  channel: 'db-all'
  request: { projectPath: string; sql: string; params: unknown[] }
  response: Record<string, unknown>[]
}

export interface CloseDbChannel {
  channel: 'close-db'
  request: string
  response: boolean
}

// ============================================================================
// AI / LLM Types
// ============================================================================

export interface CallOpenRouterPayload {
  apiKey: string
  model: string
  systemPrompt: string
  userPrompt: string
  temperature: number
  stream: boolean
  projectPath: string
  phase: string
}

export interface CallOpenRouterResult {
  success: boolean
  content?: string
  tokensUsed?: number
  error?: string
}

export interface CallOpenRouterChannel {
  channel: 'call-openrouter'
  request: CallOpenRouterPayload
  response: CallOpenRouterResult
}

export interface CallOllamaPayload {
  model: string
  systemPrompt: string
  userPrompt: string
  temperature: number
  projectPath: string
  phase: string
}

export interface CallOllamaResult {
  success: boolean
  content?: string
  tokensUsed?: number
  error?: string
}

export interface CallOllamaChannel {
  channel: 'call-ollama'
  request: CallOllamaPayload
  response: CallOllamaResult
}

export interface AiStreamChunk {
  requestId: string
  text?: string
  done?: boolean
  error?: string
}

export interface CallAiStreamPayload {
  provider: 'openrouter' | 'ollama'
  apiKey?: string
  model: string
  systemPrompt: string
  userPrompt: string
  temperature: number
  projectPath: string
  phase: string
  requestId: string
}

export interface CallAiStreamResult {
  success: boolean
  error?: string
}

export interface CallAiStreamChannel {
  channel: 'call-ai-stream'
  request: CallAiStreamPayload
  response: CallAiStreamResult
}

// Event channel for streaming chunks (renderer -> main sends, main -> renderer receives)
export interface AiStreamChunkEvent {
  channel: 'ai-stream-chunk'
  payload: AiStreamChunk
}

// ============================================================================
// Ollama / OpenRouter Model Types
// ============================================================================

export interface OllamaModel {
  name: string
}

export interface GetOllamaModelsChannel {
  channel: 'get-ollama-models'
  request: void
  response: string[]
}

export interface OpenRouterModel {
  id: string
  name: string
  context: number
  pricing: Record<string, unknown>
}

export interface FetchOpenRouterModelsChannel {
  channel: 'fetch-openrouter-models'
  request: string
  response: OpenRouterModel[]
}

// ============================================================================
// Project File Types
// ============================================================================

export interface SaveProjectFileChannel {
  channel: 'save-project-file'
  request: { projectPath: string; filename: string; content: string }
  response: boolean
}

// ============================================================================
// Pipeline Types
// ============================================================================

export interface PipelineStatus {
  completed: string[]
  current: string | null
  status: Record<string, 'pending' | 'in-progress' | 'completed' | 'failed'>
  chapterCount: number
}

export interface PipelineStatusChannel {
  channel: 'pipeline:status'
  request: string
  response: PipelineStatus
}

export interface PipelineCurrentPhaseChannel {
  channel: 'pipeline:current-phase'
  request: string
  response: string | null
}

export interface PipelineLoadChatChannel {
  channel: 'pipeline:load-chat'
  request: { projectPath: string; phase: string }
  response: ChatMessage[]
}

export interface PipelineSaveChatChannel {
  channel: 'pipeline:save-chat'
  request: { projectPath: string; phase: string; messages: ChatMessage[] }
  response: boolean
}

export interface PipelineReadFileChannel {
  channel: 'pipeline:read-file'
  request: { projectPath: string; filename: string }
  response: string | null
}

export interface PipelineContextPackChannel {
  channel: 'pipeline:context-pack'
  request: { projectPath: string; phase: Phase }
  response: PipelineContext
}

export interface PipelineChapterContextChannel {
  channel: 'pipeline:chapter-context'
  request: { projectPath: string; chapterNumber: number }
  response: PipelineContext
}

export interface PipelineBannedPhrasesChannel {
  channel: 'pipeline:banned-phrases'
  request: string
  response: BannedPhrase[]
}

export interface PipelineAddBannedPhraseChannel {
  channel: 'pipeline:add-banned-phrase'
  request: { projectPath: string; phrase: string; reason: string }
  response: boolean
}

// Phase execution channels
export interface PipelineClarifyingQuestionsChannel {
  channel: 'pipeline:clarifying-questions'
  request: { projectPath: string; phase: Phase; chatHistory: ChatMessage[] }
  response: { questions: string[]; context: string }
}

export interface PipelineBrainstormChannel {
  channel: 'pipeline:brainstorm'
  request: { projectPath: string; chatHistory: ChatMessage[] }
  response: { content: string; saved: boolean }
}

export interface PipelineStructureChannel {
  channel: 'pipeline:structure'
  request: { projectPath: string; chatHistory: ChatMessage[]; chosenTemplate?: string }
  response: { content: string; saved: boolean }
}

export interface PipelineWorldBuildingChannel {
  channel: 'pipeline:world-building'
  request: { projectPath: string; chatHistory: ChatMessage[] }
  response: { content: string; saved: boolean }
}

export interface PipelinePlotOutlineChannel {
  channel: 'pipeline:plot-outline'
  request: { projectPath: string; chatHistory: ChatMessage[] }
  response: { content: string; saved: boolean }
}

export interface PipelineCharacterChannel {
  channel: 'pipeline:character'
  request: { projectPath: string; chatHistory: ChatMessage[]; characterHint?: string }
  response: { content: string; saved: boolean }
}

export interface PipelineWriteChapterChannel {
  channel: 'pipeline:write-chapter'
  request: { projectPath: string; chatHistory: ChatMessage[]; chapterNumber: number }
  response: { content: string; saved: boolean }
}

export interface PipelineAuditChapterChannel {
  channel: 'pipeline:audit-chapter'
  request: { projectPath: string; chapterContent: string; chapterNumber: number }
  response: { issues: string[]; score: number; passed: boolean }
}

export interface PipelineChapterLoopChannel {
  channel: 'pipeline:chapter-loop'
  request: { projectPath: string; chapterNumber: number }
  response: { content: string; saved: boolean; iterations: number }
}

// ============================================================================
// Free Models Types
// ============================================================================

export interface FetchFreeModelsChannel {
  channel: 'fetch-free-models'
  request: string | undefined
  response: FreeModel[]
}

export interface GetCachedFreeModelsChannel {
  channel: 'get-cached-free-models'
  request: void
  response: FreeModel[]
}

// ============================================================================
// Global Banned Phrases Types
// ============================================================================

export interface GlobalBannedPhrase {
  phrase: string
  reason: string
  addedAt: string
}

export interface GetGlobalBannedPhrasesChannel {
  channel: 'get-global-banned-phrases'
  request: void
  response: GlobalBannedPhrase[]
}

export interface AddGlobalBannedPhrasesChannel {
  channel: 'add-global-banned-phrases'
  request: { phrase: string; reason: string }[]
  response: GlobalBannedPhrase[]
}

export interface RemoveGlobalBannedPhraseChannel {
  channel: 'remove-global-banned-phrase'
  request: string
  response: GlobalBannedPhrase[]
}

export interface DetectBannedPhrasesChannel {
  channel: 'detect-banned-phrases'
  request: string
  response: { phrase: string; count: number; positions: number[] }[]
}

// ============================================================================
// Editor Model Types
// ============================================================================

export interface GetEditorModelChannel {
  channel: 'get-editor-model'
  request: void
  response: string
}

export interface SetEditorModelChannel {
  channel: 'set-editor-model'
  request: string
  response: boolean
}

// ============================================================================
// Continuity Check Types
// ============================================================================

export interface RunContinuityCheckChannel {
  channel: 'run-continuity-check'
  request: { projectPath: string; chapterNumber: number; draftContent: string; modelId?: string }
  response: ContinuityCheckResult
}

// ============================================================================
// Rolling Summary Types
// ============================================================================

export interface UpdateRollingSummaryChannel {
  channel: 'update-rolling-summary'
  request: { projectPath: string; chapterNumber: number; chapterSummary: string }
  response: RollingSummaryResult
}

export interface GetRollingSummaryChannel {
  channel: 'get-rolling-summary'
  request: string
  response: string
}

// ============================================================================
// Union Types for All Channels
// ============================================================================

export type InvokeChannels =
  | ConfigGetChannel
  | ConfigSetChannel
  | ConfigTestOpenRouterChannel
  | LibraryScanChannel
  | LibraryCreateStoryChannel
  | LibraryOpenFolderChannel
  | DbRunChannel
  | DbGetChannel
  | DbAllChannel
  | CloseDbChannel
  | CallOpenRouterChannel
  | CallOllamaChannel
  | CallAiStreamChannel
  | GetOllamaModelsChannel
  | FetchOpenRouterModelsChannel
  | SaveProjectFileChannel
  | PipelineStatusChannel
  | PipelineCurrentPhaseChannel
  | PipelineLoadChatChannel
  | PipelineSaveChatChannel
  | PipelineReadFileChannel
  | PipelineContextPackChannel
  | PipelineChapterContextChannel
  | PipelineBannedPhrasesChannel
  | PipelineAddBannedPhraseChannel
  | PipelineClarifyingQuestionsChannel
  | PipelineBrainstormChannel
  | PipelineStructureChannel
  | PipelineWorldBuildingChannel
  | PipelinePlotOutlineChannel
  | PipelineCharacterChannel
  | PipelineWriteChapterChannel
  | PipelineAuditChapterChannel
  | PipelineChapterLoopChannel
  | FetchFreeModelsChannel
  | GetCachedFreeModelsChannel
  | GetGlobalBannedPhrasesChannel
  | AddGlobalBannedPhrasesChannel
  | RemoveGlobalBannedPhraseChannel
  | DetectBannedPhrasesChannel
  | GetEditorModelChannel
  | SetEditorModelChannel
  | RunContinuityCheckChannel
  | UpdateRollingSummaryChannel
  | GetRollingSummaryChannel

export type EventChannels = AiStreamChunkEvent

// Helper types for extracting request/response types
export type InvokeRequest<T extends InvokeChannels> = T['request']
export type InvokeResponse<T extends InvokeChannels> = T['response']
export type EventPayload<T extends EventChannels> = T['payload']

// Channel name literals for type-safe usage
export type InvokeChannelName = InvokeChannels['channel']
export type EventChannelName = EventChannels['channel']

// All channel names
export const IPC_CHANNELS = {
  // Config
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_TEST_OPENROUTER: 'config:test-openrouter',
  
  // Library
  LIBRARY_SCAN: 'library:scan',
  LIBRARY_CREATE_STORY: 'library:create-story',
  LIBRARY_OPEN_FOLDER: 'library:open-folder',
  LIBRARY_SELECT_FOLDER: 'library:select-folder',
  LIBRARY_DELETE_STORY: 'library:delete-story',
  LIBRARY_RENAME_STORY: 'library:rename-story',
  
  // Database
  DB_RUN: 'db-run',
  DB_GET: 'db-get',
  DB_ALL: 'db-all',
  CLOSE_DB: 'close-db',
  
  // AI
  CALL_OPENROUTER: 'call-openrouter',
  CALL_OLLAMA: 'call-ollama',
  CALL_AI_STREAM: 'call-ai-stream',
  AI_STREAM_CHUNK: 'ai-stream-chunk',
  
  // Models
  GET_OLLAMA_MODELS: 'get-ollama-models',
  FETCH_OPENROUTER_MODELS: 'fetch-openrouter-models',
  
  // Project Files
  SAVE_PROJECT_FILE: 'save-project-file',
  
  // Pipeline
  PIPELINE_STATUS: 'pipeline:status',
  PIPELINE_CURRENT_PHASE: 'pipeline:current-phase',
  PIPELINE_LOAD_CHAT: 'pipeline:load-chat',
  PIPELINE_SAVE_CHAT: 'pipeline:save-chat',
  PIPELINE_READ_FILE: 'pipeline:read-file',
  PIPELINE_CONTEXT_PACK: 'pipeline:context-pack',
  PIPELINE_CHAPTER_CONTEXT: 'pipeline:chapter-context',
  PIPELINE_BANNED_PHRASES: 'pipeline:banned-phrases',
  PIPELINE_ADD_BANNED_PHRASE: 'pipeline:add-banned-phrase',
  PIPELINE_CLARIFYING_QUESTIONS: 'pipeline:clarifying-questions',
  PIPELINE_BRAINSTORM: 'pipeline:brainstorm',
  PIPELINE_STRUCTURE: 'pipeline:structure',
  PIPELINE_WORLD_BUILDING: 'pipeline:world-building',
  PIPELINE_PLOT_OUTLINE: 'pipeline:plot-outline',
  PIPELINE_CHARACTER: 'pipeline:character',
  PIPELINE_WRITE_CHAPTER: 'pipeline:write-chapter',
  PIPELINE_AUDIT_CHAPTER: 'pipeline:audit-chapter',
  PIPELINE_CHAPTER_LOOP: 'pipeline:chapter-loop',
  
  // Free Models
  FETCH_FREE_MODELS: 'fetch-free-models',
  GET_CACHED_FREE_MODELS: 'get-cached-free-models',
  
  // Global Banned Phrases
  GET_GLOBAL_BANNED_PHRASES: 'get-global-banned-phrases',
  ADD_GLOBAL_BANNED_PHRASES: 'add-global-banned-phrases',
  REMOVE_GLOBAL_BANNED_PHRASE: 'remove-global-banned-phrase',
  DETECT_BANNED_PHRASES: 'detect-banned-phrases',
  
  // Editor Model
  GET_EDITOR_MODEL: 'get-editor-model',
  SET_EDITOR_MODEL: 'set-editor-model',
  
  // Continuity Check
  RUN_CONTINUITY_CHECK: 'run-continuity-check',
  
  // Rolling Summary
  UPDATE_ROLLING_SUMMARY: 'update-rolling-summary',
  GET_ROLLING_SUMMARY: 'get-rolling-summary',

  // Hyperframes Video Studio
  HYPERFRAMES_DOCTOR: 'hyperframes:doctor',
  HYPERFRAMES_LIST_VIDEOS: 'hyperframes:list-videos',
  HYPERFRAMES_CREATE_VIDEO: 'hyperframes:create-video',
  HYPERFRAMES_GET_COMPOSITION: 'hyperframes:get-composition',
  HYPERFRAMES_SAVE_COMPOSITION: 'hyperframes:save-composition',
  HYPERFRAMES_RENDER_VIDEO: 'hyperframes:render-video',
  HYPERFRAMES_DELETE_VIDEO: 'hyperframes:delete-video',
  HYPERFRAMES_OPEN_FOLDER: 'hyperframes:open-folder',
  HYPERFRAMES_GENERATE_AI: 'hyperframes:generate-ai',
  HYPERFRAMES_SAVE_MP4_AS: 'hyperframes:save-mp4-as',
  HYPERFRAMES_LINT: 'hyperframes:lint',

  // Multi-Engine Video Studio (Hyperframes, Remotion, html-video, Motion Canvas, Manim, Prism Motion)
  VIDEO_ENGINE_CHECK: 'video-engine:check',
  VIDEO_ENGINE_LIST: 'video-engine:list',
  VIDEO_ENGINE_SCAFFOLD: 'video-engine:scaffold',
  VIDEO_ENGINE_RENDER: 'video-engine:render',
  VIDEO_ENGINE_READ_SOURCE: 'video-engine:read-source',
  VIDEO_ENGINE_WRITE_SOURCE: 'video-engine:write-source',
  VIDEO_ENGINE_GET_REGISTRY: 'video-engine:get-registry',

  // Milestone 8 Polish & Export
  EXPORT_NOVEL: 'export-novel',
  BACKUP_STORY: 'backup-story',
  IMPORT_STORY: 'import-story',
  GET_ANALYTICS: 'get-analytics',
  GENERATE_OUTLINE_BATCH: 'generate-outline-batch',
} as const
