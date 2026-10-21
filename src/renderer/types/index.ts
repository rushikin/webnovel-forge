// Types for the application

export type Phase = 'brainstorm' | 'structure' | 'world_plot' | 'characters' | 'chapters' | 'video_studio'

export interface AppConfig {
  preferredProvider?: 'nvidia' | 'openrouter' | 'ollama' | 'auto'
  openRouterApiKey: string
  openRouterModel: string
  openRouterModels: string[]
  ollamaEnabled: boolean
  ollamaHost: string
  ollamaModel: string
  libraryPath: string
  defaultChapterWordCount: number
  theme: 'dark' | 'light'
  editorModel: string
  nvidiaApiKey: string
  nvidiaEnabled: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  phase?: Phase
  isStreaming?: boolean
}

export interface StoryProject {
  id: string
  title: string
  path: string
  createdAt: string
  updatedAt: string
  phasesCompleted: Phase[]
  chapterCount: number
  wordCount: number
  lastEdited?: string
}

export interface CharacterSheet {
  id: string
  name: string
  role: string
  appearance: string
  personality_traits: string[]
  voice_fingerprint: string
  backstory: string
  relationships: Array<{ with: string; type: string }>
  arc_goal: string
  locked_facts: string[]
  current_state: string
}

export interface OutlineBeat {
  chapter: number
  povCharacter: string
  beatSummary: string
  charactersPresent: string[]
  mustInclude: string[]
  status: 'not_written' | 'drafted' | 'edited' | 'approved'
}

export interface WorldBible {
  setting: string
  magicSystem: string
  factions: string[]
  timeline: string
  locations: string[]
}

export interface GenerationLog {
  id: number
  projectId: number
  phase: string
  model: string
  prompt: string
  response: string
  tokensUsed: number
  createdAt: string
}

export interface BannedPhrase {
  id: number
  projectId: number
  phrase: string
  reason: string
  createdAt: string
}

export interface RollingSummary {
  content: string
  lastChapterCovered: number
}

// ---------------------------------------------------------------------------
// HeyGen Hyperframes Video Types
// ---------------------------------------------------------------------------

export type VideoTemplateType =
  | 'book_trailer'
  | 'character_spotlight'
  | 'chapter_teaser'
  | 'lore_explainer'
  | 'motion_sting'
  | 'custom'

export type VideoAspectRatio = '16:9' | '9:16' | '1:1'

export interface VideoMetadata {
  slug: string
  title: string
  templateType: VideoTemplateType
  aspectRatio: VideoAspectRatio
  width: number
  height: number
  duration: number
  createdAt: string
  updatedAt: string
  renderedMp4Path?: string
  hasRenderedVideo: boolean
  description?: string
  targetChapter?: number
  targetCharacterId?: string
}

export interface HyperframesVideo {
  metadata: VideoMetadata
  htmlContent: string
  fullPath: string
}

export interface VideoDoctorStatus {
  nodeInstalled: boolean
  nodeVersion: string
  nodeVersionOk: boolean
  ffmpegInstalled: boolean
  ffmpegVersion: string
  npxInstalled: boolean
  hyperframesInstalled: boolean
  allReady: boolean
  diagnostics: string[]
}

export interface RenderResult {
  success: boolean
  outputPath?: string
  error?: string
  logs: string
}

export interface AiVideoGenParams {
  projectPath: string
  title: string
  templateType: VideoTemplateType
  aspectRatio: VideoAspectRatio
  duration: number
  stylePreset: 'cinematic_gold' | 'dark_fantasy' | 'cyberpunk_neon' | 'vintage_parchment' | 'celestial_anime'
  storyContext: {
    premise?: string
    worldSetting?: string
    chapterNumber?: number
    chapterBeat?: string
    characterName?: string
    characterVoice?: string
    customInstructions?: string
  }
}

// ---------------------------------------------------------------------------
// Multi-Engine Video Types
// ---------------------------------------------------------------------------

export type VideoEngine =
  | 'hyperframes'
  | 'remotion'
  | 'html-video'
  | 'motion-canvas'
  | 'manim'
  | 'prism-motion'

export interface EngineInfo {
  id: VideoEngine
  name: string
  description: string
  language: 'html' | 'react' | 'typescript' | 'python'
  renderCmd: string
  requiresPython: boolean
  requiresNode: boolean
  githubUrl: string
  docUrl: string
  installCmd: string
}

export interface EngineCheckResult {
  engine: VideoEngine
  ready: boolean
  nodeReady?: boolean
  pythonReady?: boolean
  ffmpegReady?: boolean
  issues: string[]
  suggestions: string[]
}

export interface EngineProject {
  engine: VideoEngine
  slug: string
  title: string
  projectPath: string
  engineProjectPath: string
  createdAt: string
  lastRenderAt?: string
  outputMp4?: string
}

export interface EngineRenderResult {
  success: boolean
  outputPath?: string
  error?: string
  durationMs?: number
}

export interface EpisodeDialogue {
  speaker: string
  text: string
  emotion?: string
  voiceTone?: string
}

export interface EpisodeScene {
  sceneIndex: number
  title: string
  setting: string
  durationSeconds: number
  charactersPresent: string[]
  actionDescription: string
  conversations: EpisodeDialogue[]
}

export interface EpisodeBreakdown {
  episodeNumber: number
  title: string
  summary: string
  totalDurationSeconds: number
  scenes: EpisodeScene[]
}

export interface AnimateEpisodeResult {
  success: boolean
  breakdown?: EpisodeBreakdown
  project?: EngineProject
  code?: string
  error?: string
}

export interface FootprintStats {
  sentenceCount: number
  wordCount: number
  avgSentenceLength: number
  sentenceLengthStdDev: number
  burstinessScore: number
  detectedSlopCount: number
  slopTermsFound: string[]
}

export interface HumanizerResult {
  success: boolean
  humanizedText: string
  originalStats: FootprintStats
  humanizedStats: FootprintStats
  changesCount: number
  error?: string
}