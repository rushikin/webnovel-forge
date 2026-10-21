export {}

declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<any>
      saveConfig: (config: any) => Promise<any>
      setConfig: (config: any) => Promise<any>
      selectLibraryFolder: () => Promise<string | null>
      scanLibrary: () => Promise<any[]>
      getStories: () => Promise<any[]>
      createStory: (title: string) => Promise<any>
      openStoryFolder: (path: string) => Promise<void>
      deleteStory: (projectPath: string) => Promise<{ success: boolean; error?: string }>
      renameStory: (oldPath: string, newTitle: string) => Promise<{ success: boolean; newPath?: string; newTitle?: string; error?: string }>
      getProjectDb: (projectPath: string) => Promise<any>
      dbRun: (projectPath: string, sql: string, params: any[]) => Promise<any>
      dbGet: (projectPath: string, sql: string, params: any[]) => Promise<any>
      dbAll: (projectPath: string, sql: string, params: any[]) => Promise<any>
      testOpenRouter: (apiKey: string, model: string) => Promise<{ success: boolean; error?: string; reply?: string }>
      callOpenRouter: (payload: any) => Promise<any>
      callOllama: (payload: any) => Promise<any>
      callNvidia: (payload: any) => Promise<any>
      testNvidia: (apiKey: string, model?: string) => Promise<{ success: boolean; error?: string; reply?: string }>
      getOllamaModels: () => Promise<string[]>
      fetchOpenRouterModels: (apiKey: string) => Promise<any[]>
      saveProjectFile: (projectPath: string, filename: string, content: string) => Promise<boolean>
      callAiStream: (payload: any) => Promise<any>
      onAiStreamChunk: (callback: (data: { requestId: string; text?: string; done?: boolean; error?: string }) => void) => () => void

      // Pipeline
      pipelineStatus: (projectPath: string) => Promise<{
        completed: string[]
        current: string
        status: Record<string, boolean>
        chapterCount: number
      }>
      pipelineCurrentPhase: (projectPath: string) => Promise<string>
      pipelineLoadChat: (projectPath: string, phase: string) => Promise<any[]>
      pipelineSaveChat: (projectPath: string, phase: string, messages: any[]) => Promise<boolean>
      pipelineReadFile: (projectPath: string, filename: string) => Promise<string | null>
      pipelineContextPack: (projectPath: string, phase: string) => Promise<string>
      pipelineChapterContext: (projectPath: string, chapterNumber: number) => Promise<any>
      pipelineBannedPhrases: (projectPath: string) => Promise<string[]>
      pipelineAddBannedPhrase: (projectPath: string, phrase: string, reason: string) => Promise<boolean>
      pipelineClarifyingQuestions: (projectPath: string, phase: string, chatHistory: any[]) => Promise<any>
      pipelineBrainstorm: (projectPath: string, chatHistory: any[]) => Promise<any>
      pipelineStructure: (projectPath: string, chatHistory: any[], chosenTemplate?: string) => Promise<any>
      pipelineWorldBuilding: (projectPath: string, chatHistory: any[]) => Promise<any>
      pipelinePlotOutline: (projectPath: string, chatHistory: any[]) => Promise<any>
      pipelineCharacter: (projectPath: string, chatHistory: any[], characterHint?: string) => Promise<any>
      pipelineWriteChapter: (projectPath: string, chatHistory: any[], chapterNumber: number) => Promise<any>
      pipelineAuditChapter: (projectPath: string, chapterContent: string, chapterNumber: number) => Promise<any>
      pipelineChapterLoop: (projectPath: string, chapterNumber: number) => Promise<any>

      // Anti-Hallucination & Anti-Drift System
      fetchFreeModels: (apiKey?: string) => Promise<Array<{ id: string; name: string; contextLength: number; provider: string }>>
      getCachedFreeModels: () => Promise<Array<{ id: string; name: string; contextLength: number; provider: string }>>
      getGlobalBannedPhrases: () => Promise<Array<{ phrase: string; reason: string; addedAt: string }>>
      addGlobalBannedPhrases: (phrases: Array<{ phrase: string; reason: string }>) => Promise<Array<{ phrase: string; reason: string; addedAt: string }>>
      removeGlobalBannedPhrase: (phrase: string) => Promise<Array<{ phrase: string; reason: string; addedAt: string }>>
      detectBannedPhrases: (text: string) => Promise<Array<{ phrase: string; count: number; positions: number[] }>>
      getEditorModel: () => Promise<string>
      setEditorModel: (modelId: string) => Promise<boolean>
      runContinuityCheck: (projectPath: string, chapterNumber: number, draftContent: string, modelId?: string) => Promise<{
        success: boolean
        issues: string[]
        bannedPhrasesFound: Array<{ phrase: string; count: number }>
        summary: string
        rawResponse: string
        error?: string
      }>
      // Rolling Summary
      updateRollingSummary: (projectPath: string, chapterNumber: number, chapterSummary: string) => Promise<void>
      getRollingSummary: (projectPath: string) => Promise<string>

      // Milestone 8: Export / Backup / Analytics / Outline Batch
      exportNovel: (projectPath: string, format: 'docx' | 'epub' | 'markdown' | 'pdf') => Promise<{ success: boolean; filePath?: string; count?: number; error?: string; canceled?: boolean }>
      backupStory: (projectPath: string) => Promise<{ success: boolean; filePath?: string; error?: string; canceled?: boolean }>
      importStory: () => Promise<{ success: boolean; dest?: string; title?: string; error?: string; canceled?: boolean }>
      getAnalytics: (projectPath: string) => Promise<{ success: boolean; totalWords: number; totalChars: number; chapterCount: number; approvedCount: number; avgWordsPerChapter: number; perChapter: any[]; totalTokens: number; tokensByPhase: Record<string, number>; costByModel: Record<string, number>; totalCost: number; logEntries: any[]; error?: string }>
      generateOutlineBatch: (projectPath: string, chatHistory: any[], batchSize?: number, startChapter?: number) => Promise<{ success: boolean; content?: string; batch?: any[]; start?: number; end?: number; error?: string }>
      getGenerationLog: () => Promise<{ success: boolean; logs: Array<{ timestamp: string; phase: string; model: string; tokens: number; project: string }>; error?: string }>
      exportGenerationLog: () => Promise<{ success: boolean; filePath?: string; count?: number; error?: string; canceled?: boolean }>
      clearGenerationLog: () => Promise<{ success: boolean; error?: string }>
      duplicateStory: (projectPath: string) => Promise<{ success: boolean; dest?: string; title?: string; error?: string }>

      // HeyGen Hyperframes Video Studio
      hyperframesDoctor: () => Promise<import('./types').VideoDoctorStatus>
      hyperframesListVideos: (projectPath: string) => Promise<import('./types').HyperframesVideo[]>
      hyperframesCreateVideo: (payload: {
        projectPath: string
        slug: string
        templateType: import('./types').VideoTemplateType
        title: string
        aspectRatio: import('./types').VideoAspectRatio
        duration: number
        storyContext?: any
      }) => Promise<import('./types').HyperframesVideo>
      hyperframesGetComposition: (payload: { projectPath: string; slug: string }) => Promise<import('./types').HyperframesVideo | null>
      hyperframesSaveComposition: (payload: {
        projectPath: string
        slug: string
        htmlContent: string
        metadataUpdates?: Partial<import('./types').VideoMetadata>
      }) => Promise<import('./types').HyperframesVideo>
      hyperframesRenderVideo: (payload: { projectPath: string; slug: string }) => Promise<import('./types').RenderResult>
      hyperframesDeleteVideo: (payload: { projectPath: string; slug: string }) => Promise<boolean>
      hyperframesOpenFolder: (payload: { projectPath: string; slug?: string }) => Promise<void>
      hyperframesGenerateAi: (params: import('./types').AiVideoGenParams) => Promise<string>
      hyperframesLint: (payload: { htmlContent: string }) => Promise<{ valid: boolean; errors: string[]; warnings: string[] }>

      // Multi-Engine Video Studio (Hyperframes, Remotion, html-video, Motion Canvas, Manim, Prism Motion)
      videoEngineGetRegistry: () => Promise<Record<string, any>>
      videoEngineCheck: (engine: string) => Promise<{
        engine: string
        ready: boolean
        nodeReady?: boolean
        pythonReady?: boolean
        ffmpegReady?: boolean
        issues: string[]
        suggestions: string[]
      }>
      videoEngineList: (payload: { projectPath: string; engine?: string }) => Promise<any[]>
      videoEngineScaffold: (payload: { projectPath: string; engine: string; slug: string; title: string; storyContext?: any }) => Promise<any>
      videoEngineRender: (payload: { projectPath: string; engine: string; slug: string }) => Promise<{ success: boolean; outputPath?: string; error?: string; durationMs?: number }>
      videoEngineReadSource: (payload: { projectPath: string; engine: string; slug: string }) => Promise<string>
      videoEngineWriteSource: (payload: { projectPath: string; engine: string; slug: string; content: string }) => Promise<{ success: boolean; error?: string }>
      videoEngineAnimateEpisode: (payload: {
        projectPath: string
        engine: string
        chapterNumber: number
        chapterText?: string
        beatSummary?: string
        characters?: any[]
        aspectRatio?: '16:9' | '9:16'
        stylePreset?: string
      }) => Promise<import('./types').AnimateEpisodeResult>

      // Narrative Humanizer Skill
      humanizeNarrative: (payload: { text: string; voiceProfile?: string }) => Promise<import('./types').HumanizerResult>
      scanNarrativeFootprint: (payload: { text: string }) => Promise<{ success: boolean; stats: import('./types').FootprintStats }>
    }
  }
}

