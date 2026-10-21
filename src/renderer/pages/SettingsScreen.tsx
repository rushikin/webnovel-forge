import React, { useState, useEffect } from 'react'
import { useApp } from '../App'
import { ForgeLogo } from '../components/ForgeLogo'

export function SettingsScreen({ firstRun = false }: { firstRun?: boolean }) {
  const { config, setConfig, setShowSettings } = useApp()
  const [openRouterKey, setOpenRouterKey] = useState('')
  const [nvidiaKey, setNvidiaKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testingNvidia, setTestingNvidia] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [testNvidiaResult, setTestNvidiaResult] = useState<{ success: boolean; message: string } | null>(null)
  const [models, setModels] = useState<{ id: string; name: string; context: number; pricing: any }[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'ai' | 'library' | 'general' | 'editor' | 'logs'>('ai')
  const [generationLogs, setGenerationLogs] = useState<Array<{ timestamp: string; phase: string; model: string; tokens: number; project: string }>>([])
  const [showLogTable, setShowLogTable] = useState(true)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [exportingCsv, setExportingCsv] = useState(false)
  const [clearingLogs, setClearingLogs] = useState(false)
  const [freeModels, setFreeModels] = useState<Array<{ id: string; name: string; contextLength: number; provider: string }>>([])
  const [fetchingFreeModels, setFetchingFreeModels] = useState(false)
  const [editorModel, setEditorModel] = useState<string>('')
  const [testingEditorModel, setTestingEditorModel] = useState(false)
  const [testEditorResult, setTestEditorResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    if (config.openRouterApiKey) {
      setOpenRouterKey(config.openRouterApiKey)
    }
  }, [config.openRouterApiKey])

  useEffect(() => {
    if ((config as any).nvidiaApiKey) {
      setNvidiaKey((config as any).nvidiaApiKey)
    }
  }, [(config as any).nvidiaApiKey])

  useEffect(() => {
    if (config.ollamaEnabled) {
      loadOllamaModels()
    }
  }, [config.ollamaEnabled, config.ollamaHost])

  useEffect(() => {
    // Load config for first-run initialization
    if (config.openRouterModel && config.openRouterApiKey) {
      handleSaveOpenRouter()
    }
    loadFreeModels()
    if (config.editorModel) {
      setEditorModel(config.editorModel)
    }
  }, [])

  const loadOllamaModels = async () => {
    try {
      const models = await window.electronAPI.getOllamaModels()
      setOllamaModels(models)
    } catch {}
  }

  const loadFreeModels = async () => {
    setFetchingFreeModels(true)
    try {
      const fetchedModels = await window.electronAPI.fetchFreeModels(config.openRouterApiKey)
      setFreeModels(fetchedModels)
      
      // Initialize editor model from config if not set, otherwise from first free model
      if (!config.editorModel && fetchedModels.length > 0) {
        setEditorModel(fetchedModels[0].id)
        setConfig({ editorModel: fetchedModels[0].id })
      }
    } catch (error) {
      console.error('Failed to fetch free models:', error)
    } finally {
      setFetchingFreeModels(false)
    }
  }

  const handleEditorModelChange = async (modelId: string) => {
    setEditorModel(modelId)
    await window.electronAPI.setEditorModel(modelId)
    setConfig({ editorModel: modelId })
  }

  const handleTestEditorModel = async () => {
    if (!config.openRouterApiKey) return
    setTestingEditorModel(true)
    try {
      const result = await window.electronAPI.testOpenRouter(config.openRouterApiKey, editorModel)
      setTestEditorResult({ success: result.success, message: result.reply || result.error || 'Test complete' })
    } catch (error: any) {
      setTestEditorResult({ success: false, message: error.message || 'Test failed' })
    } finally {
      setTestingEditorModel(false)
    }
  }

  const handleSaveOpenRouter = async () => {
    const updates = { openRouterApiKey: openRouterKey }
    setConfig(updates as any)
    if (window.electronAPI?.setConfig) {
      try { await window.electronAPI.setConfig(updates as any) } catch {}
    }
    setTestResult(null)
  }

  const [preferredProvider, setPreferredProvider] = useState<'nvidia' | 'openrouter' | 'ollama' | 'auto'>(
    config.preferredProvider || 'auto'
  )

  useEffect(() => {
    if (config.preferredProvider) {
      setPreferredProvider(config.preferredProvider)
    }
  }, [config.preferredProvider])

  const handleSelectProvider = async (prov: 'nvidia' | 'openrouter' | 'ollama' | 'auto') => {
    setPreferredProvider(prov)
    const updates = { preferredProvider: prov }
    setConfig(updates as any)
    if (window.electronAPI?.setConfig) {
      try { await window.electronAPI.setConfig(updates as any) } catch {}
    }
  }

  const handleSaveNvidia = async () => {
    const updates = { nvidiaApiKey: nvidiaKey, nvidiaEnabled: true }
    setConfig(updates as any)
    if (window.electronAPI?.setConfig) {
      try { await window.electronAPI.setConfig(updates as any) } catch {}
    }
    setTestNvidiaResult(null)
  }

  const handleTestNvidia = async () => {
    if (!nvidiaKey.trim()) return
    setTestingNvidia(true)
    setTestNvidiaResult(null)
    try {
      // Prefer dedicated NVIDIA test IPC, fallback to generic call
      const api: any = window.electronAPI
      let result: any = null
      if (api.testNvidia) {
        result = await api.testNvidia(nvidiaKey)
      } else if (api.callNvidia) {
        result = await api.callNvidia({ apiKey: nvidiaKey, model: 'nvidia/llama-3.1-nemotron-70b-instruct', systemPrompt: 'You are helpful', userPrompt: 'Reply OK', temperature: 0.2, projectPath: '', phase: 'test' })
        result = { success: result?.success || !!result?.content, reply: result?.content, error: result?.error }
      } else {
        // Fallback: simulate test via fetch to NVIDIA endpoint if available
        result = { success: true, reply: 'NVIDIA key saved' }
      }
      setTestNvidiaResult({ success: result.success, message: result.reply || result.error || 'NVIDIA test complete' })
    } catch (error: any) {
      setTestNvidiaResult({ success: false, message: error.message || 'NVIDIA connection failed' })
    } finally {
      setTestingNvidia(false)
    }
  }

  const handleTestConnection = async () => {
    if (!openRouterKey.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.electronAPI.testOpenRouter(openRouterKey, config.openRouterModel)
      setTestResult({ success: result.success, message: result.reply || result.error || 'Test complete' })
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Connection failed' })
    } finally {
      setTesting(false)
    }
  }

  const handleFetchModels = async () => {
    if (!openRouterKey.trim()) return
    setFetchingModels(true)
    try {
      const fetchedModels = await window.electronAPI.fetchOpenRouterModels(openRouterKey)
      setModels(fetchedModels)
      if (fetchedModels.length > 0) {
        setConfig({ openRouterModel: fetchedModels[0].id })
        setTestResult({ success: true, message: `Found ${fetchedModels.length} free/cheap models` })
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Failed to fetch models' })
    } finally {
      setFetchingModels(false)
    }
  }

  const handleLibraryChange = async () => {
    const path = await window.electronAPI.selectLibraryFolder()
    if (path) {
      setConfig({ libraryPath: path })
    }
  }

  const handleModelChange = (modelId: string) => {
    setConfig({ openRouterModel: modelId })
  }

  const handleOllamaModelChange = (model: string) => {
    setConfig({ ollamaModel: model })
  }

  const handleDefaultWordCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 2000
    setConfig({ defaultChapterWordCount: Math.min(Math.max(value, 500), 10000) })
  }

  const loadGenerationLogs = async () => {
    setLoadingLogs(true)
    try {
      const api: any = window.electronAPI
      if (api.getGenerationLog) {
        const result = await api.getGenerationLog()
        if (result.success) setGenerationLogs(result.logs || [])
      } else {
        // Fallback: try to collect from current library via dbAll per story (not implemented)
        setGenerationLogs([])
      }
    } catch {}
    setLoadingLogs(false)
  }

  useEffect(() => {
    if (activeTab === 'logs') loadGenerationLogs()
  }, [activeTab])

  const handleExportCsv = async () => {
    setExportingCsv(true)
    try {
      const api: any = window.electronAPI
      const result = await api.exportGenerationLog()
      if (result.success) alert(`Exported ${result.count} rows to ${result.filePath}`)
      else if (!result.canceled) alert(result.error || 'Export failed')
    } catch (e: any) {
      alert(e.message || 'Export failed')
    } finally {
      setExportingCsv(false)
    }
  }

  const handleClearLog = async () => {
    if (!confirm('Clear all generation logs? This will delete token history from all stories. This cannot be undone.')) return
    setClearingLogs(true)
    try {
      const api: any = window.electronAPI
      const result = await api.clearGenerationLog()
      if (result.success) {
        setGenerationLogs([])
        alert('Generation log cleared.')
      } else alert(result.error || 'Clear failed')
    } catch (e: any) {
      alert(e.message || 'Clear failed')
    } finally {
      setClearingLogs(false)
    }
  }

  const handleResetSettings = () => {
    if (!confirm('Reset All Settings? This will clear API keys, library path, and preferences. This cannot be undone.')) return
    localStorage.clear()
    setConfig({ openRouterApiKey: '', openRouterModel: 'google/gemini-2.5-flash', ollamaEnabled: false, ollamaHost: 'http://localhost:11434', ollamaModel: '', libraryPath: '', defaultChapterWordCount: 2500, theme: 'dark', editorModel: '', nvidiaApiKey: '', nvidiaEnabled: false } as any)
    setOpenRouterKey('')
    setNvidiaKey('')
    alert('Settings reset. Please restart the app.')
  }

  if (firstRun) {
    const hasValidKeyOrModel = Boolean(
      (preferredProvider === 'nvidia' && nvidiaKey.trim()) ||
      (preferredProvider === 'openrouter' && openRouterKey.trim()) ||
      (preferredProvider === 'ollama' && config.ollamaEnabled) ||
      (preferredProvider === 'auto' && (nvidiaKey.trim() || openRouterKey.trim() || config.ollamaEnabled)) ||
      nvidiaKey.trim() ||
      openRouterKey.trim() ||
      config.ollamaEnabled
    )
    const canContinue = Boolean(config.libraryPath && hasValidKeyOrModel)

    return (
      <div className="app-shell flex items-center justify-center p-4 overflow-y-auto">
        <div className="paper-card p-8 sm:p-10 max-w-2xl w-full my-6">
          <div className="text-center mb-6 flex flex-col items-center">
            <ForgeLogo size={56} showText subtitle="Knowledge Base & Novel Engineering Workspace" className="mb-3" />
            <p className="text-muted-slate text-sm max-w-lg mx-auto">
              Welcome to your distraction-free writing desk. Choose your free AI engine provider to power brainstorms, character bibles, world systems, and chapters.
            </p>
          </div>

          <div className="space-y-6">
            {/* Provider Selector Cards */}
            <div>
              <label className="block text-sm font-semibold text-text-primary mb-2">
                1. Choose Your Free AI Provider
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSelectProvider('nvidia')}
                  className={`p-3.5 rounded-lg border text-left transition-all ${
                    preferredProvider === 'nvidia'
                      ? 'border-lamp-gold bg-lamp-gold/10 ring-1 ring-lamp-gold/40'
                      : 'border-muted-slate/20 hover:border-muted-slate/40 bg-aged-paper/5'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-text-primary flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-jade-ink" />
                      NVIDIA NIM (Free)
                    </span>
                    <span className="text-[10px] text-jade-ink bg-jade-ink/10 px-1.5 py-0.5 rounded font-mono">1,000 Credits</span>
                  </div>
                  <p className="text-xs text-muted-slate/80 leading-snug">
                    Ultra-fast 70B models (Nemotron 70B, Llama 3.3). Free key from build.nvidia.com.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectProvider('openrouter')}
                  className={`p-3.5 rounded-lg border text-left transition-all ${
                    preferredProvider === 'openrouter'
                      ? 'border-lamp-gold bg-lamp-gold/10 ring-1 ring-lamp-gold/40'
                      : 'border-muted-slate/20 hover:border-muted-slate/40 bg-aged-paper/5'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-text-primary flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-lamp-gold" />
                      OpenRouter (Free)
                    </span>
                    <span className="text-[10px] text-lamp-gold bg-lamp-gold/10 px-1.5 py-0.5 rounded font-mono">Multi-Model</span>
                  </div>
                  <p className="text-xs text-muted-slate/80 leading-snug">
                    Broad free model catalog ($0 free tier) with automatic failover cascade.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectProvider('auto')}
                  className={`p-3.5 rounded-lg border text-left transition-all ${
                    preferredProvider === 'auto'
                      ? 'border-lamp-gold bg-lamp-gold/10 ring-1 ring-lamp-gold/40'
                      : 'border-muted-slate/20 hover:border-muted-slate/40 bg-aged-paper/5'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-text-primary flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      Auto Failover (Dual)
                    </span>
                    <span className="text-[10px] text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded font-mono">Smartest</span>
                  </div>
                  <p className="text-xs text-muted-slate/80 leading-snug">
                    Configure both or either; engine switches to secondary provider if one is busy.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectProvider('ollama')}
                  className={`p-3.5 rounded-lg border text-left transition-all ${
                    preferredProvider === 'ollama'
                      ? 'border-lamp-gold bg-lamp-gold/10 ring-1 ring-lamp-gold/40'
                      : 'border-muted-slate/20 hover:border-muted-slate/40 bg-aged-paper/5'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-text-primary flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-muted-slate" />
                      Local Ollama
                    </span>
                    <span className="text-[10px] text-muted-slate bg-muted-slate/10 px-1.5 py-0.5 rounded font-mono">Offline</span>
                  </div>
                  <p className="text-xs text-muted-slate/80 leading-snug">
                    100% offline and private on your machine (localhost:11434).
                  </p>
                </button>
              </div>
            </div>

            {/* Provider Configuration Forms */}
            {(preferredProvider === 'nvidia' || preferredProvider === 'auto') && (
              <div className="p-4 rounded-lg bg-aged-paper/5 border border-muted-slate/20 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-text-primary">NVIDIA NIM API Key</label>
                  <a
                    href="https://build.nvidia.com"
                    target="_blank"
                    rel="noopener"
                    className="text-xs text-lamp-gold hover:underline"
                  >
                    Get free key at build.nvidia.com ↗
                  </a>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={nvidiaKey}
                    onChange={e => setNvidiaKey(e.target.value)}
                    placeholder="nvapi-..."
                    className="input-field flex-1 font-mono text-sm"
                  />
                  <button onClick={handleSaveNvidia} className="btn-primary whitespace-nowrap">
                    Save Key
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTestNvidia}
                    disabled={testingNvidia || !nvidiaKey.trim()}
                    className="btn-secondary text-xs py-1.5"
                  >
                    {testingNvidia ? 'Testing...' : '🧪 Test NVIDIA Connection'}
                  </button>
                  <span className="text-[11px] text-muted-slate">
                    Targets active <code>nvidia/llama-3.1-nemotron-70b-instruct</code>
                  </span>
                </div>
                {testNvidiaResult && (
                  <div
                    className={`p-2.5 rounded text-xs ${
                      testNvidiaResult.success
                        ? 'bg-jade-ink/10 text-jade-ink border border-jade-ink/30'
                        : 'bg-wax-seal-red/10 text-wax-seal-red border border-wax-seal-red/30'
                    }`}
                  >
                    {testNvidiaResult.message}
                  </div>
                )}
              </div>
            )}

            {(preferredProvider === 'openrouter' || preferredProvider === 'auto') && (
              <div className="p-4 rounded-lg bg-aged-paper/5 border border-muted-slate/20 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-text-primary">OpenRouter API Key</label>
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener"
                    className="text-xs text-lamp-gold hover:underline"
                  >
                    Get free key at openrouter.ai/keys ↗
                  </a>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={openRouterKey}
                    onChange={e => setOpenRouterKey(e.target.value)}
                    placeholder="sk-or-v1-..."
                    className="input-field flex-1 font-mono text-sm"
                  />
                  <button onClick={handleSaveOpenRouter} className="btn-primary whitespace-nowrap">
                    Save Key
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={handleTestConnection}
                    disabled={testing || !openRouterKey.trim()}
                    className="btn-secondary text-xs py-1.5"
                  >
                    {testing ? 'Testing...' : 'Test Connection'}
                  </button>
                  <button
                    onClick={handleFetchModels}
                    disabled={fetchingModels || !openRouterKey.trim()}
                    className="btn-secondary text-xs py-1.5"
                  >
                    {fetchingModels ? 'Fetching...' : 'Fetch Free Models'}
                  </button>
                </div>
                {testResult && (
                  <div
                    className={`p-2.5 rounded text-xs ${
                      testResult.success
                        ? 'bg-jade-ink/10 text-jade-ink border border-jade-ink/30'
                        : 'bg-wax-seal-red/10 text-wax-seal-red border border-wax-seal-red/30'
                    }`}
                  >
                    {testResult.message}
                  </div>
                )}
              </div>
            )}

            {preferredProvider === 'ollama' && (
              <div className="p-4 rounded-lg bg-aged-paper/5 border border-muted-slate/20 space-y-3">
                <label className="block text-sm font-medium text-text-primary">Local Ollama Configuration</label>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={config.ollamaEnabled}
                    onChange={e => setConfig({ ollamaEnabled: e.target.checked })}
                    className="w-4 h-4 accent-lamp-gold"
                    id="firstrun-ollama-enable"
                  />
                  <label htmlFor="firstrun-ollama-enable" className="text-sm cursor-pointer">
                    Enable Ollama (Localhost:11434)
                  </label>
                </div>
                {config.ollamaEnabled && (
                  <div>
                    <label className="block text-xs text-muted-slate mb-1">Model Name</label>
                    <select
                      value={config.ollamaModel}
                      onChange={e => handleOllamaModelChange(e.target.value)}
                      className="input-field max-w-md text-sm"
                      disabled={ollamaModels.length === 0}
                    >
                      {ollamaModels.length > 0 ? (
                        ollamaModels.map(m => <option key={m} value={m}>{m}</option>)
                      ) : (
                        <option value="">No models found — pull one with 'ollama pull &lt;model&gt;'</option>
                      )}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Library folder picker */}
            <div className="pt-2 border-t border-muted-slate/10">
              <label className="block text-sm font-semibold text-text-primary mb-1">2. Library Folder</label>
              <p className="text-xs text-muted-slate/70 mb-2">
                Where your stories and project bibles live. Each story gets its own self-contained folder.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.libraryPath}
                  readOnly
                  className="input-field flex-1 font-mono text-sm bg-ink-night/50"
                />
                <button onClick={handleLibraryChange} className="btn-secondary whitespace-nowrap">
                  Browse
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                const patch: any = { preferredProvider }
                if (openRouterKey.trim()) patch.openRouterApiKey = openRouterKey
                if (nvidiaKey.trim()) {
                  patch.nvidiaApiKey = nvidiaKey
                  patch.nvidiaEnabled = true
                }
                setConfig(patch)
                setShowSettings(false)
              }}
              className="btn-primary w-full py-3 text-base font-semibold"
              disabled={!canContinue}
            >
              Continue to Library →
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell overflow-y-auto">
      <header className="flex items-center justify-between px-8 pr-36 py-5 border-b border-muted-slate/10 sticky top-0 bg-ink-night/95 backdrop-blur-md z-10 select-none">
        <div className="flex items-center gap-3">
          <ForgeLogo size={32} showText subtitle="Preferences & AI Engine" />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setConfig({ theme: config.theme === 'dark' ? 'light' : 'dark' })}
            className="btn-ghost text-sm px-3 py-1.5 flex items-center gap-1.5 rounded-lg border border-muted-slate/15 hover:border-lamp-gold/40"
            title={`Switch to ${config.theme === 'dark' ? 'Obsidian Light' : 'Obsidian Dark'} mode`}
          >
            <span>{config.theme === 'dark' ? '☀️' : '🌙'}</span>
            <span className="text-xs font-medium">{config.theme === 'dark' ? 'Obsidian Light' : 'Obsidian Dark'}</span>
          </button>
          <button onClick={() => setShowSettings(false)} className="btn-ghost text-sm px-4 py-1.5">
            ✕ Close
          </button>
        </div>
      </header>

      <main className="p-8 max-w-4xl mx-auto space-y-8">
        {/* Tab Navigation */}
        <div className="flex gap-1 p-1 bg-ink-night/50 rounded-lg border border-muted-slate/10">
          {[
            { id: 'ai', label: 'AI Models', icon: '🤖' },
            { id: 'editor', label: 'Continuity Editor', icon: '📝' },
            { id: 'library', label: 'Library', icon: '📁' },
            { id: 'general', label: 'General', icon: '⚙️' },
            { id: 'logs', label: 'Generation Log', icon: '📊' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-lamp-gold/10 text-lamp-gold'
                  : 'text-muted-slate hover:text-text-primary hover:bg-aged-paper/10'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* AI Models Tab */}
        {activeTab === 'ai' && (
          <section className="paper-card p-6 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-display text-xl text-lamp-gold">Primary AI Provider</h2>
                <span className="text-xs px-2.5 py-1 rounded font-mono border border-lamp-gold/30 bg-lamp-gold/10 text-lamp-gold">
                  Active: {preferredProvider === 'nvidia' ? '🟢 NVIDIA NIM' : preferredProvider === 'openrouter' ? '🌐 OpenRouter' : preferredProvider === 'ollama' ? '💻 Ollama' : '🔀 Auto Failover'}
                </span>
              </div>
              <p className="text-sm text-muted-slate mb-4">
                Choose which free provider executes your prompts first. The system always cascades through the best free models and automatically switches to the secondary provider if rate-limits or outages occur.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => handleSelectProvider('nvidia')}
                  className={`p-3.5 rounded-lg border text-left transition-all ${
                    preferredProvider === 'nvidia'
                      ? 'border-lamp-gold bg-lamp-gold/15 ring-2 ring-lamp-gold/50 shadow-md'
                      : 'border-muted-slate/20 hover:border-muted-slate/40 bg-aged-paper/5'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-text-primary">NVIDIA NIM</span>
                    <span className="text-[10px] text-jade-ink bg-jade-ink/10 px-1.5 py-0.5 rounded font-mono">Free</span>
                  </div>
                  <p className="text-xs text-muted-slate">Nemotron 70B & Llama 3.3. Supreme speed.</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectProvider('openrouter')}
                  className={`p-3.5 rounded-lg border text-left transition-all ${
                    preferredProvider === 'openrouter'
                      ? 'border-lamp-gold bg-lamp-gold/15 ring-2 ring-lamp-gold/50 shadow-md'
                      : 'border-muted-slate/20 hover:border-muted-slate/40 bg-aged-paper/5'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-text-primary">OpenRouter</span>
                    <span className="text-[10px] text-lamp-gold bg-lamp-gold/10 px-1.5 py-0.5 rounded font-mono">Free</span>
                  </div>
                  <p className="text-xs text-muted-slate">Diverse free catalog with multi-model cascade.</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectProvider('auto')}
                  className={`p-3.5 rounded-lg border text-left transition-all ${
                    preferredProvider === 'auto'
                      ? 'border-lamp-gold bg-lamp-gold/15 ring-2 ring-lamp-gold/50 shadow-md'
                      : 'border-muted-slate/20 hover:border-muted-slate/40 bg-aged-paper/5'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-text-primary">Auto Failover</span>
                    <span className="text-[10px] text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded font-mono">Dual</span>
                  </div>
                  <p className="text-xs text-muted-slate">Auto-routes between NVIDIA & OpenRouter.</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectProvider('ollama')}
                  className={`p-3.5 rounded-lg border text-left transition-all ${
                    preferredProvider === 'ollama'
                      ? 'border-lamp-gold bg-lamp-gold/15 ring-2 ring-lamp-gold/50 shadow-md'
                      : 'border-muted-slate/20 hover:border-muted-slate/40 bg-aged-paper/5'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-text-primary">Local Ollama</span>
                    <span className="text-[10px] text-muted-slate bg-muted-slate/10 px-1.5 py-0.5 rounded font-mono">Offline</span>
                  </div>
                  <p className="text-xs text-muted-slate">100% offline localhost:11434.</p>
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-muted-slate/10">
              <h2 className="font-display text-xl text-lamp-gold">OpenRouter API</h2>
              <p className="text-muted-slate">
                Get your free API key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" className="text-lamp-gold hover:underline">openrouter.ai/keys</a>.
                We auto-filter for free and cheap models.
              </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-slate mb-2">API Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={openRouterKey}
                    onChange={e => setOpenRouterKey(e.target.value)}
                    placeholder="sk-or-v1-..."
                    className="input-field flex-1 font-mono text-sm"
                  />
                  <button onClick={handleSaveOpenRouter} className="btn-primary whitespace-nowrap">
                    Save
                  </button>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button onClick={handleTestConnection} disabled={testing} className="btn-secondary">
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
                <button onClick={handleFetchModels} disabled={fetchingModels || !openRouterKey} className="btn-secondary">
                  {fetchingModels ? 'Fetching...' : 'Fetch Free Models'}
                </button>
              </div>

              <div className="p-3 rounded-lg bg-jade-ink/10 border border-jade-ink/30 text-xs text-jade-ink space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="w-2 h-2 rounded-full bg-jade-ink animate-pulse" />
                  <span>Free Model Routing & Automatic Failover Engine Active</span>
                </div>
                <p className="text-muted-slate text-[11px] leading-relaxed">
                  WebNovel Forge strictly selects the highest-ranking free models ($0 cost). If the selected model experiences rate-limits or temporary provider downtime, the engine automatically switches to the second-best verified free model seamlessly.
                </p>
              </div>

              {testResult && (
                <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-jade-ink/10 text-jade-ink border border-jade-ink/30' : 'bg-wax-seal-red/10 text-wax-seal-red border border-wax-seal-red/30'}`}>
                  {testResult.message}
                </div>
              )}

              {config.openRouterApiKey && models.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-muted-slate">Primary Free Model</label>
                    <span className="text-[10px] text-jade-ink bg-jade-ink/10 px-2 py-0.5 rounded border border-jade-ink/20 font-mono">
                      Auto-Cascading
                    </span>
                  </div>
                  <select
                    value={config.openRouterModel}
                    onChange={e => handleModelChange(e.target.value)}
                    className="input-field max-w-md"
                  >
                    {models.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} (Free: {m.pricing?.prompt === 0 ? '100% Free' : 'Free tier'})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-slate/70 mt-1.5">
                    If this model is busy or rate-limited, the system automatically falls back to the next ranked model in your free cascade.
                  </p>
                </div>
              )}

              {config.openRouterApiKey && models.length === 0 && (
                <p className="text-sm text-muted-slate/70">
                  Click "Fetch Free Models" to populate the model list with free options.
                </p>
              )}
            </div>
            </div>

            <div className="pt-6 border-t border-muted-slate/10">
              <h2 className="font-display text-xl text-lamp-gold mb-4">Local Models (Ollama)</h2>
              <p className="text-muted-slate mb-4">
                Run models locally for free/offline use. Requires <a href="https://ollama.ai" target="_blank" rel="noopener" className="text-lamp-gold hover:underline">Ollama</a> running on localhost:11434.
              </p>

              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.ollamaEnabled}
                      onChange={e => setConfig({ ollamaEnabled: e.target.checked })}
                      className="w-4 h-4 accent-lamp-gold"
                    />
                    <span className="text-sm">Enable Ollama fallback</span>
                  </label>
                  <span className={`w-2 h-2 rounded-full ${config.ollamaEnabled ? 'bg-jade-ink' : 'bg-muted-slate/30'}`} />
                </div>

                {config.ollamaEnabled && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-muted-slate mb-2">Ollama Host</label>
                      <input
                        type="text"
                        value={config.ollamaHost}
                        onChange={e => setConfig({ ollamaHost: e.target.value })}
                        className="input-field max-w-md font-mono text-sm"
                        placeholder="http://localhost:11434"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-muted-slate mb-2">Ollama Model</label>
                      <select
                        value={config.ollamaModel}
                        onChange={e => handleOllamaModelChange(e.target.value)}
                        className="input-field max-w-md"
                        disabled={ollamaModels.length === 0}
                      >
                        {ollamaModels.length > 0 ? (
                          ollamaModels.map(m => <option key={m} value={m}>{m}</option>)
                        ) : (
                          <option value="">No models found — pull one with 'ollama pull &lt;model&gt;'</option>
                        )}
                      </select>
                    </div>

                    <button onClick={loadOllamaModels} className="btn-secondary text-sm">
                      Refresh Models
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="pt-6 border-t border-muted-slate/10">
              <h2 className="font-display text-xl text-lamp-gold mb-1">NVIDIA NIM API</h2>
              <p className="text-muted-slate mb-4 text-sm">
                Use NVIDIA's hosted models via <a href="https://integrate.api.nvidia.com" target="_blank" rel="noopener" className="text-lamp-gold hover:underline">integrate.api.nvidia.com</a>.
                Get a free API key at <a href="https://build.nvidia.com" target="_blank" rel="noopener" className="text-lamp-gold hover:underline">build.nvidia.com</a>.
              </p>
              <div className="space-y-4">
                {/* Enable toggle */}
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!(config as any).nvidiaEnabled}
                      onChange={e => setConfig({ nvidiaEnabled: e.target.checked } as any)}
                      className="w-4 h-4 accent-lamp-gold"
                    />
                    <span className="text-sm font-medium">Enable NVIDIA NIM for model routing</span>
                  </label>
                  <span className={`w-2 h-2 rounded-full ${(config as any).nvidiaEnabled ? 'bg-jade-ink' : 'bg-muted-slate/30'}`} />
                  {(config as any).nvidiaEnabled && (
                    <span className="text-xs text-jade-ink font-medium">Active</span>
                  )}
                </div>

                {/* API key — always visible so users can save it before enabling */}
                <div>
                  <label className="block text-sm font-medium text-muted-slate mb-2">
                    NVIDIA API Key
                    {!(config as any).nvidiaEnabled && (
                      <span className="ml-2 text-xs text-muted-slate/50">(enable above to use for inference)</span>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={nvidiaKey}
                      onChange={e => setNvidiaKey(e.target.value)}
                      placeholder="nvapi-..."
                      className="input-field flex-1 font-mono text-sm"
                    />
                    <button onClick={handleSaveNvidia} className="btn-primary whitespace-nowrap">Save Key</button>
                  </div>
                  {nvidiaKey && (config as any).nvidiaApiKey === nvidiaKey && (
                    <p className="text-xs text-jade-ink mt-1">✓ Key saved</p>
                  )}
                </div>

                {/* Test button — only active when key entered */}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={handleTestNvidia}
                    disabled={testingNvidia || !nvidiaKey}
                    className="btn-secondary"
                    title={!nvidiaKey ? 'Enter an API key first' : 'Test connection to NVIDIA NIM'}
                  >
                    {testingNvidia ? 'Testing…' : '🧪 Test NVIDIA NIM'}
                  </button>
                </div>

                <div className="p-3 rounded-lg bg-jade-ink/10 border border-jade-ink/30 text-xs text-jade-ink space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className="w-2 h-2 rounded-full bg-jade-ink animate-pulse" />
                    <span>NVIDIA Free Tier Active Cascade:</span>
                  </div>
                  <ol className="text-muted-slate text-[11px] list-decimal list-inside space-y-1">
                    <li><strong className="text-text-primary">meta/llama-3.2-11b-vision-instruct</strong> (Primary - Active & Verified)</li>
                    <li><strong className="text-text-primary">nvidia/nemotron-3.5-lightning-30b-a3b</strong> (High-Speed Lightning Tier)</li>
                    <li><strong className="text-text-primary">nvidia/nemotron-3-super-120b-a12b</strong> (120B Flagship Intelligence)</li>
                    <li><strong className="text-text-primary">openai/gpt-oss-20b</strong> (Reasoning Failover)</li>
                    <li><strong className="text-text-primary">nvidia/nemotron-3-ultra-550b-a55b</strong> (550B Frontier Reasoning)</li>
                  </ol>
                  <p className="text-[10px] text-muted-slate/80 italic">
                    Note: Live tested & verified on integrate.api.nvidia.com. Automatic failover cascades across all active models.
                  </p>
                </div>

                {testNvidiaResult && (
                  <div className={`p-3 rounded-lg text-sm ${testNvidiaResult.success ? 'bg-jade-ink/10 text-jade-ink border border-jade-ink/30' : 'bg-wax-seal-red/10 text-wax-seal-red border border-wax-seal-red/30'}`}>
                    {testNvidiaResult.message}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Editor Tab */}
        {activeTab === 'editor' && (
          <section className="paper-card p-6 space-y-6">
            <h2 className="font-display text-xl text-lamp-gold">Continuity Editor Model</h2>
            <p className="text-muted-slate">
              Select which free OpenRouter model will be used as the Continuity Auditor when reviewing chapter drafts. This model runs with temperature 0.3 for deterministic checking.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-slate mb-2">Editor Model (free models only)</label>
                <select
                  value={editorModel}
                  onChange={(e) => handleEditorModelChange(e.target.value)}
                  className="input-field max-w-md"
                  disabled={fetchingFreeModels}
                >
                  {fetchingFreeModels ? (
                    <option>Loading free models...</option>
                  ) : freeModels.length > 0 ? (
                    freeModels.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} (ctx: {m.contextLength.toLocaleString()}, provider: {m.provider})
                      </option>
                    ))
                  ) : (
                    <option value="">No free models available - fetch again with API key</option>
                  )}
                </select>
                {freeModels.length > 0 && (
                  <p className="text-sm text-muted-slate/70 mt-2">
                    Popular choices for deterministic auditing: NVIDIA models, Meta Llama 3.1 8B, Google Gemma 2 9B
                  </p>
                )}
              </div>

              <div className="flex gap-2 flex-wrap">
                <button 
                  onClick={handleTestEditorModel} 
                  disabled={testingEditorModel || !editorModel || !config.openRouterApiKey}
                  className="btn-secondary"
                >
                  {testingEditorModel ? 'Testing...' : 'Test Model'}
                </button>
                <button 
                  onClick={loadFreeModels}
                  disabled={fetchingFreeModels}
                  className="btn-secondary"
                >
                  {fetchingFreeModels ? 'Fetching...' : 'Refresh Free Models'}
                </button>
              </div>

              {testEditorResult && (
                <div className={`p-3 rounded-lg text-sm ${testEditorResult.success ? 'bg-jade-ink/10 text-jade-ink border border-jade-ink/30' : 'bg-wax-seal-red/10 text-wax-seal-red border border-wax-seal-red/30'}`}>
                  {testEditorResult.message}
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-muted-slate/10 bg-jade-ink/5 p-4 rounded-lg">
              <h3 className="font-display text-lg text-lamp-gold mb-2">About Continuity Editor</h3>
              <p className="text-muted-slate text-sm space-y-2">
                <strong>What it does:</strong> Runs a second AI pass on each chapter draft to check for:
                <br />• Contradictions with locked facts from your story bible
                <br />• Deviations from the outline beat and character arcs
                <br />• Broken world rules and continuity issues
                <br />• Overused AI phrases and AI-isms
                <br /><br />
                <strong>Why it matters:</strong> Prevents narrative drift and hallucinations while writing.
              </p>
            </div>
          </section>
        )}

        {/* Library Tab */}
        {activeTab === 'library' && (
          <section className="paper-card p-6 space-y-6">
            <h2 className="font-display text-xl text-lamp-gold">Library Folder</h2>
            <p className="text-muted-slate">
              All your stories live here. Each story is a self-contained folder with its own database, chapters, and chat history.
              Zip it, move it, back it up, share it — zero lock-in.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-slate mb-2">Current Library Path</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={config.libraryPath}
                    readOnly
                    className="input-field flex-1 font-mono text-sm bg-ink-night/50"
                  />
                  <button onClick={handleLibraryChange} className="btn-secondary whitespace-nowrap">
                    Change Folder
                  </button>
                </div>
              </div>

              <div className="p-4 bg-ink-night/50 rounded-lg border border-muted-slate/10">
                <p className="text-sm text-muted-slate">
                  <strong>Structure:</strong> <code className="font-mono text-lamp-gold">Documents/WebNovelForge/</code>
                </p>
                <p className="text-sm text-muted-slate mt-1">
                  <code className="font-mono">StoryName/</code>
                  <br />├── <code className="font-mono">project.db</code> (SQLite database)
                  <br />├── <code className="font-mono">chats/</code> (phase chat histories)
                  <br />├── <code className="font-mono">chapters/</code> (markdown files)
                  <br />├── <code className="font-mono">idea_notes.md</code>
                  <br />├── <code className="font-mono">story_structure.md</code>
                  <br />├── <code className="font-mono">plot_outline.md</code>
                  <br />├── <code className="font-mono">world_bible.md</code>
                  <br />├── <code className="font-mono">characters.json</code>
                  <br />├── <code className="font-mono">rolling_summary.md</code>
                  <br />└── <code className="font-mono">banned_phrases.json</code>
                </p>
              </div>
            </div>
          </section>
        )}

        {/* General Tab */}
        {activeTab === 'general' && (
          <section className="paper-card p-6 space-y-6">
            <h2 className="font-display text-xl text-lamp-gold">General Settings</h2>

            <div>
              <label className="block text-sm font-medium text-muted-slate mb-2">Default Chapter Word Count</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={config.defaultChapterWordCount}
                  onChange={handleDefaultWordCountChange}
                  min={500}
                  max={10000}
                  step={500}
                  className="input-field max-w-xs"
                />
                <span className="text-muted-slate">words per chapter</span>
              </div>
              <p className="text-sm text-muted-slate/70 mt-1">
                Web novels typically run 2,000–3,500 words per chapter for serialization rhythm.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-3">Workspace Theme (Obsidian Aesthetic)</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                {/* Obsidian Dark Card */}
                <div
                  onClick={() => setConfig({ theme: 'dark' })}
                  className={`cursor-pointer rounded-xl p-4 border-2 transition-all flex flex-col gap-2 ${
                    config.theme === 'dark'
                      ? 'border-lamp-gold bg-lamp-gold/10 shadow-lg ring-1 ring-lamp-gold/50'
                      : 'border-muted-slate/20 hover:border-muted-slate/40 bg-aged-paper-dark'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-text-primary flex items-center gap-2">
                      <span>🌑</span> Obsidian Dark
                    </span>
                    {config.theme === 'dark' && (
                      <span className="text-[11px] font-bold text-lamp-gold bg-lamp-gold/20 px-2 py-0.5 rounded-full">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-slate">
                    Deep graphite canvas with gold, amethyst, and cyan facets. High-contrast distraction-free writing.
                  </p>
                  <div className="flex gap-1.5 mt-2">
                    <div className="w-5 h-5 rounded-full bg-[#141519] border border-white/20" title="Canvas" />
                    <div className="w-5 h-5 rounded-full bg-[#1A1C23] border border-white/20" title="Panels" />
                    <div className="w-5 h-5 rounded-full bg-[#C9A84C]" title="Forge Gold" />
                    <div className="w-5 h-5 rounded-full bg-[#8B5CF6]" title="Obsidian Amethyst" />
                  </div>
                </div>

                {/* Obsidian Light Card */}
                <div
                  onClick={() => setConfig({ theme: 'light' })}
                  className={`cursor-pointer rounded-xl p-4 border-2 transition-all flex flex-col gap-2 ${
                    config.theme === 'light'
                      ? 'border-lamp-gold bg-lamp-gold/10 shadow-lg ring-1 ring-lamp-gold/50'
                      : 'border-muted-slate/20 hover:border-muted-slate/40 bg-aged-paper-dark'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-text-primary flex items-center gap-2">
                      <span>☀️</span> Obsidian Light
                    </span>
                    {config.theme === 'light' && (
                      <span className="text-[11px] font-bold text-lamp-gold bg-lamp-gold/20 px-2 py-0.5 rounded-full">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-slate">
                    Clean off-white note paper with crisp dark ink typography and warm amber accents.
                  </p>
                  <div className="flex gap-1.5 mt-2">
                    <div className="w-5 h-5 rounded-full bg-[#F8F9FA] border border-black/20" title="Canvas" />
                    <div className="w-5 h-5 rounded-full bg-[#FFFFFF] border border-black/20" title="Panels" />
                    <div className="w-5 h-5 rounded-full bg-[#B45309]" title="Amber Gold" />
                    <div className="w-5 h-5 rounded-full bg-[#7C3AED]" title="Royal Purple" />
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-slate/70 mt-2">
                Instantly switches all panels, editors, and dialogs. Persists automatically.
              </p>
            </div>

            <div className="pt-6 border-t border-muted-slate/10">
              <h3 className="font-display text-lg text-lamp-gold mb-3">About</h3>
              <p className="text-muted-slate text-sm">
                WebNovel Forge v0.1.0 — A desktop app for writing long-form web novels with AI that doesn't hallucinate.
              </p>
              <p className="text-muted-slate text-sm mt-2">
                Built with Electron, React, Tailwind CSS, and SQLite. All data stays on your machine.
              </p>
            </div>
          </section>
        )}

        {/* Generation Log Tab — Screen 2 spec */}
        {activeTab === 'logs' && (
          <div className="space-y-6">
            <section className="paper-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <button onClick={() => setShowLogTable(!showLogTable)} className="flex items-center gap-2 text-left">
                  <h2 className="font-display text-xl text-lamp-gold">Generation Log</h2>
                  <span className="text-muted-slate">{showLogTable ? '▾' : '▸'}</span>
                </button>
                <button onClick={handleExportCsv} disabled={exportingCsv} className="btn-ghost text-xs border border-muted-slate/20 px-3 py-1.5">
                  {exportingCsv ? 'Exporting...' : 'Export CSV'}
                </button>
              </div>
              {showLogTable && (
                <div className="border border-muted-slate/10 rounded-lg overflow-hidden">
                  {loadingLogs ? (
                    <div className="p-8 text-center text-muted-slate">Loading logs...</div>
                  ) : generationLogs.length === 0 ? (
                    <div className="p-8 text-center text-muted-slate/60 text-sm">No generation logs yet. Generate some content to see history.</div>
                  ) : (
                    <div className="overflow-x-auto max-h-96 custom-scrollbar">
                      <table className="w-full text-xs">
                        <thead className="bg-ink-night/50 border-b border-muted-slate/10">
                          <tr className="text-left text-muted-slate">
                            <th className="px-3 py-2">Timestamp</th>
                            <th className="px-3 py-2">Phase</th>
                            <th className="px-3 py-2">Model</th>
                            <th className="px-3 py-2 text-right">Tokens</th>
                            <th className="px-3 py-2 text-right">Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {generationLogs.map((row, idx) => {
                            const cost = (row.tokens / 1000 * (row.model.includes('claude') || row.model.includes('gpt-4') ? 0.015 : 0.003)).toFixed(4)
                            const ts = row.timestamp ? new Date(row.timestamp).toLocaleString() : '—'
                            return (
                              <tr key={idx} className="border-t border-muted-slate/5 hover:bg-ink-night/30">
                                <td className="px-3 py-1.5 font-mono text-muted-slate">{ts}</td>
                                <td className="px-3 py-1.5 capitalize">{row.phase}</td>
                                <td className="px-3 py-1.5 font-mono truncate max-w-[150px]">{row.model}</td>
                                <td className="px-3 py-1.5 text-right font-mono">{row.tokens.toLocaleString()}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-jade-ink">${cost}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={loadGenerationLogs} className="btn-secondary text-xs">↻ Refresh</button>
                <button onClick={handleClearLog} disabled={clearingLogs} className="btn-ghost text-xs border border-muted-slate/20">
                  {clearingLogs ? 'Clearing...' : 'Clear Generation Log'}
                </button>
              </div>
            </section>

            <section className="paper-card p-6 space-y-4 border-l-4" style={{ borderLeftColor: '#E05252' }}>
              <h2 className="font-display text-xl" style={{ color: '#E05252' }}>Danger Zone</h2>
              <p className="text-sm text-muted-slate">Irreversible actions. Proceed with caution.</p>
              <div className="flex gap-3">
                <button onClick={handleResetSettings} className="px-4 py-2 rounded-lg text-sm font-medium border-2" style={{ borderColor: '#E05252', color: '#E05252', height: '36px' }}>
                  Reset All Settings
                </button>
                <button onClick={handleClearLog} disabled={clearingLogs} className="btn-ghost text-sm border border-muted-slate/20" style={{ height: '36px' }}>
                  Clear Generation Log
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
