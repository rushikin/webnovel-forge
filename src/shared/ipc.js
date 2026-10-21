"use strict";
/**
 * Shared IPC Type Definitions
 *
 * This file defines all IPC channel types for type-safe communication
 * between the main process and renderer process.
 *
 * All channels are defined here to ensure type consistency across
 * preload.ts (renderer side) and main.ts (main process side).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPC_CHANNELS = void 0;
// All channel names
exports.IPC_CHANNELS = {
    // Config
    CONFIG_GET: 'config:get',
    CONFIG_SET: 'config:set',
    CONFIG_TEST_OPENROUTER: 'config:test-openrouter',
    // Library
    LIBRARY_SCAN: 'library:scan',
    LIBRARY_CREATE_STORY: 'library:create-story',
    LIBRARY_OPEN_FOLDER: 'library:open-folder',
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
};
