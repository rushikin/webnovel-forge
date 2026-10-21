/**
 * Video Engine Index — prerequisite checker and scaffolder for all engines.
 * Each engine uses the story's video subfolder: <storyPath>/videos/<engine>/<slug>/
 */

import { spawnSync } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import type { VideoEngine, EngineCheckResult, EngineProject, EngineRenderResult } from './types'
import { ENGINE_REGISTRY } from './types'
import { sanitizeSlug, assertSafeSubpath } from '../securityUtils'

// ─── Prerequisite Checks ─────────────────────────────────────────────────────

function which(cmd: string): boolean {
  try {
    const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      encoding: 'utf8',
      timeout: 5000,
    })
    return result.status === 0
  } catch {
    return false
  }
}

function getVersion(cmd: string, args: string[]): string | null {
  try {
    const result = spawnSync(cmd, args, { encoding: 'utf8', timeout: 8000 })
    return result.status === 0 ? (result.stdout || '').trim().slice(0, 80) : null
  } catch {
    return null
  }
}

export async function checkEngine(engine: VideoEngine): Promise<EngineCheckResult> {
  const info = ENGINE_REGISTRY[engine]
  const issues: string[] = []
  const suggestions: string[] = []

  const nodeReady = which('node')
  const npmReady = which('npm') || which('npx')
  const ffmpegReady = which('ffmpeg')
  const pythonReady = which('python') || which('python3')

  if (info.requiresNode && !nodeReady) {
    issues.push('Node.js not found')
    suggestions.push('Install Node.js v22+ from https://nodejs.org')
  }
  if (info.requiresNode && !npmReady) {
    issues.push('npm/npx not found')
    suggestions.push('Reinstall Node.js — npm is bundled with it')
  }
  if (info.requiresPython && !pythonReady) {
    issues.push('Python not found')
    suggestions.push('Install Python 3.9+ from https://python.org')
  }
  if (!ffmpegReady) {
    issues.push('FFmpeg not found (required for MP4 rendering)')
    if (process.platform === 'win32') {
      suggestions.push('Run: winget install FFmpeg')
    } else if (process.platform === 'darwin') {
      suggestions.push('Run: brew install ffmpeg')
    } else {
      suggestions.push('Run: sudo apt install ffmpeg')
    }
  }

  // Engine-specific additional checks
  if (engine === 'hyperframes') {
    const hfReady = getVersion('npx', ['hyperframes', '--version'])
    if (!hfReady) {
      issues.push('Hyperframes not installed')
      suggestions.push('Run: npx skills add heygen-com/hyperframes --full-depth')
    }
  }
  if (engine === 'manim' || engine === 'prism-motion') {
    if (pythonReady) {
      const manimReady = getVersion('python', ['-m', 'manim', '--version'])
        || getVersion('python3', ['-m', 'manim', '--version'])
      if (!manimReady && engine === 'manim') {
        issues.push('Manim not installed')
        suggestions.push('Run: pip install manim')
      }
    }
  }

  return {
    engine,
    ready: issues.length === 0,
    nodeReady,
    pythonReady,
    ffmpegReady,
    issues,
    suggestions,
  }
}

// ─── Project Scaffolding ──────────────────────────────────────────────────────

export function getEngineProjectDir(storyPath: string, engine: VideoEngine, slug: string): string {
  const safeSlug = sanitizeSlug(slug)
  const relativeSubpath = path.join('videos', engine, safeSlug)
  return assertSafeSubpath(storyPath, relativeSubpath)
}

export function scaffoldEngineProject(
  storyPath: string,
  engine: VideoEngine,
  slug: string,
  title: string,
  storyContext?: Record<string, string>,
): EngineProject {
  const engineProjectPath = getEngineProjectDir(storyPath, engine, slug)
  fs.mkdirSync(engineProjectPath, { recursive: true })

  const meta: EngineProject = {
    engine,
    slug,
    title,
    projectPath: storyPath,
    engineProjectPath,
    createdAt: new Date().toISOString(),
  }

  // Write meta.json
  fs.writeFileSync(path.join(engineProjectPath, 'meta.json'), JSON.stringify(meta, null, 2))

  // Write engine-specific starter scaffold
  writeStarterScaffold(engine, engineProjectPath, slug, title, storyContext || {})

  return meta
}

function writeStarterScaffold(
  engine: VideoEngine,
  dir: string,
  slug: string,
  title: string,
  ctx: Record<string, string>,
): void {
  const safeTitle = title.replace(/['"]/g, '')
  const genre = ctx.genre || 'Epic Fantasy'
  const logline = ctx.logline || 'An epic story begins…'

  switch (engine) {
    case 'hyperframes':
    case 'html-video': {
      // HTML/CSS composition
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1920px; height: 1080px;
      background: #0a0a0f;
      font-family: 'Georgia', serif;
      color: #e8dcc8;
      display: flex; align-items: center; justify-content: center;
      overflow: hidden;
    }
    .container { text-align: center; }
    h1 {
      font-size: 96px;
      color: #c9a84c;
      text-shadow: 0 0 40px rgba(201,168,76,0.6);
      opacity: 0;
      animation: fadeIn 1.5s ease forwards 0.5s;
    }
    .tagline {
      font-size: 32px;
      margin-top: 24px;
      opacity: 0;
      animation: fadeIn 1.5s ease forwards 1.5s;
    }
    @keyframes fadeIn { to { opacity: 1; } }
  </style>
</head>
<body>
  <!-- duration: 10s -->
  <div class="container">
    <h1>${safeTitle}</h1>
    <p class="tagline">${logline}</p>
  </div>
</body>
</html>`
      fs.writeFileSync(path.join(dir, 'index.html'), html)
      break
    }

    case 'remotion': {
      // Remotion React component starter
      const compName = `${slug.replace(/-/g, '_').replace(/^\d/, '_$&')}Composition`
      const tsx = `import React from 'react'
import { AbsoluteFill, useCurrentFrame, interpolate, useVideoConfig } from 'remotion'

export const ${compName}: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const titleOpacity = interpolate(frame, [0, fps * 1.5], [0, 1], { extrapolateRight: 'clamp' })
  const taglineOpacity = interpolate(frame, [fps * 1.5, fps * 2.5], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0f', justifyContent: 'center', alignItems: 'center', fontFamily: 'Georgia' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 96, color: '#c9a84c', opacity: titleOpacity, margin: 0 }}>
          ${safeTitle}
        </h1>
        <p style={{ fontSize: 32, color: '#e8dcc8', opacity: taglineOpacity, marginTop: 24 }}>
          ${logline}
        </p>
      </div>
    </AbsoluteFill>
  )
}
`
      fs.writeFileSync(path.join(dir, 'Composition.tsx'), tsx)

      // Root.tsx registers the composition ID
      const rootTsx = `import React from 'react'
import { Composition } from 'remotion'
import { ${compName} } from './Composition'

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="EpisodeComposition"
      component={${compName}}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
    />
  )
}
`
      fs.writeFileSync(path.join(dir, 'Root.tsx'), rootTsx)

      // index.ts registers the root
      const indexTs = `import { registerRoot } from 'remotion'
import { RemotionRoot } from './Root'

registerRoot(RemotionRoot)
`
      fs.writeFileSync(path.join(dir, 'index.ts'), indexTs)

      // package.json for Remotion dependencies
      const pkgJson = {
        name: `remotion-${slug}`,
        version: '1.0.0',
        private: true,
        scripts: {
          build: 'remotion render index.ts EpisodeComposition out.mp4'
        },
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
          remotion: '^4.0.0'
        }
      }
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkgJson, null, 2))

      // remotion.config.ts
      const config = `import { Config } from '@remotion/cli/config'
Config.setVideoImageFormat('jpeg')
Config.setOverwriteOutput(true)
`
      fs.writeFileSync(path.join(dir, 'remotion.config.ts'), config)
      break
    }

    case 'motion-canvas': {
      // Motion Canvas TypeScript scene
      const scene = `import { makeScene2D, Txt, Rect, waitFor, all, tween, easeInOutCubic } from '@motion-canvas/2d'
import { createRef, Vector2 } from '@motion-canvas/core'

export default makeScene2D(function* (view) {
  view.fill('#0a0a0f')

  const titleRef = createRef<Txt>()
  const taglineRef = createRef<Txt>()

  view.add(
    <>
      <Txt
        ref={titleRef}
        text="${safeTitle}"
        fontSize={96}
        fill={'#c9a84c'}
        opacity={0}
        fontFamily={'Georgia'}
      />
      <Txt
        ref={taglineRef}
        text="${logline}"
        fontSize={32}
        fill={'#e8dcc8'}
        opacity={0}
        y={80}
        fontFamily={'Georgia'}
      />
    </>
  )

  yield* all(
    tween(1.5, v => titleRef().opacity(easeInOutCubic(v))),
  )
  yield* waitFor(0.5)
  yield* tween(1.5, v => taglineRef().opacity(easeInOutCubic(v)))
  yield* waitFor(2)
})
`
      fs.writeFileSync(path.join(dir, 'scene.ts'), scene)
      break
    }

    case 'manim': {
      // Manim Python scene
      const py = `from manim import *

class ${slug.replace(/-/g, '_').replace(/^\d/, '_$&')}Scene(Scene):
    def construct(self):
        title = Text("${safeTitle}", font_size=72, color=GOLD)
        tagline = Text("${logline}", font_size=28, color=WHITE)
        tagline.next_to(title, DOWN, buff=0.5)

        self.play(FadeIn(title, run_time=1.5))
        self.wait(0.5)
        self.play(FadeIn(tagline, run_time=1.5))
        self.wait(2)
        self.play(FadeOut(title), FadeOut(tagline))
`
      fs.writeFileSync(path.join(dir, 'scene.py'), py)
      break
    }

    case 'prism-motion': {
      // Prism Motion request payload template
      const payload = {
        title: safeTitle,
        script: logline,
        genre,
        duration: 30,
        style: 'cinematic',
        engine: 'remotion',
      }
      fs.writeFileSync(path.join(dir, 'request.json'), JSON.stringify(payload, null, 2))
      const readme = `# Prism Motion Project: ${safeTitle}

Start the Prism Motion FastAPI server, then run:

\`\`\`bash
curl -X POST http://localhost:8000/generate \\
  -H "Content-Type: application/json" \\
  -d @request.json
\`\`\`

The server will return a video URL when rendering completes.
`
      fs.writeFileSync(path.join(dir, 'README.md'), readme)
      break
    }
  }
}

// ─── List Engine Projects ─────────────────────────────────────────────────────

export function listEngineProjects(storyPath: string, engine?: VideoEngine): EngineProject[] {
  const videosDir = path.join(storyPath, 'videos')
  const projects: EngineProject[] = []

  const engines: VideoEngine[] = engine
    ? [engine]
    : ['hyperframes', 'remotion', 'html-video', 'motion-canvas', 'manim', 'prism-motion']

  for (const eng of engines) {
    const engDir = path.join(videosDir, eng)
    if (!fs.existsSync(engDir)) continue
    const slugs = fs.readdirSync(engDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)

    for (const slug of slugs) {
      const metaPath = path.join(engDir, slug, 'meta.json')
      if (!fs.existsSync(metaPath)) continue
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as EngineProject
        // Check for rendered output
        const mp4Path = path.join(engDir, slug, 'output.mp4')
        if (fs.existsSync(mp4Path)) {
          meta.outputMp4 = mp4Path
          meta.lastRenderAt = fs.statSync(mp4Path).mtime.toISOString()
        }
        projects.push(meta)
      } catch {}
    }
  }

  return projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// ─── Render Dispatcher ───────────────────────────────────────────────────────

export async function renderEngineProject(
  storyPath: string,
  engine: VideoEngine,
  slug: string,
): Promise<EngineRenderResult> {
  const dir = getEngineProjectDir(storyPath, engine, slug)
  if (!fs.existsSync(dir)) {
    return { success: false, error: `Project directory not found: ${dir}` }
  }

  const start = Date.now()
  const outputMp4 = path.join(dir, 'output.mp4')
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'

  const runSafeCmd = (cmd: string, args: string[], timeoutMs: number) => {
    const res = spawnSync(cmd, args, {
      cwd: dir,
      timeout: timeoutMs,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    if (res.error) throw res.error
    if (res.status !== 0) {
      throw new Error(res.stderr || res.stdout || `Process exited with code ${res.status}`)
    }
    return res
  }

  try {
    switch (engine) {
      case 'hyperframes': {
        runSafeCmd(npxCmd, ['hyperframes', 'render', '-o', outputMp4], 5 * 60 * 1000)
        break
      }

      case 'html-video': {
        runSafeCmd(npxCmd, ['html-video', 'render', 'index.html', '-o', outputMp4], 5 * 60 * 1000)
        break
      }

      case 'remotion': {
        const entryFile = fs.existsSync(path.join(dir, 'index.ts')) ? 'index.ts' : 'Root.tsx'
        const compId = 'EpisodeComposition'
        runSafeCmd(npxCmd, ['remotion', 'render', entryFile, compId, outputMp4], 10 * 60 * 1000)
        break
      }

      case 'motion-canvas': {
        runSafeCmd(npxCmd, ['motion-canvas', 'render'], 10 * 60 * 1000)
        // Find mp4 in output folder recursively and copy to standard outputMp4
        const outputFolder = path.join(dir, 'output')
        if (fs.existsSync(outputFolder)) {
          const findMp4 = (folder: string): string | null => {
            const entries = fs.readdirSync(folder, { withFileTypes: true })
            for (const entry of entries) {
              const full = path.join(folder, entry.name)
              if (entry.isDirectory()) {
                const found = findMp4(full)
                if (found) return found
              } else if (entry.name.endsWith('.mp4')) {
                return full
              }
            }
            return null
          }
          const found = findMp4(outputFolder)
          if (found && found !== outputMp4) {
            fs.copyFileSync(found, outputMp4)
          }
        }
        break
      }

      case 'manim': {
        const safeScene = sanitizeSlug(slug).replace(/-/g, '_').replace(/^\d/, '_$&') + 'Scene'
        runSafeCmd(pythonCmd, ['-m', 'manim', 'scene.py', safeScene, '-qh', '-o', 'output'], 15 * 60 * 1000)
        // Manim places output in media/videos/ — search dynamically
        if (!fs.existsSync(outputMp4)) {
          const mediaDir = path.join(dir, 'media', 'videos')
          if (fs.existsSync(mediaDir)) {
            const findMp4 = (folder: string): string | null => {
              const entries = fs.readdirSync(folder, { withFileTypes: true })
              for (const entry of entries) {
                const full = path.join(folder, entry.name)
                if (entry.isDirectory()) {
                  const found = findMp4(full)
                  if (found) return found
                } else if (entry.name.endsWith('.mp4')) {
                  return full
                }
              }
              return null
            }
            const found = findMp4(mediaDir)
            if (found && found !== outputMp4) {
              fs.copyFileSync(found, outputMp4)
            }
          }
        }
        break
      }

      case 'prism-motion': {
        return {
          success: false,
          error: 'Prism Motion requires a running FastAPI server. See README.md in the project folder for instructions.',
        }
      }
    }

    if (!fs.existsSync(outputMp4)) {
      return { success: false, error: 'Render completed but output.mp4 was not found.' }
    }

    // Update meta with render timestamp
    const metaPath = path.join(dir, 'meta.json')
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
      meta.lastRenderAt = new Date().toISOString()
      meta.outputMp4 = outputMp4
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
    }

    return {
      success: true,
      outputPath: outputMp4,
      durationMs: Date.now() - start,
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || String(err),
    }
  }
}

// ─── Read / Write Source File ─────────────────────────────────────────────────

export function readEngineSource(storyPath: string, engine: VideoEngine, slug: string): string {
  const dir = getEngineProjectDir(storyPath, engine, slug)
  const fileMap: Record<VideoEngine, string> = {
    hyperframes: 'index.html',
    'html-video': 'index.html',
    remotion: 'Composition.tsx',
    'motion-canvas': 'scene.ts',
    manim: 'scene.py',
    'prism-motion': 'request.json',
  }
  const file = path.join(dir, fileMap[engine])
  if (!fs.existsSync(file)) return ''
  return fs.readFileSync(file, 'utf8')
}

export function writeEngineSource(
  storyPath: string,
  engine: VideoEngine,
  slug: string,
  content: string,
): void {
  const dir = getEngineProjectDir(storyPath, engine, slug)
  const fileMap: Record<VideoEngine, string> = {
    hyperframes: 'index.html',
    'html-video': 'index.html',
    remotion: 'Composition.tsx',
    'motion-canvas': 'scene.ts',
    manim: 'scene.py',
    'prism-motion': 'request.json',
  }
  const file = path.join(dir, fileMap[engine])
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, content, 'utf8')
}
