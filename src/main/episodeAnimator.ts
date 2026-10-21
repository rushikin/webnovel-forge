/**
 * Episode Animator — parses chapters into scenes & conversations,
 * and compiles them into animated video compositions (Hyperframes, Remotion, etc.)
 */

import * as fs from 'fs'
import * as path from 'path'
import type { VideoEngine, EngineProject } from './videoEngines/types'
import { scaffoldEngineProject, writeEngineSource } from './videoEngines'

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

/**
 * Parses chapter prose or outline beat into structured scenes and conversations using AI.
 */
export async function parseEpisodeIntoScenes(
  apiKey: string,
  chapterNumber: number,
  content: string,
  beatSummary: string,
  characters: any[],
  ollamaConfig?: { enabled: boolean; host: string; model: string }
): Promise<EpisodeBreakdown> {
  const charContext = characters.map(c => `${c.name} (${c.role || 'character'}): Voice=${c.voice_fingerprint || 'neutral'}`).join('; ')

  const systemPrompt = `You are an elite cinematic scriptwriter and anime/web-novel storyboard director.
Your job is to take a web novel chapter/episode and break it down into 3 to 6 dramatic visual SCENES with CONVERSATIONS.

OUTPUT FORMAT: You MUST return strictly a raw valid JSON object with NO Markdown wrappers, following this exact schema:
{
  "episodeNumber": ${chapterNumber},
  "title": "Episode title",
  "summary": "Brief 1-sentence episode premise",
  "totalDurationSeconds": 24,
  "scenes": [
    {
      "sceneIndex": 1,
      "title": "Scene headline",
      "setting": "Visual environment (e.g. Ancestral Hall, Rain-slicked rooftops, Cultivation chamber)",
      "durationSeconds": 6,
      "charactersPresent": ["Character A", "Character B"],
      "actionDescription": "Dramatic visual action or mood",
      "conversations": [
        {
          "speaker": "Character A",
          "text": "Exact spoken line (punchy, 1-2 sentences)",
          "emotion": "furious / cold / whispering / resolved"
        }
      ]
    }
  ]
}`

  const userPrompt = `Break this episode into dramatic scenes with conversations:
Episode Number: ${chapterNumber}
Outline Beat: ${beatSummary || 'Key chapter event'}
Characters: ${charContext || 'Protagonist and rivals'}

Chapter Text / Content:
${content.slice(0, 4000)}

Return strictly valid JSON now.`

  let responseText = ''

  if (ollamaConfig?.enabled && ollamaConfig.model) {
    try {
      const res = await fetch(`${ollamaConfig.host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaConfig.model,
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          stream: false,
        }),
      })
      const data: any = await res.json()
      responseText = data.response || ''
    } catch (err) {
      console.error('Ollama scene parse error:', err)
    }
  }

  if (!responseText && apiKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.5,
        }),
      })
      const data: any = await res.json()
      responseText = data.choices?.[0]?.message?.content || ''
    } catch (err) {
      console.error('OpenRouter scene parse error:', err)
    }
  }

  // Fallback heuristic parser if AI fails or no API key configured
  let breakdown: EpisodeBreakdown
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      breakdown = JSON.parse(jsonMatch[0])
    } else {
      throw new Error('No JSON found')
    }
  } catch {
    // Deterministic fallback
    breakdown = createFallbackEpisodeBreakdown(chapterNumber, content || beatSummary, characters)
  }

  return breakdown
}

export function createFallbackEpisodeBreakdown(
  chapterNumber: number,
  text: string,
  characters: any[]
): EpisodeBreakdown {
  const mainChar = characters[0]?.name || 'Protagonist'
  const secondChar = characters[1]?.name || 'Rival'

  return {
    episodeNumber: chapterNumber,
    title: `Episode ${chapterNumber}: The Confrontation`,
    summary: text.slice(0, 100) || `The crucial turning point of Chapter ${chapterNumber}.`,
    totalDurationSeconds: 18,
    scenes: [
      {
        sceneIndex: 1,
        title: 'Opening Confrontation',
        setting: 'Misty Mountains Sanctuary',
        durationSeconds: 6,
        charactersPresent: [mainChar],
        actionDescription: 'Heavy rain falls as the aura gathers.',
        conversations: [
          {
            speaker: mainChar,
            text: 'I told you... I would return to settle this debt.',
            emotion: 'cold determination',
          },
        ],
      },
      {
        sceneIndex: 2,
        title: 'The Clash of Oaths',
        setting: 'Shattered Obsidian Courtyard',
        durationSeconds: 6,
        charactersPresent: [mainChar, secondChar],
        actionDescription: 'Sparks fly as their spirits collide.',
        conversations: [
          {
            speaker: secondChar,
            text: 'You overestimate your strength in this realm!',
            emotion: 'arrogant',
          },
        ],
      },
      {
        sceneIndex: 3,
        title: 'The Awakening Cliffhanger',
        setting: 'Vortex of Golden Qi',
        durationSeconds: 6,
        charactersPresent: [mainChar],
        actionDescription: 'A blinding surge reveals an ancient martial mark.',
        conversations: [
          {
            speaker: mainChar,
            text: 'Then watch closely. This is my true dao.',
            emotion: 'transcendent',
          },
        ],
      },
    ],
  }
}

/**
 * Compiles an EpisodeBreakdown into a multi-scene, timed HeyGen Hyperframes HTML composition.
 */
export function compileEpisodeToHyperframes(
  breakdown: EpisodeBreakdown,
  aspectRatio: '16:9' | '9:16' = '16:9',
  stylePreset: string = 'cinematic_gold'
): string {
  const isPortrait = aspectRatio === '9:16'
  const width = isPortrait ? 1080 : 1920
  const height = isPortrait ? 1920 : 1080

  const totalDuration = breakdown.scenes.reduce((acc, s) => acc + s.durationSeconds, 0) || 20

  // Pre-calculate start offsets for each scene
  let currentOffset = 0
  const timedScenes = breakdown.scenes.map((scene) => {
    const start = currentOffset
    currentOffset += scene.durationSeconds
    return { ...scene, startOffset: start }
  })

  // Generate scenes HTML
  const scenesHtml = timedScenes.map((scene) => {
    const dialog = scene.conversations[0] || { speaker: 'Narrator', text: scene.actionDescription, emotion: 'intense' }
    return `
    <!-- Scene ${scene.sceneIndex}: ${scene.title} -->
    <div class="clip scene-layer" data-start="${scene.startOffset}" data-duration="${scene.durationSeconds}" data-track-index="${scene.sceneIndex}">
      <!-- Scene Background Backdrop -->
      <div class="scene-bg" style="background: radial-gradient(circle at 50% 40%, rgba(201,168,76,0.18) 0%, rgba(10,10,15,0.98) 75%);"></div>
      
      <!-- Setting Tag -->
      <div class="setting-tag">
        <span class="scene-num">SCENE ${scene.sceneIndex}</span>
        <span class="setting-name">📍 ${scene.setting}</span>
      </div>

      <!-- Action & Atmosphere Banner -->
      <div class="action-desc">
        ${scene.actionDescription}
      </div>

      <!-- Conversation Dialogue Box -->
      <div class="dialogue-card">
        <div class="speaker-row">
          <div class="speaker-avatar">${dialog.speaker.charAt(0)}</div>
          <div class="speaker-meta">
            <span class="speaker-name">${dialog.speaker}</span>
            <span class="speaker-emotion">${dialog.emotion || 'spoken'}</span>
          </div>
        </div>
        <div class="speech-bubble">
          <p class="dialogue-text">"${dialog.text}"</p>
        </div>
      </div>
    </div>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Episode ${breakdown.episodeNumber}: ${breakdown.title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;800;900&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${width}px;
      height: ${height}px;
      background: #0a0a0f;
      color: #e8dcc8;
      font-family: 'Inter', sans-serif;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    #stage {
      position: relative;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: #060609;
    }

    /* Episode Watermark Header */
    .episode-header {
      position: absolute;
      top: 40px;
      left: 60px;
      z-index: 50;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .badge {
      background: rgba(201,168,76,0.15);
      border: 1px solid rgba(201,168,76,0.4);
      color: #c9a84c;
      font-family: 'Cinzel', serif;
      font-weight: 800;
      font-size: 16px;
      padding: 6px 14px;
      border-radius: 6px;
      letter-spacing: 2px;
    }
    .ep-title {
      font-family: 'Cinzel', serif;
      font-size: 24px;
      color: #ffffff;
      text-shadow: 0 0 20px rgba(201,168,76,0.5);
    }

    /* Scene Container */
    .scene-layer {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 120px 80px 80px 80px;
      opacity: 0;
    }
    .scene-bg {
      position: absolute;
      inset: 0;
      z-index: 1;
    }

    /* Setting Tag */
    .setting-tag {
      position: relative;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .scene-num {
      background: #c9a84c;
      color: #0a0a0f;
      font-weight: 900;
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 4px;
      letter-spacing: 1px;
    }
    .setting-name {
      font-size: 16px;
      color: #a0a6b5;
      font-weight: 600;
    }

    /* Action Atmosphere */
    .action-desc {
      position: relative;
      z-index: 10;
      font-family: 'Cinzel', serif;
      font-size: 32px;
      color: #f5eedf;
      max-width: 80%;
      line-height: 1.4;
      text-shadow: 0 2px 10px rgba(0,0,0,0.8);
      font-style: italic;
    }

    /* Dialogue Card */
    .dialogue-card {
      position: relative;
      z-index: 10;
      background: rgba(15, 17, 23, 0.88);
      border: 1px solid rgba(201,168,76,0.3);
      border-left: 6px solid #c9a84c;
      border-radius: 12px;
      padding: 24px 32px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.7);
      backdrop-filter: blur(12px);
      max-width: ${isPortrait ? '90%' : '75%'};
    }
    .speaker-row {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 12px;
    }
    .speaker-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #c9a84c;
      color: #0a0a0f;
      font-weight: 900;
      font-size: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 16px rgba(201,168,76,0.5);
    }
    .speaker-name {
      font-weight: 800;
      font-size: 18px;
      color: #ffffff;
      display: block;
    }
    .speaker-emotion {
      font-size: 12px;
      color: #c9a84c;
      text-transform: uppercase;
      letter-spacing: 1.5px;
    }
    .dialogue-text {
      font-size: 24px;
      color: #e8dcc8;
      line-height: 1.5;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div id="stage" data-composition-id="composition" data-start="0" data-duration="${totalDuration}" data-width="${width}" data-height="${height}">
    <!-- Global Header -->
    <div class="episode-header">
      <div class="badge">EPISODE ${breakdown.episodeNumber}</div>
      <div class="ep-title">${breakdown.title}</div>
    </div>

    ${scenesHtml}
  </div>

  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <script>
    const tl = gsap.timeline({ paused: true });
    const scenes = document.querySelectorAll('.scene-layer');

    scenes.forEach((scene) => {
      const start = parseFloat(scene.dataset.start);
      const duration = parseFloat(scene.dataset.duration);
      const card = scene.querySelector('.dialogue-card');
      const action = scene.querySelector('.action-desc');

      // Fade in scene
      tl.to(scene, { opacity: 1, duration: 0.6, ease: 'power2.out' }, start);

      if (action) {
        tl.from(action, { y: 20, opacity: 0, duration: 0.8, ease: 'power3.out' }, start + 0.2);
      }

      if (card) {
        tl.from(card, { y: 40, opacity: 0, duration: 0.7, ease: 'back.out(1.2)' }, start + 0.5);
      }

      // Fade out scene before next
      tl.to(scene, { opacity: 0, duration: 0.5, ease: 'power2.in' }, start + duration - 0.5);
    });

    window.__timelines = window.__timelines || {};
    window.__timelines['composition'] = tl;
  </script>
</body>
</html>`
}

/**
 * Automates the complete Episode to Video process:
 * 1. Parses chapter into scenes & dialogue
 * 2. Compiles into selected engine code
 * 3. Scaffolds video project
 * 4. Saves composition ready for rendering!
 */
export async function autoAnimateEpisode(payload: {
  projectPath: string
  engine: VideoEngine
  chapterNumber: number
  chapterText: string
  beatSummary: string
  characters: any[]
  apiKey?: string
  aspectRatio?: '16:9' | '9:16'
  stylePreset?: string
  ollamaConfig?: { enabled: boolean; host: string; model: string }
}): Promise<{
  success: boolean
  breakdown: EpisodeBreakdown
  project: EngineProject
  code: string
  error?: string
}> {
  try {
    const slug = `episode-${payload.chapterNumber}`

    // 1. Resolve chapter text from disk if not provided
    let chapterText = payload.chapterText || ''
    if (!chapterText && payload.projectPath) {
      const padded = String(payload.chapterNumber).padStart(2, '0')
      const p1 = path.join(payload.projectPath, 'chapters', `ch${padded}.md`)
      const p2 = path.join(payload.projectPath, 'chapters', `ch${payload.chapterNumber}.md`)
      if (fs.existsSync(p1)) {
        chapterText = fs.readFileSync(p1, 'utf-8')
      } else if (fs.existsSync(p2)) {
        chapterText = fs.readFileSync(p2, 'utf-8')
      }
    }

    // 2. Parse into scenes & conversations
    const breakdown = await parseEpisodeIntoScenes(
      payload.apiKey || '',
      payload.chapterNumber,
      chapterText,
      payload.beatSummary || `Chapter ${payload.chapterNumber}`,
      payload.characters || [],
      payload.ollamaConfig
    )

    // 3. Scaffold engine project (FIX BUG-14: corrected step numbering)
    const project = scaffoldEngineProject(
      payload.projectPath,
      payload.engine,
      slug,
      `Episode ${payload.chapterNumber}: ${breakdown.title}`,
      {
        logline: breakdown.summary,
        genre: 'Web Novel Anime Adaptation',
      }
    )

    // 4. Compile code based on engine (FIX BUG-15: pass aspectRatio and stylePreset to Remotion)
    let code = ''
    if (payload.engine === 'hyperframes' || payload.engine === 'html-video') {
      code = compileEpisodeToHyperframes(breakdown, payload.aspectRatio || '16:9', payload.stylePreset)
    } else if (payload.engine === 'remotion') {
      code = compileEpisodeToRemotion(breakdown, payload.aspectRatio || '16:9', payload.stylePreset)
    } else {
      // Default to HTML composition
      code = compileEpisodeToHyperframes(breakdown, payload.aspectRatio || '16:9', payload.stylePreset)
    }

    // 5. Save composition into project directory
    writeEngineSource(payload.projectPath, payload.engine, slug, code)

    // 6. If engine is hyperframes, also sync to native videos/ directory for live player preview
    if (payload.engine === 'hyperframes') {
      try {
        const vDir = path.join(payload.projectPath, 'videos', slug)
        if (!fs.existsSync(vDir)) fs.mkdirSync(vDir, { recursive: true })
        const meta = {
          slug,
          title: `Episode ${payload.chapterNumber}: ${breakdown.title}`,
          templateType: 'chapter_teaser',
          aspectRatio: payload.aspectRatio || '16:9',
          width: payload.aspectRatio === '9:16' ? 1080 : 1920,
          height: payload.aspectRatio === '9:16' ? 1920 : 1080,
          duration: breakdown.totalDurationSeconds || 24,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          hasRenderedVideo: false,
          description: breakdown.summary,
          targetChapter: payload.chapterNumber,
        }
        fs.writeFileSync(path.join(vDir, 'metadata.json'), JSON.stringify(meta, null, 2))
        fs.writeFileSync(path.join(vDir, 'index.html'), code)
      } catch (syncErr) {
        console.warn('Could not sync to native videos dir:', syncErr)
      }
    }

    return {
      success: true,
      breakdown,
      project,
      code,
    }
  } catch (error: any) {
    console.error('Failed to auto animate episode:', error)
    return {
      success: false,
      breakdown: createFallbackEpisodeBreakdown(payload.chapterNumber, payload.chapterText, payload.characters),
      project: null as any,
      code: '',
      error: error.message || 'Auto animation failed',
    }
  }
}

function compileEpisodeToRemotion(
  breakdown: EpisodeBreakdown,
  aspectRatio: '16:9' | '9:16' = '16:9',
  stylePreset: string = 'cinematic_gold'
): string {
  const fps = 30
  const isPortrait = aspectRatio === '9:16'
  const scenesJson = JSON.stringify(breakdown.scenes, null, 2)

  const accentColor = stylePreset === 'cyberpunk_neon' ? '#00f2fe'
    : stylePreset === 'dark_fantasy' ? '#9d4edd'
    : stylePreset === 'vintage_parchment' ? '#d4a373'
    : stylePreset === 'celestial_anime' ? '#70d6ff'
    : '#c9a84c'

  const paddingVal = isPortrait ? 24 : 80
  const cardMaxWidth = isPortrait ? 540 : 900

  return `import React from 'react'
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion'

const scenes = ${scenesJson}

export const EpisodeComposition: React.FC = () => {
  const { fps } = useVideoConfig()

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0f', color: '#e8dcc8', fontFamily: 'Inter, sans-serif' }}>
      {/* Episode Header */}
      <div style={{ position: 'absolute', top: 40, left: ${isPortrait ? 30 : 60}, zIndex: 50, display: 'flex', gap: 16 }}>
        <span style={{ background: 'rgba(201,168,76,0.2)', border: '1px solid ${accentColor}', color: '${accentColor}', padding: '6px 14px', borderRadius: 6, fontWeight: 'bold' }}>
          EPISODE ${breakdown.episodeNumber}
        </span>
        <span style={{ fontSize: ${isPortrait ? 20 : 24}, color: '#fff', fontWeight: 'bold' }}>
          ${breakdown.title.replace(/"/g, '\\"')}
        </span>
      </div>

      {scenes.map((scene, idx) => {
        let fromFrame = 0
        for (let i = 0; i < idx; i++) {
          fromFrame += scenes[i].durationSeconds * fps
        }
        const durationInFrames = scene.durationSeconds * fps
        const dialogue = scene.conversations[0] || { speaker: 'Narrator', text: scene.actionDescription }

        return (
          <Sequence key={scene.sceneIndex} from={fromFrame} durationInFrames={durationInFrames}>
            <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: ${paddingVal} }}>
              <div style={{ background: 'rgba(15, 17, 23, 0.9)', borderLeft: '6px solid ${accentColor}', borderRadius: 12, padding: 32, maxWidth: ${cardMaxWidth}, width: '100%' }}>
                <div style={{ fontSize: 14, color: '${accentColor}', textTransform: 'uppercase', marginBottom: 8 }}>
                  📍 {scene.setting}
                </div>
                <div style={{ fontSize: 22, color: '#fff', fontWeight: 'bold', marginBottom: 12 }}>
                  {dialogue.speaker}:
                </div>
                <div style={{ fontSize: ${isPortrait ? 22 : 28}, color: '#e8dcc8', fontStyle: 'italic', lineHeight: 1.4 }}>
                  "{dialogue.text}"
                </div>
              </div>
            </AbsoluteFill>
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
`
}
