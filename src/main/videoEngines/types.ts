/**
 * Shared types for the multi-engine video generation system.
 * Each engine adapter implements the VideoEngineAdapter interface.
 */

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

export const ENGINE_REGISTRY: Record<VideoEngine, EngineInfo> = {
  hyperframes: {
    id: 'hyperframes',
    name: 'HeyGen Hyperframes',
    description: 'HTML/CSS → MP4. No-cloud, deterministic. 20 built-in templates.',
    language: 'html',
    renderCmd: 'npx hyperframes render -o output.mp4',
    requiresPython: false,
    requiresNode: true,
    githubUrl: 'https://github.com/heygen-com/hyperframes',
    docUrl: 'https://hyperframes.dev',
    installCmd: 'npx skills add heygen-com/hyperframes --full-depth',
  },
  remotion: {
    id: 'remotion',
    name: 'Remotion',
    description: 'React → MP4. Write videos as React components. Industry standard.',
    language: 'react',
    renderCmd: 'npx remotion render',
    requiresPython: false,
    requiresNode: true,
    githubUrl: 'https://github.com/remotion-dev/remotion',
    docUrl: 'https://www.remotion.dev/docs',
    installCmd: 'npm create video@latest',
  },
  'html-video': {
    id: 'html-video',
    name: 'html-video (nexu-io)',
    description: 'HTML/CSS + data → MP4. Agent-friendly. Supports pluggable render engines.',
    language: 'html',
    renderCmd: 'npx html-video render',
    requiresPython: false,
    requiresNode: true,
    githubUrl: 'https://github.com/nexu-io/html-video',
    docUrl: 'https://github.com/nexu-io/html-video#readme',
    installCmd: 'npm install -g html-video',
  },
  'motion-canvas': {
    id: 'motion-canvas',
    name: 'Motion Canvas',
    description: 'TypeScript vector animations. Precise frame-by-frame synced to audio.',
    language: 'typescript',
    renderCmd: 'npx motion-canvas render',
    requiresPython: false,
    requiresNode: true,
    githubUrl: 'https://github.com/motion-canvas/motion-canvas',
    docUrl: 'https://motioncanvas.io/docs',
    installCmd: 'npm create motion-canvas@latest',
  },
  manim: {
    id: 'manim',
    name: 'Manim (Code Video Generator)',
    description: 'Python-based programmatic animation engine (3Blue1Brown). Pure Python scripts.',
    language: 'python',
    renderCmd: 'python -m manim render scene.py',
    requiresPython: true,
    requiresNode: false,
    githubUrl: 'https://github.com/ManimCommunity/manim',
    docUrl: 'https://docs.manim.community',
    installCmd: 'pip install manim',
  },
  'prism-motion': {
    id: 'prism-motion',
    name: 'Prism Motion',
    description: 'FastAPI + React + Remotion full-stack pipeline. WebSocket rendering, AI scripts.',
    language: 'python',
    renderCmd: 'python main.py',
    requiresPython: true,
    requiresNode: true,
    githubUrl: 'https://github.com/rachitgoyal14/prismMotion-EvolveAI',
    docUrl: 'https://github.com/rachitgoyal14/prismMotion-EvolveAI#readme',
    installCmd: 'pip install -r requirements.txt && npm install',
  },
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
  projectPath: string  // parent story path
  engineProjectPath: string  // engine-specific subfolder
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
