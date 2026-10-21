import { useState, useEffect, useCallback } from 'react'
import type { VideoEngine, EngineProject, EngineCheckResult } from '../types'

interface EngineStudioViewProps {
  engine: VideoEngine
  projectPath: string
  storyData: any
}

const ENGINE_DETAILS: Record<VideoEngine, {
  name: string
  icon: string
  language: string
  fileExt: string
  defaultFileName: string
  renderCmd: string
  installGuide: string
  githubUrl: string
  docUrl: string
  aiPromptExample: string
}> = {
  hyperframes: {
    name: 'HeyGen Hyperframes',
    icon: '⚡',
    language: 'HTML / CSS',
    fileExt: 'html',
    defaultFileName: 'index.html',
    renderCmd: 'npx hyperframes render -o output.mp4',
    installGuide: 'npx skills add heygen-com/hyperframes --full-depth',
    githubUrl: 'https://github.com/heygen-com/hyperframes',
    docUrl: 'https://hyperframes.dev',
    aiPromptExample: 'Using /hyperframes, create a 20-second cinematic book trailer with golden glowing typography.',
  },
  remotion: {
    name: 'Remotion',
    icon: '⚛️',
    language: 'React TSX',
    fileExt: 'tsx',
    defaultFileName: 'Composition.tsx',
    renderCmd: 'npx remotion render Composition.tsx output.mp4',
    installGuide: 'npm install remotion @remotion/cli',
    githubUrl: 'https://github.com/remotion-dev/remotion',
    docUrl: 'https://www.remotion.dev/docs',
    aiPromptExample: 'Using Remotion, create a React video component with animated text springs and floating particles for chapter 1.',
  },
  'html-video': {
    name: 'html-video (nexu-io)',
    icon: '🌐',
    language: 'HTML / CSS',
    fileExt: 'html',
    defaultFileName: 'index.html',
    renderCmd: 'npx html-video render index.html -o output.mp4',
    installGuide: 'npm install -g html-video',
    githubUrl: 'https://github.com/nexu-io/html-video',
    docUrl: 'https://github.com/nexu-io/html-video#readme',
    aiPromptExample: 'Using html-video, convert this chapter synopsis into an animated teaser with AI soundtrack integration.',
  },
  'motion-canvas': {
    name: 'Motion Canvas',
    icon: '🎨',
    language: 'TypeScript (Canvas 2D)',
    fileExt: 'ts',
    defaultFileName: 'scene.ts',
    renderCmd: 'npx motion-canvas render scene.ts',
    installGuide: 'npm create motion-canvas@latest',
    githubUrl: 'https://github.com/motion-canvas/motion-canvas',
    docUrl: 'https://motioncanvas.io/docs',
    aiPromptExample: 'Using Motion Canvas, animate a Murim sect power hierarchy diagram synced to a 15-second narration.',
  },
  manim: {
    name: 'Manim (Code Video Generator)',
    icon: '🐍',
    language: 'Python',
    fileExt: 'py',
    defaultFileName: 'scene.py',
    renderCmd: 'python -m manim scene.py SceneName --format mp4',
    installGuide: 'pip install manim',
    githubUrl: 'https://github.com/ManimCommunity/manim',
    docUrl: 'https://docs.manim.community',
    aiPromptExample: 'Using Manim, write a Python script showing the geographic route of the protagonist across the continent.',
  },
  'prism-motion': {
    name: 'Prism Motion',
    icon: '🔮',
    language: 'JSON / FastAPI',
    fileExt: 'json',
    defaultFileName: 'request.json',
    renderCmd: 'curl -X POST http://localhost:8000/generate -d @request.json',
    installGuide: 'pip install -r requirements.txt && npm install',
    githubUrl: 'https://github.com/rachitgoyal14/prismMotion-EvolveAI',
    docUrl: 'https://github.com/rachitgoyal14/prismMotion-EvolveAI#readme',
    aiPromptExample: 'Generate a full-pipeline video request combining SadTalker avatar with Remotion background compositor.',
  },
}

export function EngineStudioView({ engine, projectPath, storyData }: EngineStudioViewProps) {
  const details = ENGINE_DETAILS[engine]
  const [projects, setProjects] = useState<EngineProject[]>([])
  const [activeProject, setActiveProject] = useState<EngineProject | null>(null)
  const [sourceCode, setSourceCode] = useState<string>('')
  const [checkResult, setCheckResult] = useState<EngineCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [renderSuccess, setRenderSuccess] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  // New Project Form
  const [newTitle, setNewTitle] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [isScaffolding, setIsScaffolding] = useState(false)

  // Load projects for this engine
  const loadProjects = useCallback(async () => {
    try {
      const list = await window.electronAPI.videoEngineList({ projectPath, engine })
      setProjects(list)
      if (list.length > 0 && (!activeProject || activeProject.engine !== engine)) {
        selectProject(list[0])
      } else if (list.length === 0) {
        setActiveProject(null)
        setSourceCode('')
      }
    } catch (err) {
      console.error('Failed to load engine projects:', err)
    }
  }, [projectPath, engine])

  // Run doctor check for engine
  const runCheck = useCallback(async () => {
    setChecking(true)
    try {
      const res = await window.electronAPI.videoEngineCheck(engine)
      setCheckResult(res as EngineCheckResult)
    } catch (err) {
      console.error('Failed to run engine check:', err)
    } finally {
      setChecking(false)
    }
  }, [engine])

  useEffect(() => {
    loadProjects()
    runCheck()
  }, [engine, loadProjects, runCheck])

  const selectProject = async (proj: EngineProject) => {
    setActiveProject(proj)
    setRenderError(null)
    setRenderSuccess(null)
    try {
      const code = await window.electronAPI.videoEngineReadSource({
        projectPath,
        engine,
        slug: proj.slug,
      })
      setSourceCode(code)
    } catch (err) {
      console.error('Failed to read source:', err)
    }
  }

  const handleSaveSource = async () => {
    if (!activeProject) return
    try {
      await window.electronAPI.videoEngineWriteSource({
        projectPath,
        engine,
        slug: activeProject.slug,
        content: sourceCode,
      })
      setStatusMsg('✓ Code saved')
      setTimeout(() => setStatusMsg(null), 2500)
    } catch (err: any) {
      alert(err.message || 'Failed to save code')
    }
  }

  const handleScaffold = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    const slug = (newSlug.trim() || newTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/^-+|-+$/g, '')
    setIsScaffolding(true)
    try {
      const proj = await window.electronAPI.videoEngineScaffold({
        projectPath,
        engine,
        slug,
        title: newTitle.trim(),
        storyContext: {
          title: storyData?.ideaNotes?.slice(0, 50) || 'Web Novel',
          logline: storyData?.ideaNotes || 'An epic journey across uncharted realms.',
          genre: 'Fantasy / Cultivation',
        },
      })
      setNewTitle('')
      setNewSlug('')
      await loadProjects()
      selectProject(proj)
      setStatusMsg(`✓ Created ${slug}`)
      setTimeout(() => setStatusMsg(null), 2500)
    } catch (err: any) {
      alert(err.message || 'Failed to create project')
    } finally {
      setIsScaffolding(false)
    }
  }

  const handleRender = async () => {
    if (!activeProject) return
    setIsRendering(true)
    setRenderError(null)
    setRenderSuccess(null)
    // Save first
    await handleSaveSource()
    try {
      const result = await window.electronAPI.videoEngineRender({
        projectPath,
        engine,
        slug: activeProject.slug,
      })
      if (result.success && result.outputPath) {
        setRenderSuccess(`Rendered MP4 in ${((result.durationMs || 0) / 1000).toFixed(1)}s!`)
        await loadProjects()
        // Reload active project to catch updated outputMp4
        const updatedList = await window.electronAPI.videoEngineList({ projectPath, engine })
        const found = updatedList.find(p => p.slug === activeProject.slug)
        if (found) setActiveProject(found)
      } else {
        setRenderError(result.error || 'Render failed. Check that prerequisites are installed.')
      }
    } catch (err: any) {
      setRenderError(err.message || 'Render failed unexpectedly')
    } finally {
      setIsRendering(false)
    }
  }

  const handleOpenFolder = () => {
    if (activeProject) {
      window.electronAPI.openStoryFolder(activeProject.engineProjectPath)
    } else {
      window.electronAPI.openStoryFolder(projectPath)
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-ink-night text-text-primary">
      {/* LEFT: Project List & Engine Requirements */}
      <div className="w-80 border-r border-muted-slate/15 bg-ink-night/60 flex flex-col overflow-hidden text-xs">
        {/* Engine Banner */}
        <div className="p-4 border-b border-muted-slate/15 bg-ink-night/80 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{details.icon}</span>
              <span className="font-display font-bold text-lamp-gold text-sm">{details.name}</span>
            </div>
            <button
              onClick={runCheck}
              disabled={checking}
              className="text-[10px] text-lamp-gold hover:underline"
            >
              {checking ? 'Checking…' : '↻ Check'}
            </button>
          </div>
          <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-lamp-gold/10 text-lamp-gold font-mono border border-lamp-gold/20">
            {details.language}
          </span>

          {/* Engine Doctor Status */}
          {checkResult && (
            <div className={`p-2 rounded border text-[11px] space-y-1 ${
              checkResult.ready
                ? 'bg-jade-ink/10 border-jade-ink/30 text-jade-ink'
                : 'bg-wax-seal-red/10 border-wax-seal-red/30 text-wax-seal-red'
            }`}>
              <div className="font-semibold flex items-center gap-1">
                <span>{checkResult.ready ? '✓ Engine Ready' : '⚠️ Missing Requirements'}</span>
              </div>
              {checkResult.issues.length > 0 && (
                <ul className="list-disc list-inside space-y-0.5 text-[10px]">
                  {checkResult.issues.map((iss, i) => <li key={i}>{iss}</li>)}
                </ul>
              )}
              {checkResult.suggestions.length > 0 && (
                <div className="text-[10px] opacity-80 pt-1">
                  {checkResult.suggestions[0]}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-lamp-gold">Projects ({projects.length})</span>
          </div>

          {projects.length === 0 ? (
            <div className="p-3 bg-black/40 rounded border border-muted-slate/15 text-muted-slate text-center">
              No projects created yet for {details.name}.
            </div>
          ) : (
            <div className="space-y-1.5">
              {projects.map((p) => (
                <button
                  key={p.slug}
                  onClick={() => selectProject(p)}
                  className={`w-full text-left p-2.5 rounded border transition-colors ${
                    activeProject?.slug === p.slug
                      ? 'bg-lamp-gold/15 border-lamp-gold text-white font-medium'
                      : 'bg-black/30 border-muted-slate/20 text-muted-slate hover:bg-black/50 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono truncate">{p.title}</span>
                    {p.outputMp4 && (
                      <span className="text-[10px] text-jade-ink font-bold">▶ MP4</span>
                    )}
                  </div>
                  <div className="text-[10px] opacity-60 font-mono mt-0.5 truncate">
                    /{p.slug}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Scaffold New Project Form */}
          <div className="pt-4 border-t border-muted-slate/15 space-y-2">
            <span className="font-bold text-lamp-gold">Create New {details.name} Video</span>
            <form onSubmit={handleScaffold} className="space-y-2">
              <input
                type="text"
                placeholder="Video Title (e.g. Chapter 1 Teaser)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="input-field text-xs w-full py-1.5 px-2 bg-black/50 border border-muted-slate/30 rounded"
              />
              <input
                type="text"
                placeholder="slug-optional (auto-generated)"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                className="input-field text-xs w-full py-1.5 px-2 font-mono bg-black/50 border border-muted-slate/30 rounded"
              />
              <button
                type="submit"
                disabled={isScaffolding || !newTitle.trim()}
                className="btn-primary text-xs w-full py-1.5 font-bold"
              >
                {isScaffolding ? 'Creating…' : `✨ Scaffold ${details.name} Video`}
              </button>
            </form>
          </div>
        </div>

        {/* Engine Links Footer */}
        <div className="p-3 border-t border-muted-slate/15 bg-ink-night/80 text-[10px] text-muted-slate space-y-1">
          <div className="flex items-center justify-between">
            <a href={details.githubUrl} target="_blank" rel="noopener noreferrer" className="text-lamp-gold hover:underline">
              GitHub Repo ↗
            </a>
            <a href={details.docUrl} target="_blank" rel="noopener noreferrer" className="text-lamp-gold hover:underline">
              Docs ↗
            </a>
          </div>
          <div className="font-mono text-muted-slate/70 truncate" title={details.installGuide}>
            {details.installGuide}
          </div>
        </div>
      </div>

      {/* CENTER: Code Editor & Preview/Render */}
      <div className="flex-1 flex flex-col overflow-hidden bg-black/80">
        {/* Editor Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-ink-night/90 border-b border-muted-slate/15 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-lamp-gold">
              {activeProject ? `${activeProject.title} (${details.defaultFileName})` : 'Select or create a project'}
            </span>
            {statusMsg && (
              <span className="text-jade-ink font-mono text-[11px]">{statusMsg}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenFolder}
              className="btn-ghost text-xs px-2.5 py-1"
              title="Open folder in File Explorer"
            >
              📁 Folder
            </button>
            <button
              onClick={handleSaveSource}
              disabled={!activeProject}
              className="btn-secondary text-xs px-3 py-1"
            >
              💾 Save
            </button>
            <button
              onClick={handleRender}
              disabled={isRendering || !activeProject}
              className="btn-primary text-xs px-4 py-1 font-bold shadow flex items-center gap-1.5"
            >
              {isRendering ? (
                <>
                  <div className="w-3 h-3 border-2 border-ink-night/40 border-t-ink-night rounded-full animate-spin" />
                  <span>Rendering…</span>
                </>
              ) : (
                <span>⚡ Render MP4</span>
              )}
            </button>
          </div>
        </div>

        {/* Status / Alert Banner */}
        {renderSuccess && (
          <div className="bg-jade-ink/15 border-b border-jade-ink/30 text-jade-ink px-4 py-2 text-xs flex items-center justify-between">
            <span>✓ {renderSuccess}</span>
            <button onClick={() => setRenderSuccess(null)} className="text-jade-ink hover:underline">✕</button>
          </div>
        )}
        {renderError && (
          <div className="bg-wax-seal-red/15 border-b border-wax-seal-red/30 text-wax-seal-red px-4 py-2 text-xs flex items-center justify-between">
            <span className="font-mono truncate">{renderError}</span>
            <button onClick={() => setRenderError(null)} className="text-wax-seal-red hover:underline ml-2">✕</button>
          </div>
        )}

        {/* Split View: Code Editor (top/left) + Video Player / Info (bottom/right) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Code Area */}
          <div className="flex-1 flex flex-col border-r border-muted-slate/15 overflow-hidden">
            <div className="px-3 py-1 bg-ink-night/60 text-[11px] text-muted-slate font-mono border-b border-muted-slate/15 flex justify-between">
              <span>{details.defaultFileName} — {details.language}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(sourceCode)
                  setStatusMsg('✓ Copied')
                  setTimeout(() => setStatusMsg(null), 2000)
                }}
                className="hover:text-lamp-gold"
              >
                📋 Copy
              </button>
            </div>
            <textarea
              value={sourceCode}
              onChange={(e) => setSourceCode(e.target.value)}
              placeholder={`Write or paste ${details.name} code here...`}
              disabled={!activeProject}
              className="flex-1 p-4 bg-black/95 text-white font-mono text-xs resize-none focus:outline-none custom-scrollbar leading-relaxed"
              spellCheck={false}
            />
          </div>

          {/* Preview / Output Player Area */}
          <div className="w-full md:w-96 flex flex-col bg-ink-night/40 p-4 space-y-4 overflow-y-auto custom-scrollbar text-xs">
            <div className="space-y-1">
              <span className="font-bold text-lamp-gold">Rendered Video</span>
              <p className="text-[11px] text-muted-slate">
                Output MP4 generated by {details.name}.
              </p>
            </div>

            {activeProject?.outputMp4 ? (
              <div className="space-y-3">
                <div className="bg-black rounded-lg overflow-hidden border border-muted-slate/20 aspect-video flex items-center justify-center">
                  <video
                    key={activeProject.outputMp4}
                    src={`file://${activeProject.outputMp4.replace(/\\/g, '/')}`}
                    controls
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="p-2 bg-black/40 rounded border border-muted-slate/15 text-[11px] font-mono space-y-1">
                  <div className="text-jade-ink font-semibold">✓ MP4 ready</div>
                  <div className="text-muted-slate truncate" title={activeProject.outputMp4}>
                    {activeProject.outputMp4}
                  </div>
                </div>
              </div>
            ) : (
              <div className="aspect-video bg-black/50 border border-dashed border-muted-slate/30 rounded-lg flex flex-col items-center justify-center p-4 text-center space-y-2">
                <span className="text-2xl opacity-40">{details.icon}</span>
                <span className="text-muted-slate text-[11px]">
                  No rendered MP4 yet. Click "⚡ Render MP4" to build this video.
                </span>
              </div>
            )}

            {/* AI Prompting Cheat Sheet */}
            <div className="p-3 bg-black/50 rounded-lg border border-muted-slate/20 space-y-2">
              <span className="font-semibold text-lamp-gold text-xs">AI Agent Coding Prompt</span>
              <p className="text-[11px] text-muted-slate">
                Copy this prompt into Claude Code, Cursor, or Gemini to generate code for this engine:
              </p>
              <div className="p-2 bg-black rounded font-mono text-[10px] text-muted-slate/90 select-all border border-muted-slate/15">
                {details.aiPromptExample}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(details.aiPromptExample)
                  setStatusMsg('✓ Copied prompt')
                  setTimeout(() => setStatusMsg(null), 2000)
                }}
                className="btn-ghost text-[10px] py-1 px-2 text-lamp-gold border border-lamp-gold/20 w-full"
              >
                📋 Copy Agent Prompt
              </button>
            </div>

            {/* Terminal Render Command */}
            <div className="p-3 bg-black/50 rounded-lg border border-muted-slate/20 space-y-1 text-[11px]">
              <span className="font-semibold text-lamp-gold text-xs">CLI Render Command</span>
              <div className="p-2 bg-black rounded font-mono text-[10px] text-white overflow-x-auto border border-muted-slate/15">
                {details.renderCmd}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
