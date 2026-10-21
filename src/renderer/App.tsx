import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { LibraryScreen } from './pages/LibraryScreen';
import { SettingsScreen } from './pages/SettingsScreen';
import { StoryWorkspace } from './pages/StoryWorkspace';
import { ChatBotCorner } from './components/ChatBotCorner';
import type { AppConfig, StoryProject, Phase } from './types';

interface AppContextType {
  config: AppConfig;
  setConfig: (config: Partial<AppConfig>) => void;
  currentPhase: Phase;
  setCurrentPhase: (phase: Phase) => void;
  currentStory: StoryProject | null;
  setCurrentStory: (story: StoryProject | null) => void;
  stories: StoryProject[];
  setStories: (stories: StoryProject[]) => void;
  storyData: any;
  setStoryData: (data: any) => void;
  chatHistory: any[];
  setChatHistory: (history: any[]) => void;
  loadStories: () => Promise<void>;
  createStory: (title: string) => Promise<void>;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}

const DEFAULT_CONFIG: AppConfig = {
  openRouterApiKey: '',
  openRouterModel: 'openrouter/free',
  openRouterModels: [],
  ollamaEnabled: false,
  ollamaHost: 'http://localhost:11434',
  ollamaModel: '',
  libraryPath: '',
  defaultChapterWordCount: 2500,
  theme: 'dark',
  editorModel: 'openrouter/free',
  nvidiaApiKey: '',
  nvidiaEnabled: false,
  preferredProvider: 'auto',
};

const STORAGE_KEY = 'webnovel-forge-config';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfigState] = useState<AppConfig>(DEFAULT_CONFIG);
  const [currentPhase, setCurrentPhase] = useState<Phase>('brainstorm');
  const [currentStory, setCurrentStory] = useState<StoryProject | null>(null);
  const [stories, setStories] = useState<StoryProject[]>([]);
  const [storyData, setStoryData] = useState<any>({});
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  // Load config & sync with Electron backend
  useEffect(() => {
    async function initConfig() {
      let merged: AppConfig = { ...DEFAULT_CONFIG }
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          merged = { ...merged, ...parsed }
        } catch (e) {
          console.error('Failed to parse config:', e)
        }
      }

      if (window.electronAPI?.getConfig) {
        try {
          const electronConfig = await window.electronAPI.getConfig()
          if (electronConfig) {
            // Merge electron config with localStorage config (prefer non-empty values)
            merged = {
              ...merged,
              ...electronConfig,
              openRouterApiKey: merged.openRouterApiKey || electronConfig.openRouterApiKey || '',
              nvidiaApiKey: (merged as any).nvidiaApiKey || (electronConfig as any).nvidiaApiKey || '',
              nvidiaEnabled: (merged as any).nvidiaEnabled ?? (electronConfig as any).nvidiaEnabled ?? false,
              preferredProvider: (merged as any).preferredProvider || (electronConfig as any).preferredProvider || 'auto',
            }
          }
          // Push synced config back to main process to guarantee sync
          await window.electronAPI.setConfig(merged)
        } catch (e) {
          console.error('Failed to sync config with Electron main process:', e)
        }
      }

      setConfigState(merged)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
      } catch {}
    }

    initConfig()
  }, [])

  // Save config
  const setConfig = useCallback((updates: Partial<AppConfig>) => {
    setConfigState(prev => {
      const next = { ...prev, ...updates }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {}
      // Sync immediately with Electron main process
      if (window.electronAPI?.setConfig) {
        window.electronAPI.setConfig(next).catch((err: any) => {
          console.error('Failed to sync setConfig with Electron:', err)
        })
      }
      return next
    })
  }, [])

  const loadStories = useCallback(async () => {
    if (!config.libraryPath) return;
    try {
      const result = await (window as any).electronAPI.scanLibrary();
      setStories(result);
    } catch (e) {
      console.error('Failed to load stories:', e);
    }
  }, [config.libraryPath]);

  const createStory = useCallback(async (title: string) => {
    if (!config.libraryPath) return;
    try {
      const story = await (window as any).electronAPI.createStory(title);
      setStories(prev => [...prev, story]);
      setCurrentStory(story);
      setCurrentPhase('brainstorm');
    } catch (e) {
      console.error('Failed to create story:', e);
    }
  }, [config.libraryPath]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  return (
    <AppContext.Provider
      value={{
        config,
        setConfig,
        currentPhase,
        setCurrentPhase,
        currentStory,
        setCurrentStory,
        stories,
        setStories,
        storyData,
        setStoryData,
        chatHistory,
        setChatHistory,
        loadStories,
        createStory,
        showSettings,
        setShowSettings,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export default function App() {
  const { config, currentStory, showSettings } = useApp();

  // Theme handling: toggle .light class on root html element
  useEffect(() => {
    if (config.theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [config.theme]);

  const hasAiConfigured = Boolean(
    config.openRouterApiKey ||
    (config as any).nvidiaApiKey ||
    config.ollamaEnabled
  );
  const isFirstRun = !config.libraryPath || !hasAiConfigured;

  if (showSettings || isFirstRun) {
    return <SettingsScreen firstRun={isFirstRun} />;
  }

  if (!currentStory) {
    return (
      <>
        <LibraryScreen />
        <ChatBotCorner />
      </>
    );
  }

  return (
    <>
      <StoryWorkspace />
      <ChatBotCorner />
    </>
  );
}
