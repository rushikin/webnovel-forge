import * as path from 'path'
import * as fs from 'fs'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
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

const execAsync = promisify(exec)

/**
 * Hyperframes Doctor: checks system environment (Node version, FFmpeg, npx)
 */
export async function hyperframesDoctor(): Promise<VideoDoctorStatus> {
  const diagnostics: string[] = []
  let nodeInstalled = false
  let nodeVersion = ''
  let nodeVersionOk = false
  let ffmpegInstalled = false
  let ffmpegVersion = ''
  let npxInstalled = false
  let hyperframesInstalled = false

  // 1. Check Node.js
  try {
    const { stdout } = await execAsync('node -v')
    nodeVersion = stdout.trim()
    nodeInstalled = true
    const majorMatch = nodeVersion.match(/^v?(\d+)/)
    const major = majorMatch ? parseInt(majorMatch[1], 10) : 0
    nodeVersionOk = major >= 20
    if (major >= 22) {
      diagnostics.push(`✓ Node.js ${nodeVersion} detected (v22+ recommended)`)
    } else if (major >= 20) {
      diagnostics.push(`✓ Node.js ${nodeVersion} detected (v22+ recommended for latest Hyperframes features)`)
    } else {
      diagnostics.push(`⚠ Node.js ${nodeVersion} is older than v20. Please upgrade to Node 22+ from https://nodejs.org`)
    }
  } catch (e: any) {
    diagnostics.push(`✗ Node.js not found in PATH. Install from https://nodejs.org`)
  }

  // 2. Check FFmpeg
  try {
    const { stdout, stderr } = await execAsync('ffmpeg -version')
    const out = stdout || stderr
    const versionMatch = out.match(/ffmpeg version ([^\s]+)/i)
    ffmpegVersion = versionMatch ? versionMatch[1] : 'Installed'
    ffmpegInstalled = true
    diagnostics.push(`✓ FFmpeg detected (${ffmpegVersion})`)
  } catch (e: any) {
    diagnostics.push(`✗ FFmpeg not found in PATH. Install via 'winget install FFmpeg' (Windows) or 'brew install ffmpeg' (Mac)`)
  }

  // 3. Check npx
  try {
    const { stdout } = await execAsync('npx --version')
    npxInstalled = true
    diagnostics.push(`✓ npx available (v${stdout.trim()})`)
  } catch (e: any) {
    diagnostics.push(`✗ npx command not found. Ensure npm/Node is properly configured in PATH`)
  }

  // 4. Check hyperframes via npx
  try {
    const { stdout } = await execAsync('npx hyperframes --version', { timeout: 8000 })
    hyperframesInstalled = true
    diagnostics.push(`✓ Hyperframes CLI ready (${stdout.trim()})`)
  } catch {
    diagnostics.push(`ℹ Hyperframes CLI will be executed on-demand via npx hyperframes`)
  }

  const allReady = nodeInstalled && nodeVersionOk && ffmpegInstalled && npxInstalled

  return {
    nodeInstalled,
    nodeVersion,
    nodeVersionOk,
    ffmpegInstalled,
    ffmpegVersion,
    npxInstalled,
    hyperframesInstalled,
    allReady,
    diagnostics,
  }
}

/**
 * Ensure the project's videos root folder exists
 */
function ensureVideosDir(projectPath: string): string {
  const videosDir = path.join(projectPath, 'videos')
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true })
  }
  return videosDir
}

/**
 * Get dimensions for given aspect ratio
 */
export function getDimensionsForAspectRatio(aspectRatio: VideoAspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920 }
    case '1:1':
      return { width: 1080, height: 1080 }
    case '16:9':
    default:
      return { width: 1920, height: 1080 }
  }
}

/**
 * Generate starter Hyperframes HTML for built-in templates
 */
export function getTemplateComposition(
  templateType: VideoTemplateType,
  title: string,
  aspectRatio: VideoAspectRatio,
  duration: number = 20,
  storyContext?: {
    premise?: string
    worldSetting?: string
    characterName?: string
    characterVoice?: string
    chapterNumber?: number
    chapterBeat?: string
  }
): string {
  const dims = getDimensionsForAspectRatio(aspectRatio)
  const safeTitle = title || 'Epic Web Novel'
  const premise = storyContext?.premise || 'In a world bound by ancient fate, one soul dares to rewrite destiny.'
  const characterName = storyContext?.characterName || 'The Protagonist'
  const characterVoice = storyContext?.characterVoice || '"I will carve my own path through the heavens."'
  const chapterNumber = storyContext?.chapterNumber || 1
  const chapterBeat = storyContext?.chapterBeat || 'The awakening of an ancient power changes everything.'
  const worldSetting = storyContext?.worldSetting || 'An immortal realm of cultivation, magic, and boundless mysteries.'

  // Audio/BGM placeholder per spec §6.1 — ambient soundtrack with volume control
  const audioTrack = `<audio class="clip" data-start="0" data-duration="${duration}" data-volume="0.8" data-track-index="99" data-bgm="ambient" src="" style="display:none"></audio>`

  if (templateType === 'character_spotlight') {
    // 9:16 or 16:9 Character Spotlight Template
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} - Character Spotlight</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Inter:wght@400;600;800&family=Playfair+Display:ital,wght@1,600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0b0c10; color: #fff; overflow: hidden; font-family: 'Inter', sans-serif; }
    
    #stage {
      position: relative;
      width: ${dims.width}px;
      height: ${dims.height}px;
      background: radial-gradient(circle at 50% 30%, #1f2833 0%, #0b0c10 80%);
      overflow: hidden;
    }

    .bg-glow {
      position: absolute;
      top: 20%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, rgba(216, 164, 72, 0.25) 0%, rgba(216, 164, 72, 0) 70%);
      filter: blur(40px);
      pointer-events: none;
    }

    .clip {
      position: absolute;
      will-change: transform, opacity;
    }

    /* Badge Header */
    .char-badge {
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(216, 164, 72, 0.15);
      border: 1px solid rgba(216, 164, 72, 0.4);
      padding: 10px 24px;
      border-radius: 9999px;
      font-size: 18px;
      letter-spacing: 4px;
      text-transform: uppercase;
      color: #D8A448;
      font-weight: 700;
    }

    /* Character Visual Box */
    .char-avatar-container {
      top: 180px;
      left: 50%;
      transform: translateX(-50%);
      width: 320px;
      height: 320px;
      border-radius: 24px;
      background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02));
      border: 2px solid rgba(216, 164, 72, 0.5);
      box-shadow: 0 20px 50px rgba(0,0,0,0.6), 0 0 30px rgba(216, 164, 72, 0.2);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 24px;
    }

    .char-avatar-icon {
      font-size: 80px;
      margin-bottom: 12px;
      filter: drop-shadow(0 0 20px rgba(216, 164, 72, 0.5));
    }

    /* Character Name */
    .char-name {
      top: 540px;
      left: 0;
      width: 100%;
      text-align: center;
      font-family: 'Cinzel', serif;
      font-size: 52px;
      font-weight: 900;
      color: #FFFFFF;
      text-shadow: 0 4px 20px rgba(0,0,0,0.8), 0 0 30px rgba(216, 164, 72, 0.4);
      letter-spacing: 2px;
    }

    /* Subtitle / Role */
    .char-role {
      top: 610px;
      left: 0;
      width: 100%;
      text-align: center;
      font-size: 22px;
      color: #D8A448;
      letter-spacing: 3px;
      text-transform: uppercase;
      font-weight: 600;
    }

    /* Voice Quote Box */
    .quote-card {
      top: 680px;
      left: 50%;
      transform: translateX(-50%);
      width: 86%;
      max-width: 800px;
      background: rgba(20, 23, 31, 0.85);
      backdrop-filter: blur(12px);
      border-left: 4px solid #D8A448;
      border-radius: 0 16px 16px 0;
      padding: 28px 32px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }

    .quote-text {
      font-family: 'Playfair Display', serif;
      font-size: 26px;
      font-style: italic;
      color: #EFE7D8;
      line-height: 1.4;
    }

    /* Traits / Power Cards */
    .traits-grid {
      top: 860px;
      left: 50%;
      transform: translateX(-50%);
      width: 86%;
      max-width: 800px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .trait-row {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .trait-label {
      font-size: 16px;
      font-weight: 600;
      color: #A0AAB8;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .trait-val {
      font-size: 18px;
      font-weight: 700;
      color: #D8A448;
    }

    /* Footer CTA */
    .footer-cta {
      bottom: 60px;
      left: 0;
      width: 100%;
      text-align: center;
      font-family: 'Cinzel', serif;
      font-size: 20px;
      color: #D8A448;
      letter-spacing: 4px;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div id="stage" data-composition-id="character-spotlight"
       data-start="0" data-duration="${duration}" data-width="${dims.width}" data-height="${dims.height}">
    ${audioTrack}
    <div class="bg-glow"></div>

    <div id="header-badge" class="clip char-badge" data-start="0.5" data-duration="${duration - 0.5}" data-track-index="1">
      Character Dossier
    </div>

    <div id="avatar" class="clip char-avatar-container" data-start="1" data-duration="${duration - 1}" data-track-index="2">
      <div class="char-avatar-icon">⚔️</div>
      <div style="font-size: 14px; color: #D8A448; font-weight: 700; letter-spacing: 2px;">DESTINED HERO</div>
    </div>

    <h1 id="char-title" class="clip char-name" data-start="2" data-duration="${duration - 2}" data-track-index="3">
      ${characterName}
    </h1>

    <div id="char-subtitle" class="clip char-role" data-start="2.5" data-duration="${duration - 2.5}" data-track-index="4">
      Protagonist of "${safeTitle}"
    </div>

    <div id="quote-box" class="clip quote-card" data-start="3.5" data-duration="${duration - 3.5}" data-track-index="5">
      <p class="quote-text">${characterVoice}</p>
    </div>

    <div id="traits-box" class="clip traits-grid" data-start="5" data-duration="${duration - 5}" data-track-index="6">
      <div class="trait-row">
        <span class="trait-label">Affiliation</span>
        <span class="trait-val">Celestial Sect</span>
      </div>
      <div class="trait-row">
        <span class="trait-label">Primary Path</span>
        <span class="trait-val">Forbidden Dao</span>
      </div>
      <div class="trait-row">
        <span class="trait-label">Status</span>
        <span class="trait-val">Unbound & Rising</span>
      </div>
    </div>

    <div id="cta" class="clip footer-cta" data-start="7" data-duration="${duration - 7}" data-track-index="7">
      Read The Full Chronicle Now
    </div>
  </div>

  <script>
    const tl = gsap.timeline({ paused: true });

    tl.from("#header-badge", { opacity: 0, y: -20, duration: 0.8, ease: "power3.out" }, 0.5)
      .from("#avatar", { opacity: 0, scale: 0.8, rotation: -5, duration: 1, ease: "back.out(1.7)" }, 1)
      .from("#char-title", { opacity: 0, y: 30, duration: 0.8, ease: "power2.out" }, 2)
      .from("#char-subtitle", { opacity: 0, y: 20, duration: 0.6, ease: "power2.out" }, 2.5)
      .from("#quote-box", { opacity: 0, x: -50, duration: 1, ease: "power3.out" }, 3.5)
      .from(".trait-row", { opacity: 0, y: 20, stagger: 0.2, duration: 0.8, ease: "power2.out" }, 5)
      .from("#cta", { opacity: 0, scale: 0.95, duration: 0.8, repeat: -1, yoyo: true, ease: "sine.inOut" }, 7);

    window.__timelines = window.__timelines || {};
    window.__timelines['character-spotlight'] = tl;
  </script>
</body>
</html>`
  }

  if (templateType === 'chapter_teaser') {
    // Chapter Teaser Template
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} - Chapter ${chapterNumber} Teaser</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Inter:wght@400;600;800&family=Lora:ital,wght@1,500&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0b0e; color: #fff; overflow: hidden; font-family: 'Inter', sans-serif; }
    
    #stage {
      position: relative;
      width: ${dims.width}px;
      height: ${dims.height}px;
      background: radial-gradient(circle at 50% 50%, #171b26 0%, #08090d 90%);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .fog-overlay {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at center, rgba(216, 164, 72, 0.08) 0%, rgba(0,0,0,0.8) 80%);
      pointer-events: none;
    }

    .clip {
      position: absolute;
      will-change: transform, opacity;
    }

    .ch-stamp {
      top: 140px;
      font-family: 'Cinzel', serif;
      font-size: 32px;
      color: #D8A448;
      letter-spacing: 6px;
      text-transform: uppercase;
      font-weight: 700;
      border-bottom: 2px solid rgba(216, 164, 72, 0.4);
      padding-bottom: 8px;
    }

    .ch-novel-title {
      top: 220px;
      font-family: 'Cinzel', serif;
      font-size: 64px;
      font-weight: 900;
      color: #FFFFFF;
      text-shadow: 0 4px 20px rgba(0,0,0,0.8), 0 0 30px rgba(216, 164, 72, 0.3);
      text-align: center;
      width: 90%;
    }

    .beat-card {
      top: 400px;
      width: 80%;
      max-width: 1200px;
      background: rgba(20, 23, 31, 0.7);
      border: 1px solid rgba(216, 164, 72, 0.3);
      border-radius: 20px;
      padding: 48px;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.7);
      backdrop-filter: blur(10px);
    }

    .beat-text {
      font-family: 'Lora', serif;
      font-style: italic;
      font-size: 34px;
      line-height: 1.5;
      color: #EFE7D8;
    }

    .cta-banner {
      bottom: 120px;
      background: linear-gradient(90deg, #D8A448, #E5C37A);
      color: #14171F;
      padding: 16px 40px;
      border-radius: 12px;
      font-weight: 800;
      font-size: 22px;
      letter-spacing: 3px;
      text-transform: uppercase;
      box-shadow: 0 10px 30px rgba(216, 164, 72, 0.4);
    }
  </style>
</head>
<body>
  <div id="stage" data-composition-id="chapter-teaser"
       data-start="0" data-duration="${duration}" data-width="${dims.width}" data-height="${dims.height}">
    ${audioTrack}
    <div class="fog-overlay"></div>

    <div id="stamp" class="clip ch-stamp" data-start="0.5" data-duration="${duration - 0.5}" data-track-index="1">
      CHAPTER ${chapterNumber} PREVIEW
    </div>

    <h1 id="title" class="clip ch-novel-title" data-start="1.5" data-duration="${duration - 1.5}" data-track-index="2">
      ${safeTitle}
    </h1>

    <div id="beat" class="clip beat-card" data-start="3" data-duration="${duration - 3}" data-track-index="3">
      <p class="beat-text">"${chapterBeat}"</p>
    </div>

    <div id="action-btn" class="clip cta-banner" data-start="5" data-duration="${duration - 5}" data-track-index="4">
      Unlock Chapter ${chapterNumber}
    </div>
  </div>

  <script>
    const tl = gsap.timeline({ paused: true });

    tl.from("#stamp", { opacity: 0, y: -30, duration: 1, ease: "power3.out" }, 0.5)
      .from("#title", { opacity: 0, scale: 0.9, duration: 1.2, ease: "power2.out" }, 1.5)
      .from("#beat", { opacity: 0, y: 50, duration: 1.2, ease: "power3.out" }, 3)
      .from("#action-btn", { opacity: 0, y: 30, scale: 0.9, duration: 0.8, ease: "back.out(1.7)" }, 5);

    window.__timelines = window.__timelines || {};
    window.__timelines['chapter-teaser'] = tl;
  </script>
</body>
</html>`
  }

  if (templateType === 'lore_explainer') {
    // Lore / World Bible Explainer
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} - World Lore</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #080a10; color: #fff; overflow: hidden; font-family: 'Inter', sans-serif; }
    
    #stage {
      position: relative;
      width: ${dims.width}px;
      height: ${dims.height}px;
      background: radial-gradient(circle at 50% 20%, #151d2a 0%, #080a10 80%);
      overflow: hidden;
    }

    .clip { position: absolute; will-change: transform, opacity; }

    .header-section {
      top: 80px;
      left: 0;
      width: 100%;
      text-align: center;
    }

    .header-sub {
      font-size: 18px;
      color: #D8A448;
      letter-spacing: 5px;
      text-transform: uppercase;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .header-title {
      font-family: 'Cinzel', serif;
      font-size: 56px;
      font-weight: 900;
      color: #FFF;
      letter-spacing: 2px;
      text-shadow: 0 4px 20px rgba(0,0,0,0.8);
    }

    .cards-row {
      top: 320px;
      left: 50%;
      transform: translateX(-50%);
      width: 90%;
      max-width: 1500px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 32px;
    }

    .lore-card {
      background: rgba(20, 27, 38, 0.7);
      border: 1px solid rgba(216, 164, 72, 0.25);
      border-radius: 16px;
      padding: 36px 28px;
      box-shadow: 0 15px 40px rgba(0,0,0,0.5);
      backdrop-filter: blur(8px);
      text-align: center;
    }

    .lore-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .lore-heading {
      font-family: 'Cinzel', serif;
      font-size: 24px;
      color: #D8A448;
      margin-bottom: 12px;
      font-weight: 700;
    }

    .lore-desc {
      font-size: 16px;
      color: #C0C8D4;
      line-height: 1.5;
    }

    .footer-bar {
      bottom: 80px;
      left: 0;
      width: 100%;
      text-align: center;
      font-size: 20px;
      color: #D8A448;
      letter-spacing: 3px;
      font-weight: 600;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div id="stage" data-composition-id="lore-explainer"
       data-start="0" data-duration="${duration}" data-width="${dims.width}" data-height="${dims.height}">
    ${audioTrack}
    <div id="header" class="clip header-section" data-start="0.5" data-duration="${duration - 0.5}" data-track-index="1">
      <div class="header-sub">WORLD ARCHIVE & LAWS</div>
      <h1 class="header-title">${safeTitle}</h1>
    </div>

    <div id="cards" class="clip cards-row" data-start="2" data-duration="${duration - 2}" data-track-index="2">
      <div class="lore-card card-1">
        <div class="lore-icon">⚡</div>
        <div class="lore-heading">Magic System</div>
        <div class="lore-desc">Mana flows along spiritual ley lines. Mastery requires harmonic resonance with celestial forces.</div>
      </div>
      <div class="lore-card card-2">
        <div class="lore-icon">🏛️</div>
        <div class="lore-heading">The Great Sects</div>
        <div class="lore-desc">Three sovereign dynasties battle for domain over the ancient jade mountain range.</div>
      </div>
      <div class="lore-card card-3">
        <div class="lore-icon">📜</div>
        <div class="lore-heading">The Unbreakable Law</div>
        <div class="lore-desc">Any soul who unlocks the ninth seal awakens the primeval calamity of the heavens.</div>
      </div>
    </div>

    <div id="footer" class="clip footer-bar" data-start="4.5" data-duration="${duration - 4.5}" data-track-index="3">
      Enter The World on WebNovel Forge
    </div>
  </div>

  <script>
    const tl = gsap.timeline({ paused: true });

    tl.from("#header", { opacity: 0, y: -40, duration: 1, ease: "power3.out" }, 0.5)
      .from(".card-1", { opacity: 0, y: 60, duration: 0.8, ease: "power2.out" }, 2)
      .from(".card-2", { opacity: 0, y: 60, duration: 0.8, ease: "power2.out" }, 2.4)
      .from(".card-3", { opacity: 0, y: 60, duration: 0.8, ease: "power2.out" }, 2.8)
      .from("#footer", { opacity: 0, scale: 0.9, duration: 0.8, ease: "sine.out" }, 4.5);

    window.__timelines = window.__timelines || {};
    window.__timelines['lore-explainer'] = tl;
  </script>
</body>
</html>`
  }

  if (templateType === 'motion_sting') {
    // Fast 6s Motion Sting
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} - Motion Sting</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@900&family=Inter:wght@800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #000; color: #fff; overflow: hidden; font-family: 'Inter', sans-serif; }
    
    #stage {
      position: relative;
      width: ${dims.width}px;
      height: ${dims.height}px;
      background: radial-gradient(circle at center, #1b1626 0%, #000 70%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .clip { position: absolute; will-change: transform, opacity; }

    .glow-ring {
      width: 450px;
      height: 450px;
      border-radius: 50%;
      border: 3px solid rgba(216, 164, 72, 0.6);
      box-shadow: 0 0 80px rgba(216, 164, 72, 0.4), inset 0 0 80px rgba(216, 164, 72, 0.4);
    }

    .sting-title {
      font-family: 'Cinzel', serif;
      font-size: 84px;
      font-weight: 900;
      color: #FFFFFF;
      letter-spacing: 8px;
      text-transform: uppercase;
      text-shadow: 0 0 40px rgba(216, 164, 72, 0.8);
      text-align: center;
    }

    .sting-sub {
      font-size: 24px;
      color: #D8A448;
      letter-spacing: 12px;
      text-transform: uppercase;
      margin-top: 24px;
      font-weight: 800;
    }
  </style>
</head>
<body>
  <div id="stage" data-composition-id="motion-sting"
       data-start="0" data-duration="${duration}" data-width="${dims.width}" data-height="${dims.height}">
    ${audioTrack}
    <div id="ring" class="clip glow-ring" data-start="0.2" data-duration="${duration - 0.2}" data-track-index="1"></div>
    
    <div class="clip" style="text-align: center;" data-start="0.6" data-duration="${duration - 0.6}" data-track-index="2">
      <h1 id="title" class="sting-title">${safeTitle}</h1>
      <div id="sub" class="sting-sub">NOW STREAMING</div>
    </div>
  </div>

  <script>
    const tl = gsap.timeline({ paused: true });

    tl.from("#ring", { scale: 0, opacity: 0, rotation: 180, duration: 1.2, ease: "expo.out" }, 0.2)
      .from("#title", { scale: 2, opacity: 0, filter: "blur(20px)", duration: 0.8, ease: "power4.out" }, 0.6)
      .from("#sub", { y: 30, opacity: 0, duration: 0.6, ease: "power2.out" }, 1.2)
      .to("#stage", { opacity: 0, duration: 0.8, ease: "power2.in" }, ${duration} - 0.8);

    window.__timelines = window.__timelines || {};
    window.__timelines['motion-sting'] = tl;
  </script>
</body>
</html>`
  }

  if (templateType === 'custom') {
    // FIX BUG-19: Dedicated blank/custom canvas template instead of falling through to book trailer
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} - Custom Composition</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0c10; color: #fff; overflow: hidden; font-family: 'Inter', sans-serif; }
    #stage {
      position: relative;
      width: ${dims.width}px;
      height: ${dims.height}px;
      background: radial-gradient(ellipse at center, #181d28 0%, #090a0f 85%);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .clip { position: absolute; will-change: transform, opacity; }
    .custom-title {
      font-family: 'Cinzel', serif;
      font-size: 64px;
      font-weight: 900;
      color: #FFFFFF;
      letter-spacing: 4px;
      text-shadow: 0 4px 20px rgba(0,0,0,0.8);
      text-align: center;
    }
  </style>
</head>
<body>
  <div id="stage" data-composition-id="custom"
       data-start="0" data-duration="${duration}" data-width="${dims.width}" data-height="${dims.height}">
    ${audioTrack}
    <div id="main-content" class="clip custom-title" data-start="0.5" data-duration="${duration - 0.5}" data-track-index="1">
      ${safeTitle}
    </div>
  </div>

  <script>
    const tl = gsap.timeline({ paused: true });
    tl.from("#main-content", { opacity: 0, y: 30, duration: 1.2, ease: "power2.out" }, 0.5);
    window.__timelines = window.__timelines || {};
    window.__timelines['custom'] = tl;
  </script>
</body>
</html>`
  }

  // Default: Cinematic Book Trailer (16:9 or 9:16)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} - Cinematic Book Trailer</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Inter:wght@400;600;800&family=Playfair+Display:ital,wght@1,600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0c10; color: #fff; overflow: hidden; font-family: 'Inter', sans-serif; }
    
    #stage {
      position: relative;
      width: ${dims.width}px;
      height: ${dims.height}px;
      background: radial-gradient(ellipse at center, #181d28 0%, #090a0f 85%);
      overflow: hidden;
    }

    .clip { position: absolute; will-change: transform, opacity; }

    /* Dust particles background effect */
    .particle-bg {
      position: absolute;
      inset: 0;
      background-image: radial-gradient(rgba(216, 164, 72, 0.15) 1px, transparent 1px);
      background-size: 60px 60px;
      opacity: 0.6;
      pointer-events: none;
    }

    /* Scene 1: Hook */
    .scene-hook {
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      width: 85%;
    }

    .tagline-label {
      font-size: 20px;
      letter-spacing: 8px;
      color: #D8A448;
      text-transform: uppercase;
      font-weight: 700;
      margin-bottom: 24px;
    }

    .hook-text {
      font-family: 'Playfair Display', serif;
      font-size: 44px;
      line-height: 1.4;
      font-style: italic;
      color: #EFE7D8;
    }

    /* Scene 2: Title Reveal */
    .scene-title {
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      width: 90%;
    }

    .main-title {
      font-family: 'Cinzel', serif;
      font-size: 88px;
      font-weight: 900;
      color: #FFFFFF;
      letter-spacing: 6px;
      text-shadow: 0 10px 40px rgba(0,0,0,0.9), 0 0 50px rgba(216, 164, 72, 0.4);
      margin-bottom: 20px;
    }

    .title-sub {
      font-size: 24px;
      color: #D8A448;
      letter-spacing: 8px;
      text-transform: uppercase;
      font-weight: 700;
    }

    /* Scene 3: CTA */
    .scene-cta {
      bottom: 120px;
      left: 50%;
      transform: translateX(-50%);
      text-align: center;
    }

    .cta-button {
      background: linear-gradient(135deg, #D8A448, #F0D08A);
      color: #14171F;
      padding: 20px 54px;
      border-radius: 12px;
      font-family: 'Cinzel', serif;
      font-size: 26px;
      font-weight: 900;
      letter-spacing: 4px;
      text-transform: uppercase;
      box-shadow: 0 15px 40px rgba(216, 164, 72, 0.4);
    }
  </style>
</head>
<body>
  <div id="stage" data-composition-id="book-trailer"
       data-start="0" data-duration="${duration}" data-width="${dims.width}" data-height="${dims.height}">
    ${audioTrack}
    <div class="particle-bg"></div>

    <!-- Act 1: Atmospheric Hook (0s - 7s) -->
    <div id="act1" class="clip scene-hook" data-start="0.5" data-duration="6.5" data-track-index="1">
      <div class="tagline-label">AN EPIC SAGA BEGINS</div>
      <p class="hook-text">"${premise}"</p>
    </div>

    <!-- Act 2: Main Title Slam (7s - 14s) -->
    <div id="act2" class="clip scene-title" data-start="7.5" data-duration="6.5" data-track-index="2">
      <h1 class="main-title">${safeTitle}</h1>
      <div class="title-sub">A New Original Web Novel</div>
    </div>

    <!-- Act 3: Climax CTA (14s - End) -->
    <div id="act3" class="clip scene-title" data-start="14.5" data-duration="${duration - 14.5}" data-track-index="3">
      <h1 class="main-title" style="font-size: 64px;">Begin Your Journey</h1>
      <div class="cta-button" style="display: inline-block; margin-top: 32px;">Read On WebNovel Forge</div>
    </div>
  </div>

  <script>
    const tl = gsap.timeline({ paused: true });

    // Act 1
    tl.from("#act1", { opacity: 0, scale: 0.95, duration: 1.2, ease: "power2.out" }, 0.5)
      .to("#act1", { opacity: 0, scale: 1.05, duration: 1, ease: "power2.in" }, 6.0);

    // Act 2
    tl.from("#act2", { opacity: 0, scale: 1.3, filter: "blur(15px)", duration: 1.2, ease: "power3.out" }, 7.5)
      .to("#act2", { opacity: 0, duration: 0.8, ease: "power2.in" }, 13.5);

    // Act 3
    tl.from("#act3", { opacity: 0, y: 40, duration: 1.2, ease: "back.out(1.4)" }, 14.5);

    window.__timelines = window.__timelines || {};
    window.__timelines['book-trailer'] = tl;
  </script>
</body>
</html>`
}

/**
 * List all video projects in a story directory
 */
export async function hyperframesListVideos(projectPath: string): Promise<HyperframesVideo[]> {
  const videosDir = ensureVideosDir(projectPath)
  const entries = fs.readdirSync(videosDir, { withFileTypes: true })
  const results: HyperframesVideo[] = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const folderPath = path.join(videosDir, entry.name)
      const metaPath = path.join(folderPath, 'meta.json')
      const indexPath = path.join(folderPath, 'index.html')
      const mp4Path = path.join(folderPath, 'output.mp4')

      if (fs.existsSync(metaPath) && fs.existsSync(indexPath)) {
        try {
          const metaRaw = fs.readFileSync(metaPath, 'utf8')
          const metadata: VideoMetadata = JSON.parse(metaRaw)
          metadata.hasRenderedVideo = fs.existsSync(mp4Path)
          if (metadata.hasRenderedVideo) {
            metadata.renderedMp4Path = mp4Path
          }
          const htmlContent = fs.readFileSync(indexPath, 'utf8')
          results.push({
            metadata,
            htmlContent,
            fullPath: folderPath,
          })
        } catch (err) {
          console.error(`Failed to read video project ${entry.name}:`, err)
        }
      }
    }
  }

  return results
}

/**
 * Create a new video project with template
 */
export async function hyperframesCreateVideo(
  projectPath: string,
  slug: string,
  templateType: VideoTemplateType,
  title: string,
  aspectRatio: VideoAspectRatio = '16:9',
  duration: number = 20,
  storyContext?: any
): Promise<HyperframesVideo> {
  const videosDir = ensureVideosDir(projectPath)
  const safeSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-') || `video-${Date.now()}`
  const folderPath = path.join(videosDir, safeSlug)

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true })
  }

  const dims = getDimensionsForAspectRatio(aspectRatio)
  const metadata: VideoMetadata = {
    slug: safeSlug,
    title: title || 'New Story Video',
    templateType,
    aspectRatio,
    width: dims.width,
    height: dims.height,
    duration,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    hasRenderedVideo: false,
    targetChapter: storyContext?.chapterNumber,
    targetCharacterId: storyContext?.characterId,
  }

  const htmlContent = getTemplateComposition(templateType, title, aspectRatio, duration, storyContext)

  fs.writeFileSync(path.join(folderPath, 'meta.json'), JSON.stringify(metadata, null, 2), 'utf8')
  fs.writeFileSync(path.join(folderPath, 'index.html'), htmlContent, 'utf8')

  return {
    metadata,
    htmlContent,
    fullPath: folderPath,
  }
}

/**
 * Get a single video composition
 */
export async function hyperframesGetComposition(projectPath: string, slug: string): Promise<HyperframesVideo | null> {
  const folderPath = path.join(projectPath, 'videos', slug)
  const metaPath = path.join(folderPath, 'meta.json')
  const indexPath = path.join(folderPath, 'index.html')
  const mp4Path = path.join(folderPath, 'output.mp4')

  if (!fs.existsSync(metaPath) || !fs.existsSync(indexPath)) {
    return null
  }

  const metadata: VideoMetadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  metadata.hasRenderedVideo = fs.existsSync(mp4Path)
  if (metadata.hasRenderedVideo) {
    metadata.renderedMp4Path = mp4Path
  }
  const htmlContent = fs.readFileSync(indexPath, 'utf8')

  return {
    metadata,
    htmlContent,
    fullPath: folderPath,
  }
}

/**
 * Save composition HTML and update metadata
 */
export async function hyperframesSaveComposition(
  projectPath: string,
  slug: string,
  htmlContent: string,
  metadataUpdates?: Partial<VideoMetadata>
): Promise<HyperframesVideo> {
  const folderPath = path.join(projectPath, 'videos', slug)
  const metaPath = path.join(folderPath, 'meta.json')
  const indexPath = path.join(folderPath, 'index.html')
  const mp4Path = path.join(folderPath, 'output.mp4')

  let metadata: VideoMetadata = {
    slug,
    title: 'Story Video',
    templateType: 'custom',
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    duration: 20,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    hasRenderedVideo: fs.existsSync(mp4Path),
  }

  if (fs.existsSync(metaPath)) {
    try {
      metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    } catch (parseErr) {
      // FIX BUG-11: If meta.json is corrupt (e.g., from a partial write during a crash),
      // log a warning and continue with safe defaults rather than throwing and losing the save.
      console.warn(`[hyperframes] meta.json corrupt for slug "${slug}", resetting to defaults:`, parseErr)
    }
  }

  if (metadataUpdates) {
    metadata = { ...metadata, ...metadataUpdates }
  }
  metadata.updatedAt = new Date().toISOString()
  metadata.hasRenderedVideo = fs.existsSync(mp4Path)
  if (metadata.hasRenderedVideo) {
    metadata.renderedMp4Path = mp4Path
  }

  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8')
  fs.writeFileSync(indexPath, htmlContent, 'utf8')

  return {
    metadata,
    htmlContent,
    fullPath: folderPath,
  }
}

/**
 * Render video to MP4 using Hyperframes CLI
 */
export async function hyperframesRender(
  projectPath: string,
  slug: string,
  onLog?: (line: string) => void
): Promise<RenderResult> {
  const folderPath = path.join(projectPath, 'videos', slug)
  const indexPath = path.join(folderPath, 'index.html')
  const outputPath = path.join(folderPath, 'output.mp4')

  if (!fs.existsSync(indexPath)) {
    return {
      success: false,
      error: `Composition file index.html not found at ${folderPath}`,
      logs: 'File not found.',
    }
  }

  return new Promise((resolve) => {
    let logs = ''
    const appendLog = (data: string) => {
      logs += data
      if (onLog) onLog(data)
    }

    appendLog(`[Hyperframes] Starting render in ${folderPath}\n`)
    appendLog(`[Hyperframes] Command: npx hyperframes render -o output.mp4\n`)

    const isWindows = process.platform === 'win32'
    const command = isWindows ? 'npx.cmd' : 'npx'

    // FIX BUG-18: Add a 10-minute render timeout so the app cannot hang indefinitely
    const RENDER_TIMEOUT_MS = 10 * 60 * 1000
    let timedOut = false

    const proc = spawn(command, ['hyperframes', 'render', '-o', 'output.mp4'], {
      cwd: folderPath,
      shell: true,
      env: { ...process.env, CI: '1' },
    })

    // FIX BUG-18: Kill the process if it exceeds the timeout to prevent indefinite hang
    const timeoutHandle = setTimeout(() => {
      timedOut = true
      proc.kill()
      appendLog('[Hyperframes] Render timed out after 10 minutes — process killed.\n')
    }, RENDER_TIMEOUT_MS)

    proc.stdout?.on('data', (d) => appendLog(d.toString()))
    proc.stderr?.on('data', (d) => appendLog(d.toString()))

    proc.on('error', (err) => {
      clearTimeout(timeoutHandle)
      appendLog(`[Hyperframes Error] ${err.message}\n`)
      resolve({
        success: false,
        error: err.message,
        logs,
      })
    })

    proc.on('close', (code) => {
      clearTimeout(timeoutHandle)
      if (timedOut) {
        resolve({ success: false, error: 'Render timed out after 10 minutes.', logs })
        return
      }
      appendLog(`[Hyperframes] Process exited with code ${code}\n`)
      const exists = fs.existsSync(outputPath)
      // FIX BUG-6: Use AND (not OR) so a stale output.mp4 from a prior run
      // never falsely reports the current render as successful.
      if (code === 0 && exists) {
        resolve({
          success: true,
          outputPath,
          logs,
        })
      } else if (exists && code !== 0) {
        resolve({
          success: false,
          error: `Render exited with code ${code} — output.mp4 exists from a previous render but was NOT updated. Check FFmpeg & Node configuration.`,
          logs,
        })
      } else {
        resolve({
          success: false,
          error: `Render exited with code ${code}. Check FFmpeg & Node configuration.`,
          logs,
        })
      }
    })
  })
}

/**
 * Delete a video project
 */
export async function hyperframesDeleteVideo(projectPath: string, slug: string): Promise<boolean> {
  const folderPath = path.join(projectPath, 'videos', slug)
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true })
    return true
  }
  return false
}

/**
 * Generate AI Hyperframes HTML composition using OpenRouter / Ollama
 */
export async function hyperframesGenerateAiComposition(
  apiKey: string,
  params: AiVideoGenParams,
  ollamaConfig?: { enabled: boolean; host: string; model: string }
): Promise<string> {
  const dims = getDimensionsForAspectRatio(params.aspectRatio)

  const systemPrompt = `You are an elite motion designer and video engineer specializing in HeyGen Hyperframes.
Your task is to generate a standalone, single-file HTML5 video composition that compiles seamlessly with HeyGen Hyperframes and renders to MP4.

HYPERFRAMES RULES & SPECIFICATION:
1. Root Stage Element:
   Must contain: <div id="stage" data-composition-id="composition" data-start="0" data-duration="${params.duration}" data-width="${dims.width}" data-height="${dims.height}">
2. Timed Elements:
   Every visual element that appears, transitions, or animates must have: class="clip" data-start="[seconds]" data-duration="[seconds]" data-track-index="[integer layer]".
3. GSAP Timelines:
   Must create a paused GSAP timeline:
   <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
   <script>
     const tl = gsap.timeline({ paused: true });
     // Add animations using tl.from(), tl.to() with exact second offsets matching data-start.
     window.__timelines = window.__timelines || {};
     window.__timelines['composition'] = tl;
   </script>
4. Visual Quality & Typography:
   - Load Google Fonts (Cinzel, Inter, Playfair Display, Montserrat).
   - Use high-contrast cinematic dark themes, glowing borders, radial gradients, particle backdrops, and animated badges.
   - Design for resolution: ${dims.width}x${dims.height} (${params.aspectRatio}).
5. Output ONLY valid, raw HTML without Markdown code fences, starting with <!DOCTYPE html> and ending with </html>.`

  const userPrompt = `Create a stunning Hyperframes video composition for this story:
Title: "${params.title}"
Template Style: ${params.templateType}
Duration: ${params.duration} seconds
Aspect Ratio: ${params.aspectRatio} (${dims.width}x${dims.height})
Visual Preset: ${params.stylePreset}

STORY CONTEXT:
- Premise: ${params.storyContext?.premise || 'Epic original fiction'}
- World Setting: ${params.storyContext?.worldSetting || 'N/A'}
- Featured Chapter: ${params.storyContext?.chapterNumber ? `Chapter ${params.storyContext.chapterNumber}: ${params.storyContext.chapterBeat}` : 'N/A'}
- Featured Character: ${params.storyContext?.characterName ? `${params.storyContext.characterName} (Voice: ${params.storyContext.characterVoice})` : 'N/A'}
- Extra Instructions: ${params.storyContext?.customInstructions || 'Make it cinematic, high impact, and visually captivating.'}

Generate the full, complete Hyperframes HTML file now.`

  let generatedText = ''

  if (ollamaConfig?.enabled && ollamaConfig.model) {
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
    generatedText = data.response || ''
  } else {
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
        temperature: 0.7,
      }),
    })
    // FIX BUG-7: Check HTTP status and API-level error before reading content.
    // Previously, a 401 (wrong key) or quota error returned an empty string silently,
    // causing an empty index.html to be written and breaking the video project.
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`OpenRouter HTTP ${res.status}: ${errText}`)
    }
    const data: any = await res.json()
    if (data.error) {
      throw new Error(`OpenRouter API error: ${data.error?.message || JSON.stringify(data.error)}`)
    }
    generatedText = data.choices?.[0]?.message?.content || ''
    if (!generatedText) {
      throw new Error('AI returned an empty composition. Check your OpenRouter API key and model availability.')
    }
  }

  // Clean Markdown wrappers if AI included them
  let cleaned = generatedText.trim()
  if (cleaned.startsWith('```html')) {
    cleaned = cleaned.replace(/^```html\s*/i, '').replace(/```\s*$/, '')
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '')
  }

  return cleaned
}

/**
 * Hyperframes Lint — validates composition HTML per Screen 7 spec
 * Checks: #stage data-composition-id/width/height, .clip data-start/duration/track-index, GSAP timeline, __timelines
 */
export async function hyperframesLint(htmlContent: string): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  const errors: string[] = []
  const warnings: string[] = []
  if (!htmlContent.includes('id="stage"')) errors.push('Missing #stage element')
  if (!htmlContent.includes('data-composition-id')) errors.push('Missing data-composition-id on #stage')
  if (!htmlContent.includes('data-width') || !htmlContent.includes('data-height')) errors.push('Missing data-width/data-height on #stage')
  if (!htmlContent.includes('data-start')) errors.push('Missing data-start attributes on clips')
  if (!htmlContent.includes('data-duration')) warnings.push('Missing data-duration on clips')
  if (!htmlContent.includes('data-track-index')) warnings.push('Missing data-track-index on clips — layering may be incorrect')
  if (!htmlContent.toLowerCase().includes('gsap')) warnings.push('GSAP not detected — animations may not run')
  if (!htmlContent.includes('__timelines')) warnings.push('Missing window.__timelines registration — timeline will not be controllable')
  if (!htmlContent.includes('<!DOCTYPE html>')) warnings.push('Missing DOCTYPE')
  // FIX BUG-17: Verify that timed elements actually carry the required .clip class.
  // A regex check ensures data-start attributes appear on elements that also have class="clip".
  const clipWithDataStart = /class="[^"]*clip[^"]*"[^>]*data-start|data-start[^>]*class="[^"]*clip[^"]*"/
  if (htmlContent.includes('data-start') && !clipWithDataStart.test(htmlContent)) {
    warnings.push('Elements with data-start detected but none appear to have class="clip" — Hyperframes may not recognise them as timed clips')
  }
  return { valid: errors.length === 0, errors, warnings }
}