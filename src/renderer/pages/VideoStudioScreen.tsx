import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../App'
import { VideoPreviewModal } from '../components/VideoPreviewModal'
import { EngineStudioView } from '../components/EngineStudioView'
import type {
  HyperframesVideo,
  VideoTemplateType,
  VideoAspectRatio,
  VideoDoctorStatus,
  AiVideoGenParams,
  VideoEngine,
  EpisodeBreakdown,
  EpisodeScene,
  EpisodeDialogue,
} from '../types'

interface VideoStudioProps {
  projectPath: string
  initialEpisodeNumber?: number
  initialTab?: 'ai' | 'animate' | 'template' | 'list'
}

const TEMPLATE_OPTIONS: Array<{
  type: VideoTemplateType
  name: string
  aspectRatio: VideoAspectRatio
  duration: number
  description: string
  icon: string
}> = [
  {
    type: 'book_trailer',
    name: 'Cinematic Book Trailer',
    aspectRatio: '16:9',
    duration: 20,
    description: 'Atmospheric hook, dramatic title slam, premise quote, and call-to-action.',
    icon: '🎬',
  },
  {
    type: 'character_spotlight',
    name: 'Character Spotlight (Shorts / TikTok)',
    aspectRatio: '9:16',
    duration: 15,
    description: 'Vertical 9:16 reveal with avatar badge, voice quote, traits, and animated power stats.',
    icon: '👤',
  },
  {
    type: 'chapter_teaser',
    name: 'Chapter Cliffhanger Teaser',
    aspectRatio: '16:9',
    duration: 15,
    description: 'Chapter # stamp, beat summary, suspense pulse, and next-chapter unlock hook.',
    icon: '📖',
  },
  {
    type: 'lore_explainer',
    name: 'World Lore & Magic Rules',
    aspectRatio: '16:9',
    duration: 20,
    description: 'Overview cards for magic systems, great sects, and unbreakable world laws.',
    icon: '🏛️',
  },
  {
    type: 'motion_sting',
    name: '6s High-Impact Motion Sting',
    aspectRatio: '16:9',
    duration: 6,
    description: 'Rapid kinetic glitch, glowing particle ring, and title slam logo sting.',
    icon: '⚡',
  },
]

const CATALOG_BLOCKS = [
  {
    title: 'Flash Through White Transition',
    snippet: `<!-- Shader Flash Transition -->\n<div class="clip" data-start="6.8" data-duration="0.5" data-track-index="99"\n     style="position:absolute;inset:0;background:#ffffff;pointer-events:none;" id="flash-fx"></div>\n<script>\n  tl.fromTo("#flash-fx", { opacity: 1 }, { opacity: 0, duration: 0.5, ease: "power2.out" }, 6.8);\n</script>`,
  },
  {
    title: 'Glowing Lower Third Banner',
    snippet: `<!-- Lower Third Info Banner -->\n<div class="clip" data-start="2" data-duration="6" data-track-index="10"\n     style="position:absolute;bottom:80px;left:60px;background:rgba(20,23,31,0.85);border-left:4px solid #D8A448;padding:16px 28px;border-radius:0 12px 12px 0;" id="lower-third">\n  <div style="font-size:14px;color:#D8A448;font-weight:700;letter-spacing:2px;">SPELLCASTER RANK IX</div>\n  <div style="font-size:24px;font-weight:800;color:#FFF;">Archmage Valerius</div>\n</div>\n<script>\n  tl.from("#lower-third", { x: -100, opacity: 0, duration: 0.8, ease: "power3.out" }, 2);\n</script>`,
  },
  {
    title: 'Kinetic Quote Box',
    snippet: `<!-- Kinetic Quote -->\n<div class="clip" data-start="3" data-duration="5" data-track-index="5"\n     style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;width:80%;" id="kinetic-quote">\n  <p style="font-family:'Playfair Display',serif;font-style:italic;font-size:38px;color:#EFE7D8;">"The heavens may crumble, but our oath endures."</p>\n</div>\n<script>\n  tl.from("#kinetic-quote", { scale: 0.8, opacity: 0, duration: 1, ease: "back.out(1.5)" }, 3);\n</script>`,
  },
]

const VIDEO_ENGINES: Array<{ id: VideoEngine; label: string; icon: string; lang: string }> = [
  { id: 'hyperframes', label: 'Hyperframes', icon: '⚡', lang: 'HTML' },
  { id: 'remotion', label: 'Remotion', icon: '⚛️', lang: 'React' },
  { id: 'html-video', label: 'html-video', icon: '🌐', lang: 'Agent' },
  { id: 'motion-canvas', label: 'Motion Canvas', icon: '🎨', lang: 'TS' },
  { id: 'manim', label: 'Manim', icon: '🐍', lang: 'Python' },
  { id: 'prism-motion', label: 'Prism Motion', icon: '🔮', lang: 'FullStack' },
]

export function VideoStudioScreen({ projectPath, initialEpisodeNumber, initialTab }: VideoStudioProps) {
  const { storyData } = useApp()
  const [selectedEngine, setSelectedEngine] = useState<VideoEngine>('hyperframes')
  const [videos, setVideos] = useState<HyperframesVideo[]>([])
  const [activeVideo, setActiveVideo] = useState<HyperframesVideo | null>(null)
  const activeVideoRef = useRef<HyperframesVideo | null>(null)
  activeVideoRef.current = activeVideo
  const [htmlCode, setHtmlCode] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'editor' | 'render' | 'doctor' | 'blocks'>('editor')
  const [leftTab, setLeftTab] = useState<'ai' | 'animate' | 'template' | 'list'>(initialTab || 'ai')

  // Episode Animator State
  const [selectedEpisodeNum, setSelectedEpisodeNum] = useState<number>(initialEpisodeNumber || 1)
  const [animateEngine, setAnimateEngine] = useState<VideoEngine>('hyperframes')
  const [animateAspectRatio, setAnimateAspectRatio] = useState<'16:9' | '9:16'>('16:9')
  const [animateStylePreset, setAnimateStylePreset] = useState<'cinematic_gold' | 'dark_fantasy' | 'cyberpunk_neon' | 'vintage_parchment' | 'celestial_anime'>('cinematic_gold')
  const [isAnimatingEpisode, setIsAnimatingEpisode] = useState(false)
  const [animatingStep, setAnimatingStep] = useState<string>('')
  const [episodeBreakdown, setEpisodeBreakdown] = useState<EpisodeBreakdown | null>(null)
  const [lastAnimatedProjectSlug, setLastAnimatedProjectSlug] = useState<string | null>(null)
  const [animateError, setAnimateError] = useState<string | null>(null)

  useEffect(() => {
    if (initialEpisodeNumber) {
      setSelectedEpisodeNum(initialEpisodeNumber)
      setLeftTab('animate')
    }
  }, [initialEpisodeNumber])

  // Player state
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(20)
  const [isLooping, setIsLooping] = useState(true)
  const [zoomScale, setZoomScale] = useState<'fit' | '100' | '75' | '50'>('fit')
  const [bgmVolume, setBgmVolume] = useState(0.8)
  const [previewVideo, setPreviewVideo] = useState<HyperframesVideo | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  // Render & Doctor state
  const [isRendering, setIsRendering] = useState(false)
  const [renderLogs, setRenderLogs] = useState<string>('')
  const [renderError, setRenderError] = useState<string | null>(null)
  const [doctorStatus, setDoctorStatus] = useState<VideoDoctorStatus | null>(null)
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const showSetupBanner = !doctorStatus?.allReady
  const [lintResult, setLintResult] = useState<{ valid: boolean; errors: string[]; warnings: string[] } | null>(null)
  const [renderProgress, setRenderProgress] = useState(0)

  // Creation form state
  const [newTitle, setNewTitle] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<VideoTemplateType>('book_trailer')
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<VideoAspectRatio>('16:9')
  const [selectedDuration, setSelectedDuration] = useState(20)
  const [selectedStyle, setSelectedStyle] = useState<'cinematic_gold' | 'dark_fantasy' | 'cyberpunk_neon' | 'vintage_parchment' | 'celestial_anime'>('cinematic_gold')
  const [aiCustomPrompt, setAiCustomPrompt] = useState('')
  const [selectedCharIndex, setSelectedCharIndex] = useState<number>(-1)
  const [selectedChapIndex, setSelectedChapIndex] = useState<number>(-1)
  const [sourceOptions, setSourceOptions] = useState({
    characters: true,
    world: true,
    plot: true,
    voice: false,
    locked: false,
    rolling: false,
  })
  const [sourceScope, setSourceScope] = useState<'entire' | 'chapter' | 'character'>('entire')

  // Load videos on mount - FIX BUG-8: use activeVideoRef to prevent activeVideo changes from triggering re-render loops
  const loadVideos = useCallback(async () => {
    try {
      const list = await window.electronAPI.hyperframesListVideos(projectPath)
      setVideos(list)
      if (list.length > 0 && !activeVideoRef.current) {
        selectVideo(list[0])
      } else if (list.length === 0) {
        // Auto create default book trailer if none exist
        const initial = await window.electronAPI.hyperframesCreateVideo({
          projectPath,
          slug: 'main-book-trailer',
          templateType: 'book_trailer',
          title: storyData?.ideaNotes?.slice(0, 30) || 'Epic Story Trailer',
          aspectRatio: '16:9',
          duration: 20,
          storyContext: {
            premise: storyData?.ideaNotes || 'In a world of infinite mystery, one soul rises.',
          },
        })
        setVideos([initial])
        selectVideo(initial)
      }
    } catch (err) {
      console.error('Failed to load videos:', err)
    }
  }, [projectPath, storyData])

  const checkDoctor = useCallback(async () => {
    try {
      const status = await window.electronAPI.hyperframesDoctor()
      setDoctorStatus(status)
    } catch (e) {
      console.error('Failed to run hyperframes doctor:', e)
    }
  }, [])

  useEffect(() => {
    loadVideos()
    checkDoctor()
  }, [loadVideos, checkDoctor])

  // Lint composition on htmlCode change (debounced)
  useEffect(() => {
    if (!htmlCode) { setLintResult(null); return }
    const t = setTimeout(async () => {
      try {
        const res: any = await (window.electronAPI as any).hyperframesLint({ htmlContent: htmlCode })
        setLintResult(res)
      } catch { setLintResult(null) }
    }, 600)
    return () => clearTimeout(t)
  }, [htmlCode])

  const selectVideo = (v: HyperframesVideo) => {
    setActiveVideo(v)
    setHtmlCode(v.htmlContent)
    setDuration(v.metadata.duration || 20)
    setCurrentTime(0)
    setIsPlaying(false)
  }

  // Update iframe with current HTML and transport bridge
  const updateIframeContent = useCallback((code: string) => {
    if (!iframeRef.current) return
    const iframe = iframeRef.current

    // Inject timeline control bridge into the composition
    const injection = `
      <script>
        window.addEventListener('message', (event) => {
          const { action, time, playing } = event.data || {};
          const timelines = window.__timelines || {};
          const mainTl = Object.values(timelines)[0];
          
          if (action === 'seek' && mainTl) {
            mainTl.pause();
            mainTl.time(time);
          } else if (action === 'play' && mainTl) {
            mainTl.play();
          } else if (action === 'pause' && mainTl) {
            mainTl.pause();
          }
        });
      </script>
    `

    let modifiedHtml = code
    if (modifiedHtml.includes('</body>')) {
      modifiedHtml = modifiedHtml.replace('</body>', `${injection}</body>`)
    } else {
      modifiedHtml += injection
    }

    // Securely update isolated sandbox using srcdoc without requiring same-origin doc.write
    iframe.srcdoc = modifiedHtml
  }, [])

  useEffect(() => {
    if (htmlCode) {
      updateIframeContent(htmlCode)
    }
  }, [htmlCode, updateIframeContent])

  // Playback timer ticker
  useEffect(() => {
    let interval: any = null
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          const next = prev + 0.05
          if (next >= duration) {
            if (isLooping) {
              postToIframe({ action: 'seek', time: 0 })
              postToIframe({ action: 'play' })
              return 0
            } else {
              setIsPlaying(false)
              postToIframe({ action: 'pause' })
              return duration
            }
          }
          return next
        })
      }, 50)
    }
    return () => clearInterval(interval)
  }, [isPlaying, duration, isLooping])

  const postToIframe = (message: any) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(message, '*')
    }
  }

  const handlePlayToggle = () => {
    if (currentTime >= duration) {
      setCurrentTime(0)
      postToIframe({ action: 'seek', time: 0 })
    }
    if (!isPlaying) {
      postToIframe({ action: 'play' })
      setIsPlaying(true)
    } else {
      postToIframe({ action: 'pause' })
      setIsPlaying(false)
    }
  }

  const handleSeek = (newTime: number) => {
    setCurrentTime(newTime)
    postToIframe({ action: 'seek', time: newTime })
  }

  const handleRestart = () => {
    setCurrentTime(0)
    postToIframe({ action: 'seek', time: 0 })
    if (isPlaying) {
      postToIframe({ action: 'play' })
    }
  }

  const handleSaveComposition = async () => {
    if (!activeVideo) return
    try {
      const updated = await window.electronAPI.hyperframesSaveComposition({
        projectPath,
        slug: activeVideo.metadata.slug,
        htmlContent: htmlCode,
        metadataUpdates: {
          duration,
        },
      })
      setActiveVideo(updated)
      setStatusMessage('✓ Composition saved!')
      setTimeout(() => setStatusMessage(null), 3000)
    } catch (err: any) {
      alert(`Failed to save composition: ${err.message}`)
    }
  }

  const handleCreateNewVideo = async () => {
    const title = newTitle.trim() || 'New Story Promo'
    const slug = `video-${Date.now().toString(36)}`

    // Extract context based on sourceOptions + sourceScope (Screen 7 spec)
    let premise = sourceOptions.world || sourceOptions.plot ? storyData?.ideaNotes || '' : ''
    let worldSetting = sourceOptions.world ? storyData?.worldBible || '' : ''
    let charName = ''
    let charVoice = ''
    let chNum = 1
    let chBeat = ''
    let lockedFacts = ''
    let rollingSummary = ''

    if (sourceOptions.characters && selectedCharIndex >= 0 && storyData?.characters?.[selectedCharIndex]) {
      const c = storyData.characters[selectedCharIndex]
      charName = c.name
      if (sourceOptions.voice) charVoice = c.voice_fingerprint
    } else if (!sourceOptions.characters) {
      charName = ''
      charVoice = ''
    } else if (sourceOptions.voice && selectedCharIndex >= 0 && storyData?.characters?.[selectedCharIndex]) {
      // voice without characters still needs char
      const c = storyData.characters[selectedCharIndex]
      charName = c.name
      charVoice = c.voice_fingerprint
    }

    if (sourceOptions.plot && selectedChapIndex >= 0 && storyData?.outline?.[selectedChapIndex]) {
      const ch = storyData.outline[selectedChapIndex]
      chNum = ch.chapter
      chBeat = ch.beat_summary
    } else if (!sourceOptions.plot) {
      chBeat = ''
    } else if (selectedChapIndex >= 0 && storyData?.outline?.[selectedChapIndex]) {
      const ch = storyData.outline[selectedChapIndex]
      chNum = ch.chapter
      chBeat = sourceOptions.plot ? ch.beat_summary : ''
    }

    if (sourceOptions.locked && storyData?.characters?.length) {
      lockedFacts = storyData.characters.flatMap((c: any) => c.locked_facts || []).join('; ')
    }
    if (sourceOptions.rolling) {
      rollingSummary = storyData?.rollingSummary || ''
    }
    // Respect sourceScope dropdown
    if (sourceScope === 'chapter') {
      premise = ''
      worldSetting = sourceOptions.world ? worldSetting : ''
      if (!sourceOptions.plot) chBeat = ''
    } else if (sourceScope === 'character') {
      premise = ''
      worldSetting = ''
      chBeat = ''
      if (!sourceOptions.characters) charName = ''
    }

    // Merge locked/rolling into premise for context
    let finalPremise = premise
    if (lockedFacts) finalPremise += `\nLocked facts: ${lockedFacts}`
    if (rollingSummary) finalPremise += `\nRolling summary: ${rollingSummary}`

    try {
      const created = await window.electronAPI.hyperframesCreateVideo({
        projectPath,
        slug,
        templateType: selectedTemplate,
        title,
        aspectRatio: selectedAspectRatio,
        duration: selectedDuration,
        storyContext: {
          premise: finalPremise,
          worldSetting,
          characterName: charName,
          characterVoice: charVoice,
          chapterNumber: chNum,
          chapterBeat: chBeat,
        },
      })
      setVideos((prev) => [...prev, created])
      selectVideo(created)
      setNewTitle('')
      setLeftTab('list')
      setStatusMessage('✓ Created new video!')
      setTimeout(() => setStatusMessage(null), 3000)
    } catch (err: any) {
      alert(`Failed to create video: ${err.message}`)
    }
  }

  const handleGenerateAi = async () => {
    if (!activeVideo) return
    setIsGeneratingAi(true)
    setStatusMessage('🤖 AI is writing Hyperframes video composition & animations...')

    let charName = ''
    let charVoice = ''
    let chNum = 1
    let chBeat = ''
    let premise = storyData?.ideaNotes || ''
    let worldSetting = storyData?.worldBible || ''

    // Respect sourceOptions for AI generation
    if (!sourceOptions.characters) charName = ''
    if (!sourceOptions.voice) charVoice = ''
    else if (selectedCharIndex >= 0 && storyData?.characters?.[selectedCharIndex]) {
      const c = storyData.characters[selectedCharIndex]
      charName = c.name
      charVoice = c.voice_fingerprint
    } else if (sourceOptions.characters && selectedCharIndex >= 0 && storyData?.characters?.[selectedCharIndex]) {
      const c = storyData.characters[selectedCharIndex]
      charName = c.name
      if (sourceOptions.voice) charVoice = c.voice_fingerprint
    }

    if (sourceOptions.plot && selectedChapIndex >= 0 && storyData?.outline?.[selectedChapIndex]) {
      const ch = storyData.outline[selectedChapIndex]
      chNum = ch.chapter
      chBeat = ch.beat_summary
    } else if (!sourceOptions.plot) {
      chBeat = ''
    }

    if (!sourceOptions.world) worldSetting = ''
    if (!sourceOptions.characters && !sourceOptions.world && !sourceOptions.plot) premise = ''

    // Handle locked/rolling
    let lockedCtx = ''
    let rollingCtx = ''
    if (sourceOptions.locked && storyData?.characters?.length) {
      lockedCtx = storyData.characters.flatMap((c: any) => c.locked_facts || []).join('; ')
    }
    if (sourceOptions.rolling) rollingCtx = storyData?.rollingSummary || ''

    let finalPremise = premise
    if (lockedCtx) finalPremise += `\nLocked facts: ${lockedCtx}`
    if (rollingCtx) finalPremise += `\nRolling summary: ${rollingCtx}`
    if (sourceScope === 'chapter') {
      finalPremise = sourceOptions.world ? worldSetting : ''
      worldSetting = sourceOptions.world ? worldSetting : ''
    } else if (sourceScope === 'character' && !sourceOptions.characters) {
      charName = ''
      charVoice = ''
    }

    const params: AiVideoGenParams = {
      projectPath,
      title: activeVideo.metadata.title,
      templateType: selectedTemplate,
      aspectRatio: selectedAspectRatio,
      duration: selectedDuration,
      stylePreset: selectedStyle,
      storyContext: {
        premise: finalPremise,
        worldSetting,
        chapterNumber: chNum,
        chapterBeat: chBeat,
        characterName: charName,
        characterVoice: charVoice,
        customInstructions: aiCustomPrompt,
      },
    }

    try {
      const aiHtml = await window.electronAPI.hyperframesGenerateAi(params)
      if (aiHtml) {
        setHtmlCode(aiHtml)
        setDuration(selectedDuration)
        // Auto-save generated code
        const updated = await window.electronAPI.hyperframesSaveComposition({
          projectPath,
          slug: activeVideo.metadata.slug,
          htmlContent: aiHtml,
          metadataUpdates: {
            duration: selectedDuration,
            aspectRatio: selectedAspectRatio,
            templateType: selectedTemplate,
          },
        })
        setActiveVideo(updated)
        setStatusMessage('✓ AI video composition generated and loaded!')
      }
    } catch (err: any) {
      alert(`AI Video Generation failed: ${err.message}`)
    } finally {
      setIsGeneratingAi(false)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  const handleRenderMp4 = async () => {
    if (!activeVideo) return
    // Save first
    await handleSaveComposition()

    setIsRendering(true)
    setActiveTab('render')
    setRenderLogs('')
    setRenderError(null)
    setRenderProgress(0)

    // Violet progress bar — fills left-to-right, center shows Rendering... 64%
    const progressInterval = setInterval(() => {
      setRenderProgress((prev) => {
        if (prev >= 95) return prev
        // Try to parse % from logs if available
        // Fallback: increment randomly 2-10%
        return Math.min(95, prev + Math.random() * 6 + 2)
      })
    }, 450)

    try {
      const result = await window.electronAPI.hyperframesRenderVideo({
        projectPath,
        slug: activeVideo.metadata.slug,
      })

      setRenderLogs(result.logs || '')
      // Parse actual % from logs if present
      const pctMatch = (result.logs || '').match(/(\d+)%/)
      if (pctMatch) setRenderProgress(parseInt(pctMatch[1], 10))
      else setRenderProgress(result.success ? 100 : 0)
      clearInterval(progressInterval)
      if (result.success) {
        setRenderProgress(100)
        setStatusMessage('🎉 MP4 Video Rendered successfully!')
        // Reload video info to update hasRenderedVideo status
        const updated = await window.electronAPI.hyperframesGetComposition({
          projectPath,
          slug: activeVideo.metadata.slug,
        })
        if (updated) {
          setActiveVideo(updated)
        }
      } else {
        setRenderError(result.error || 'Rendering encountered an issue. See logs below.')
      }
    } catch (err: any) {
      clearInterval(progressInterval)
      setRenderProgress(0)
      setRenderError(err.message)
    } finally {
      clearInterval(progressInterval)
      setIsRendering(false)
      // Reset progress bar after 3s when done
      setTimeout(() => setRenderProgress(0), 2500)
    }
  }

  const handleDeleteVideo = async (slug: string) => {
    if (!confirm(`Are you sure you want to delete video "${slug}"?`)) return
    try {
      await window.electronAPI.hyperframesDeleteVideo({ projectPath, slug })
      const filtered = videos.filter((v) => v.metadata.slug !== slug)
      setVideos(filtered)
      if (activeVideo?.metadata.slug === slug) {
        if (filtered.length > 0) selectVideo(filtered[0])
        else setActiveVideo(null)
      }
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`)
    }
  }

  const handleOpenFolder = (slug?: string) => {
    window.electronAPI.hyperframesOpenFolder({ projectPath, slug })
  }

  const handleBgmVolumeChange = (vol: number) => {
    setBgmVolume(vol)
    if (htmlCode.includes('data-volume')) {
      const updated = htmlCode.replace(/data-volume="[^"]*"/, `data-volume="${vol.toFixed(2)}"`)
      setHtmlCode(updated)
    }
  }

  const handleSaveMp4As = async () => {
    if (!activeVideo) return
    try {
      const result: any = await (window.electronAPI as any).hyperframesSaveMp4As({ projectPath, slug: activeVideo.metadata.slug })
      if (result.success) {
        setStatusMessage(`✓ Saved MP4 to ${result.filePath}`)
        setTimeout(() => setStatusMessage(null), 4000)
      } else if (!result.canceled && result.error) {
        alert(result.error)
      }
    } catch (err: any) {
      alert(err.message || 'Save failed')
    }
  }

  const handleAnimateEpisode = async () => {
    setIsAnimatingEpisode(true)
    setAnimateError(null)
    setAnimatingStep('Reading chapter text & breaking into dramatic scenes...')
    try {
      const outlineBeat = storyData?.plotOutline?.find((b: any) => (b.chapter || b.chapter_number) === selectedEpisodeNum)
      const beatSummary = outlineBeat?.beat_summary || `Chapter ${selectedEpisodeNum}`

      setAnimatingStep('Analyzing dialogue, emotional tones & visual settings with AI...')

      const res = await window.electronAPI.videoEngineAnimateEpisode({
        projectPath,
        engine: animateEngine,
        chapterNumber: selectedEpisodeNum,
        beatSummary,
        characters: storyData?.characters || [],
        aspectRatio: animateAspectRatio,
        stylePreset: animateStylePreset,
      })

      if (!res || !res.success) {
        throw new Error(res?.error || 'Failed to auto-animate episode')
      }

      setEpisodeBreakdown(res.breakdown || null)
      setLastAnimatedProjectSlug(`episode-${selectedEpisodeNum}`)
      setStatusMessage(`✨ Episode ${selectedEpisodeNum} animated into ${res.breakdown?.scenes?.length || 0} scenes!`)

      // If generated for hyperframes, reload hyperframes video list and select it
      if (animateEngine === 'hyperframes') {
        await loadVideos()
        const list = await window.electronAPI.hyperframesListVideos(projectPath)
        const found = list.find((v: HyperframesVideo) => v.metadata.slug === `episode-${selectedEpisodeNum}`)
        if (found) {
          selectVideo(found)
        }
      } else {
        setSelectedEngine(animateEngine)
      }
    } catch (err: any) {
      console.error('Failed to animate episode:', err)
      setAnimateError(err.message || String(err))
    } finally {
      setIsAnimatingEpisode(false)
      setAnimatingStep('')
      setTimeout(() => setStatusMessage(null), 5000)
    }
  }

  const handleLoadEpisodeToEditor = async () => {
    if (!lastAnimatedProjectSlug) return
    if (animateEngine === 'hyperframes') {
      const list = await window.electronAPI.hyperframesListVideos(projectPath)
      const found = list.find((v: HyperframesVideo) => v.metadata.slug === lastAnimatedProjectSlug)
      if (found) {
        selectVideo(found)
        setActiveTab('editor')
      }
    } else {
      setSelectedEngine(animateEngine)
    }
  }

  const handlePreview = (video: HyperframesVideo) => {
    setPreviewVideo(video)
    setIsPreviewOpen(true)
  }

  const width = activeVideo?.metadata.width || 1920
  const height = activeVideo?.metadata.height || 1080
  const isPortrait = activeVideo?.metadata.aspectRatio === '9:16'

  return (
    <div className="flex flex-col h-full bg-ink-night text-text-primary select-none overflow-hidden">
      {/* Studio Header Toolbar */}
      <header className="flex items-center justify-between px-6 py-2.5 border-b border-muted-slate/15 bg-ink-night/90 backdrop-blur-md z-20 flex-wrap gap-2">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎥</span>
            <span className="font-display text-lg text-lamp-gold font-bold">Video Studio</span>
          </div>

          {/* Multi-Engine Selector Pills */}
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-muted-slate/20">
            {VIDEO_ENGINES.map((eng) => (
              <button
                key={eng.id}
                onClick={() => setSelectedEngine(eng.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-all ${
                  selectedEngine === eng.id
                    ? 'bg-lamp-gold text-ink-night font-bold shadow-sm'
                    : 'text-muted-slate hover:text-white hover:bg-white/5'
                }`}
                title={eng.label}
              >
                <span>{eng.icon}</span>
                <span>{eng.label}</span>
                <span className={`text-[9px] px-1 rounded font-mono ${
                  selectedEngine === eng.id ? 'bg-ink-night/20 text-ink-night' : 'bg-muted-slate/20 text-muted-slate'
                }`}>
                  {eng.lang}
                </span>
              </button>
            ))}
          </div>

          {/* Active video selector (Hyperframes only) */}
          {selectedEngine === 'hyperframes' && (
            <div className="flex items-center gap-2 pl-3 border-l border-muted-slate/20">
              <span className="text-xs text-muted-slate">Active:</span>
              <select
                value={activeVideo?.metadata.slug || ''}
                onChange={(e) => {
                  const found = videos.find((v) => v.metadata.slug === e.target.value)
                  if (found) selectVideo(found)
                }}
                className="bg-ink-night/60 border border-muted-slate/30 text-xs text-lamp-gold rounded px-2.5 py-1 focus:outline-none focus:border-lamp-gold max-w-[200px] truncate"
              >
                {videos.map((v) => (
                  <option key={v.metadata.slug} value={v.metadata.slug} className="bg-ink-night text-white">
                    {v.metadata.title} ({v.metadata.aspectRatio} · {v.metadata.duration}s)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Right action controls (Hyperframes only) */}
        {selectedEngine === 'hyperframes' && (
          <div className="flex items-center gap-2">
            {statusMessage && (
              <span className="text-xs text-jade-ink font-medium animate-fade-in bg-jade-ink/10 px-2.5 py-0.5 rounded border border-jade-ink/20">
                {statusMessage}
              </span>
            )}

            {/* Doctor Badge */}
            <button
              onClick={() => setActiveTab('doctor')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs border transition-colors ${
                doctorStatus?.allReady
                  ? 'bg-jade-ink/10 border-jade-ink/30 text-jade-ink hover:bg-jade-ink/20'
                  : 'bg-wax-seal-red/10 border-wax-seal-red/30 text-wax-seal-red hover:bg-wax-seal-red/20'
              }`}
            >
              <span>{doctorStatus?.allReady ? '✓ Ready' : '⚠️ Setup'}</span>
            </button>

            <button onClick={() => handleOpenFolder(activeVideo?.metadata.slug)} className="btn-ghost text-xs px-2.5 py-1 flex items-center gap-1">
              📁 Folder
            </button>

            <button onClick={handleSaveComposition} className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1">
              💾 Save
            </button>

            <button
              onClick={handleRenderMp4}
              disabled={isRendering || !activeVideo}
              className="btn-primary text-xs px-3.5 py-1 flex items-center gap-1 font-bold shadow"
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
        )}
      </header>

      {/* Main Studio Workspace: Multi-Engine or Hyperframes */}
      {selectedEngine !== 'hyperframes' ? (
        <EngineStudioView
          engine={selectedEngine}
          projectPath={projectPath}
          storyData={storyData}
        />
      ) : (
        <div className="flex-1 flex overflow-hidden">
        {/* =================================================================== */}
        {/* LEFT PANEL: Video Creator & AI Prompter */}
        {/* =================================================================== */}
        <div className="w-80 border-r border-muted-slate/15 bg-ink-night/60 flex flex-col overflow-hidden">
          {/* Sub-tabs */}
          <div className="flex border-b border-muted-slate/15 bg-ink-night/40 text-xs">
            <button
              onClick={() => setLeftTab('ai')}
              className={`flex-1 py-2.5 text-center font-medium border-b-2 transition-colors ${
                leftTab === 'ai' ? 'border-lamp-gold text-lamp-gold bg-lamp-gold/5' : 'border-transparent text-muted-slate hover:text-white'
              }`}
            >
              🤖 AI Script
            </button>
            <button
              onClick={() => setLeftTab('animate')}
              className={`flex-1 py-2.5 text-center font-medium border-b-2 transition-colors ${
                leftTab === 'animate' ? 'border-lamp-gold text-lamp-gold bg-lamp-gold/5' : 'border-transparent text-muted-slate hover:text-white'
              }`}
            >
              🎬 Animate
            </button>
            <button
              onClick={() => setLeftTab('template')}
              className={`flex-1 py-2.5 text-center font-medium border-b-2 transition-colors ${
                leftTab === 'template' ? 'border-lamp-gold text-lamp-gold bg-lamp-gold/5' : 'border-transparent text-muted-slate hover:text-white'
              }`}
            >
              ✨ + New Video
            </button>
            <button
              onClick={() => setLeftTab('list')}
              className={`flex-1 py-2.5 text-center font-medium border-b-2 transition-colors ${
                leftTab === 'list' ? 'border-lamp-gold text-lamp-gold bg-lamp-gold/5' : 'border-transparent text-muted-slate hover:text-white'
              }`}
            >
              📁 Videos ({videos.length})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 text-xs">
            {/* AI Generator Tab */}
            {leftTab === 'ai' && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-display text-sm text-lamp-gold font-semibold mb-1">AI Video Generator</h4>
                  <p className="text-muted-slate text-[11px]">
                    Transforms your story bible, chapters, and characters into timed HeyGen Hyperframes compositions.
                  </p>
                </div>

                {/* First-Time Setup Banner — Screen 7 spec violet, auto-collapses when both ✓ */}
                <div
                  className="overflow-hidden transition-all duration-300"
                  style={{
                    maxHeight: showSetupBanner ? '200px' : '0',
                    opacity: showSetupBanner ? 1 : 0,
                    marginBottom: showSetupBanner ? '16px' : '0',
                  }}
                >
                  <div
                    className="rounded-[10px] p-3.5"
                    style={{ backgroundColor: 'rgba(124,111,205,0.12)', border: '1px solid rgba(124,111,205,0.35)', borderRadius: '10px', padding: '14px' }}
                  >
                    <div className="font-display text-[13px] mb-2" style={{ fontFamily: 'Cinzel, serif', color: '#7C6FCD' }}>
                      ⚙ One-Time Setup
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span style={{ color: '#E8EAF0' }}>Node.js 22+</span>
                        <span className="font-mono text-xs flex items-center gap-1" style={{ color: doctorStatus?.nodeVersionOk ? '#4CAF7D' : '#E05252' }}>
                          {doctorStatus?.nodeVersionOk ? `✓ ${doctorStatus?.nodeVersion || 'v22+'} detected` : '✗ Not found'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span style={{ color: '#E8EAF0' }}>FFmpeg</span>
                        <span className="font-mono text-xs flex items-center gap-1" style={{ color: doctorStatus?.ffmpegInstalled ? '#4CAF7D' : '#E05252' }}>
                          {doctorStatus?.ffmpegInstalled ? `✓ ${doctorStatus?.ffmpegVersion || 'Installed'}` : '✗ Not found'}
                          {!doctorStatus?.ffmpegInstalled && (
                            <button
                              onClick={() => navigator.clipboard.writeText('winget install FFmpeg')}
                              className="ml-2 text-[10px] px-1.5 py-0.5 rounded hover:bg-white/10"
                              style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#E8EAF0' }}
                              title="Copy winget install command"
                            >
                              📋 winget install FFmpeg
                            </button>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <code className="font-mono text-xs px-2 py-1 rounded flex-1" style={{ backgroundColor: '#0D0F14', color: '#E8EAF0', fontFamily: 'JetBrains Mono, monospace' }}>
                          npx hyperframes doctor
                        </code>
                        <button
                          onClick={() => navigator.clipboard.writeText('npx hyperframes doctor')}
                          className="text-xs px-1.5 py-1 rounded hover:bg-white/10"
                          title="Copy command"
                        >
                          📋
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Video Style Preset */}
                <div>
                  <label className="block text-[11px] font-medium text-muted-slate mb-1.5 uppercase tracking-wider">Visual Theme</label>
                  <select
                    value={selectedStyle}
                    onChange={(e: any) => setSelectedStyle(e.target.value)}
                    className="input-field py-1.5 text-xs bg-ink-night border-muted-slate/30 text-white"
                  >
                    <option value="cinematic_gold">👑 Cinematic Gold & Dark Royalty</option>
                    <option value="dark_fantasy">🌑 Dark Fantasy & Blood Sigil</option>
                    <option value="cyberpunk_neon">🔮 Cyberpunk Neon & Violet Dao</option>
                    <option value="vintage_parchment">📜 Ancient Parchment & Ink Wash</option>
                    <option value="celestial_anime">✨ Celestial Anime & Starlight</option>
                  </select>
                </div>

                {/* Aspect Ratio & Duration */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-muted-slate mb-1 uppercase tracking-wider">Ratio</label>
                    <select
                      value={selectedAspectRatio}
                      onChange={(e: any) => setSelectedAspectRatio(e.target.value)}
                      className="input-field py-1.5 text-xs bg-ink-night border-muted-slate/30 text-white"
                    >
                      <option value="16:9">16:9 Landscape</option>
                      <option value="9:16">9:16 Shorts/Reel</option>
                      <option value="1:1">1:1 Square</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-muted-slate mb-1 uppercase tracking-wider">Duration</label>
                    <select
                      value={selectedDuration}
                      onChange={(e) => setSelectedDuration(Number(e.target.value))}
                      className="input-field py-1.5 text-xs bg-ink-night border-muted-slate/30 text-white"
                    >
                      <option value={6}>6s (Quick Sting)</option>
                      <option value={15}>15s (Shorts/Story)</option>
                      <option value={20}>20s (Standard Trailer)</option>
                      <option value={30}>30s (Extended Promo)</option>
                    </select>
                  </div>
                </div>

                {/* Story Source — Screen 7 spec: Entire Story dropdown + 6 checkboxes 2-col */}
                <div>
                  <label className="block text-[11px] font-medium text-muted-slate mb-1.5 uppercase tracking-wider">Source Content</label>
                  <select
                    value={sourceScope}
                    onChange={(e: any) => setSourceScope(e.target.value)}
                    className="input-field py-1.5 text-xs bg-ink-night border-muted-slate/30 text-white mb-2"
                  >
                    <option value="entire">Entire Story</option>
                    <option value="chapter">Current Chapter</option>
                    <option value="character">Selected Character</option>
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'characters' as const, label: 'Character descriptions' },
                      { key: 'world' as const, label: 'World atmosphere' },
                      { key: 'plot' as const, label: 'Key plot moments' },
                      { key: 'voice' as const, label: 'Voice fingerprint' },
                      { key: 'locked' as const, label: 'Locked facts' },
                      { key: 'rolling' as const, label: 'Rolling summary' },
                    ].map((opt) => (
                      <label key={opt.key} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={(sourceOptions as any)[opt.key]}
                          onChange={(e) => setSourceOptions((prev) => ({ ...prev, [opt.key]: e.target.checked }))}
                          className="w-3 h-3 accent-[#7C6FCD]"
                          style={{ accentColor: '#7C6FCD' }}
                        />
                        <span className={(sourceOptions as any)[opt.key] ? 'text-white' : 'text-muted-slate'}>{opt.label}</span>
                        <span className="text-[10px]">{(sourceOptions as any)[opt.key] ? '✓' : '○'}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Feature a Character */}
                {storyData?.characters && storyData.characters.length > 0 && (
                  <div>
                    <label className="block text-[11px] font-medium text-muted-slate mb-1 uppercase tracking-wider">Feature Character</label>
                    <select
                      value={selectedCharIndex}
                      onChange={(e) => setSelectedCharIndex(Number(e.target.value))}
                      className="input-field py-1.5 text-xs bg-ink-night border-muted-slate/30 text-white"
                    >
                      <option value={-1}>-- None (General Story) --</option>
                      {storyData.characters.map((c: any, idx: number) => (
                        <option key={c.id || idx} value={idx}>
                          {c.name} ({c.role})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Feature a Chapter */}
                {storyData?.outline && storyData.outline.length > 0 && (
                  <div>
                    <label className="block text-[11px] font-medium text-muted-slate mb-1 uppercase tracking-wider">Feature Chapter Beat</label>
                    <select
                      value={selectedChapIndex}
                      onChange={(e) => setSelectedChapIndex(Number(e.target.value))}
                      className="input-field py-1.5 text-xs bg-ink-night border-muted-slate/30 text-white"
                    >
                      <option value={-1}>-- None (Premise Level) --</option>
                      {storyData.outline.map((ch: any, idx: number) => (
                        <option key={ch.chapter || idx} value={idx}>
                          Ch. {ch.chapter}: {ch.beat_summary?.slice(0, 35)}...
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Director Prompt */}
                <div>
                  <label className="block text-[11px] font-medium text-muted-slate mb-1 uppercase tracking-wider">Director Prompt / Notes</label>
                  <textarea
                    value={aiCustomPrompt}
                    onChange={(e) => setAiCustomPrompt(e.target.value)}
                    placeholder="e.g. Focus on high tension, rapid text fade-ins, glowing amber sigils, and a dramatic punchy cliffhanger."
                    className="textarea-field text-xs min-h-[80px] bg-ink-night/80 border-muted-slate/30 text-white"
                  />
                </div>

                {/* Audio / BGM Volume — §6.1 */}
                <div>
                  <label className="block text-[11px] font-medium text-muted-slate mb-1 uppercase tracking-wider">BGM Volume — Audio Track (data-volume)</label>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-slate">🔈</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={bgmVolume}
                      onChange={(e) => handleBgmVolumeChange(parseFloat(e.target.value))}
                      className="flex-1 accent-lamp-gold h-1"
                    />
                    <span className="text-[10px] text-muted-slate">🔊</span>
                    <span className="font-mono text-xs text-lamp-gold w-8 text-right">{Math.round(bgmVolume * 100)}%</span>
                  </div>
                  <p className="text-[10px] text-muted-slate/60 mt-1">Injects <code className="text-lamp-gold font-mono">&lt;audio class="clip" data-start="0" data-duration="..." data-volume="0.8"&gt;</code> into compositions. Volume updates live in HTML.</p>
                  {/* Hidden audio placeholder for preview; actual composition contains the audible clip */}
                  <audio className="clip hidden" data-start="0" data-duration={selectedDuration} data-volume={bgmVolume.toFixed(2)} data-track-index="99" />
                </div>

                <button
                  onClick={handleGenerateAi}
                  disabled={isGeneratingAi}
                  className="w-full btn-primary py-2.5 flex items-center justify-center gap-2 font-bold shadow-md"
                >
                  {isGeneratingAi ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-ink-night border-t-transparent rounded-full animate-spin" />
                      <span>Writing Composition...</span>
                    </>
                  ) : (
                    <>
                      <span>✨ Generate AI Composition</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Episode Animator Tab */}
            {leftTab === 'animate' && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-display text-sm text-lamp-gold font-semibold mb-1">🎬 Auto-Animate Episode</h4>
                  <p className="text-muted-slate text-[11px] leading-relaxed">
                    Select an episode. AI automatically divides the chapter into dramatic scenes, extracts character conversations, and compiles ready-to-render video code.
                  </p>
                </div>

                {/* Episode Selector */}
                <div>
                  <label className="block text-[11px] font-medium text-muted-slate mb-1 uppercase tracking-wider">
                    Select Episode / Chapter
                  </label>
                  <select
                    value={selectedEpisodeNum}
                    onChange={(e) => setSelectedEpisodeNum(Number(e.target.value))}
                    className="input-field w-full text-xs"
                  >
                    {(storyData?.plotOutline && storyData.plotOutline.length > 0
                      ? storyData.plotOutline
                      : [1, 2, 3, 4, 5].map((n: number) => ({ chapter: n, chapter_number: n, beat_summary: `Chapter ${n}` }))
                    ).map((ch: any) => {
                      const num = ch.chapter || ch.chapter_number
                      return (
                        <option key={num} value={num} className="bg-ink-night text-text-primary">
                          Episode {num}: {ch.beat_summary ? ch.beat_summary.slice(0, 35) + '…' : `Chapter ${num}`}
                        </option>
                      )
                    })}
                  </select>
                </div>

                {/* Engine Selector */}
                <div>
                  <label className="block text-[11px] font-medium text-muted-slate mb-1 uppercase tracking-wider">
                    Video Generation Engine
                  </label>
                  <select
                    value={animateEngine}
                    onChange={(e) => setAnimateEngine(e.target.value as VideoEngine)}
                    className="input-field w-full text-xs"
                  >
                    <option value="hyperframes">⚡ HeyGen Hyperframes (HTML/CSS + GSAP)</option>
                    <option value="remotion">⚛️ Remotion (React TSX)</option>
                    <option value="html-video">🌐 html-video (nexu-io)</option>
                    <option value="motion-canvas">🎨 Motion Canvas (TypeScript 2D)</option>
                    <option value="manim">🐍 Manim (Python Engine)</option>
                    <option value="prism-motion">🔮 Prism Motion (FullStack AI)</option>
                  </select>
                </div>

                {/* Aspect Ratio */}
                <div>
                  <label className="block text-[11px] font-medium text-muted-slate mb-1 uppercase tracking-wider">
                    Aspect Ratio
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAnimateAspectRatio('16:9')}
                      className={`p-2 rounded border text-center transition-colors ${
                        animateAspectRatio === '16:9'
                          ? 'border-lamp-gold bg-lamp-gold/15 text-lamp-gold font-bold'
                          : 'border-muted-slate/20 hover:border-muted-slate/40 text-muted-slate'
                      }`}
                    >
                      <div>16:9</div>
                      <div className="text-[10px] font-normal opacity-70">YouTube / TV</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnimateAspectRatio('9:16')}
                      className={`p-2 rounded border text-center transition-colors ${
                        animateAspectRatio === '9:16'
                          ? 'border-lamp-gold bg-lamp-gold/15 text-lamp-gold font-bold'
                          : 'border-muted-slate/20 hover:border-muted-slate/40 text-muted-slate'
                      }`}
                    >
                      <div>9:16</div>
                      <div className="text-[10px] font-normal opacity-70">TikTok / Shorts</div>
                    </button>
                  </div>
                </div>

                {/* Visual Style Preset */}
                <div>
                  <label className="block text-[11px] font-medium text-muted-slate mb-1 uppercase tracking-wider">
                    Visual Style Preset
                  </label>
                  <select
                    value={animateStylePreset}
                    onChange={(e) => setAnimateStylePreset(e.target.value as any)}
                    className="input-field w-full text-xs"
                  >
                    <option value="cinematic_gold">🌟 Cinematic Gold (Grand & Mythic)</option>
                    <option value="dark_fantasy">🗡️ Dark Fantasy Murim (Blood, Ink, Steel)</option>
                    <option value="cyberpunk_neon">⚡ Cyberpunk Neon (Holograms & Glitch)</option>
                    <option value="vintage_parchment">📜 Vintage Parchment (Ancient Codex)</option>
                    <option value="celestial_anime">🌌 Celestial Anime (High Shonen Fantasy)</option>
                  </select>
                </div>

                {/* Action Trigger */}
                <button
                  onClick={handleAnimateEpisode}
                  disabled={isAnimatingEpisode}
                  className="btn-primary w-full py-2.5 text-xs font-bold shadow flex items-center justify-center gap-2"
                >
                  {isAnimatingEpisode ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-ink-night/40 border-t-ink-night rounded-full animate-spin" />
                      <span>{animatingStep || `Animating Episode ${selectedEpisodeNum}…`}</span>
                    </>
                  ) : (
                    <>
                      <span>✨ Auto-Generate Episode Video</span>
                    </>
                  )}
                </button>

                {animateError && (
                  <div className="p-2.5 rounded bg-wax-seal-red/10 border border-wax-seal-red/30 text-wax-seal-red text-[11px]">
                    ⚠️ {animateError}
                  </div>
                )}

                {/* Live Storyboard & Scene Breakdown */}
                {episodeBreakdown && (
                  <div className="mt-4 pt-4 border-t border-muted-slate/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-xs text-lamp-gold font-bold">
                        📋 Storyboard: Episode {episodeBreakdown.episodeNumber}
                      </span>
                      <span className="text-[10px] text-jade-ink bg-jade-ink/10 px-2 py-0.5 rounded border border-jade-ink/20 font-mono">
                        ⏱️ {episodeBreakdown.totalDurationSeconds}s · {episodeBreakdown.scenes?.length || 0} Scenes
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-slate italic bg-black/30 p-2 rounded border border-muted-slate/10">
                      "{episodeBreakdown.summary}"
                    </p>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleLoadEpisodeToEditor}
                        className="btn-secondary flex-1 py-1 text-[11px] flex items-center justify-center gap-1"
                      >
                        👀 Open in Studio
                      </button>
                      {animateEngine === 'hyperframes' && (
                        <button
                          onClick={handleRenderMp4}
                          disabled={isRendering}
                          className="btn-primary flex-1 py-1 text-[11px] flex items-center justify-center gap-1 font-bold"
                        >
                          ⚡ Render MP4
                        </button>
                      )}
                    </div>

                    <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                      {episodeBreakdown.scenes?.map((scene: EpisodeScene) => (
                        <div
                          key={scene.sceneIndex}
                          className="p-2.5 rounded bg-black/40 border border-muted-slate/15 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-lamp-gold">
                              Scene {scene.sceneIndex}: {scene.title}
                            </span>
                            <span className="text-[10px] text-muted-slate font-mono">
                              {scene.durationSeconds}s
                            </span>
                          </div>

                          <div className="text-[10px] text-muted-slate flex items-center gap-1">
                            <span>📍 {scene.setting}</span>
                          </div>

                          <p className="text-[10px] text-text-primary/80 line-clamp-2">
                            {scene.actionDescription}
                          </p>

                          {scene.conversations && scene.conversations.length > 0 && (
                            <div className="mt-1 space-y-1 border-t border-muted-slate/10 pt-1">
                              {scene.conversations.map((dlg: EpisodeDialogue, dIdx: number) => (
                                <div key={dIdx} className="text-[10px] pl-2 border-l border-lamp-gold/40">
                                  <span className="font-bold text-lamp-gold">{dlg.speaker}</span>
                                  {dlg.emotion && (
                                    <span className="text-[9px] text-muted-slate ml-1">
                                      ({dlg.emotion})
                                    </span>
                                  )}
                                  <span className="text-text-primary">: "{dlg.text}"</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Template Creator Tab */}
            {leftTab === 'template' && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-display text-sm text-lamp-gold font-semibold mb-1">Scaffold New Video</h4>
                  <p className="text-muted-slate text-[11px]">Pick a pre-designed Hyperframes template to start.</p>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-muted-slate mb-1 uppercase tracking-wider">Video Title</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Volume 1 Teaser"
                    className="input-field py-1.5 text-xs bg-ink-night border-muted-slate/30 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-[11px] font-medium text-muted-slate uppercase tracking-wider">Choose Template</label>
                  {TEMPLATE_OPTIONS.map((t) => (
                    <div
                      key={t.type}
                      onClick={() => {
                        setSelectedTemplate(t.type)
                        setSelectedAspectRatio(t.aspectRatio)
                        setSelectedDuration(t.duration)
                      }}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedTemplate === t.type
                          ? 'border-lamp-gold bg-lamp-gold/10 text-white'
                          : 'border-muted-slate/20 bg-ink-night/40 hover:bg-ink-night text-muted-slate'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-semibold text-xs text-lamp-gold">
                        <span>{t.icon}</span>
                        <span>{t.name}</span>
                      </div>
                      <p className="text-[10px] text-muted-slate mt-1">{t.description}</p>
                      <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-slate/80">
                        <span className="px-1.5 py-0.5 rounded bg-muted-slate/10">{t.aspectRatio}</span>
                        <span className="px-1.5 py-0.5 rounded bg-muted-slate/10">{t.duration}s</span>
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={handleCreateNewVideo} className="w-full btn-primary py-2 font-bold shadow-md">
                  + Create Video Project
                </button>
              </div>
            )}

            {/* Video List Tab */}
            {leftTab === 'list' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-display text-xs text-lamp-gold font-semibold uppercase tracking-wider">Story Videos</h4>
                  <button onClick={() => setLeftTab('template')} className="text-xs text-lamp-gold hover:underline">
                    + New
                  </button>
                </div>

                {videos.map((v) => (
                  <div
                    key={v.metadata.slug}
                    className={`p-3 rounded-lg border transition-all ${
                      activeVideo?.metadata.slug === v.metadata.slug
                        ? 'border-lamp-gold bg-lamp-gold/10 text-white'
                        : 'border-muted-slate/20 bg-ink-night/40 hover:bg-ink-night text-muted-slate'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="cursor-pointer flex-1" onClick={() => selectVideo(v)}>
                        <div className="font-semibold text-xs text-lamp-gold">{v.metadata.title}</div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-slate">
                          <span>{v.metadata.aspectRatio}</span>
                          <span>•</span>
                          <span>{v.metadata.duration}s</span>
                          {v.metadata.hasRenderedVideo && (
                            <span className="text-jade-ink font-bold">✓ MP4 Ready</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {v.metadata.hasRenderedVideo && (
                          <button
                            onClick={() => handlePreview(v)}
                            className="text-xs px-2 py-1 rounded border hover:bg-violet-500/10 text-xs"
                            style={{ borderColor: 'rgba(124,111,205,0.3)', color: '#7C6FCD' }}
                            title="Preview (Screen 8)"
                          >
                            ▶ Preview
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteVideo(v.metadata.slug)}
                          className="text-muted-slate hover:text-wax-seal-red text-xs p-1"
                          title="Delete video"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* =================================================================== */}
        {/* CENTER PANEL: Live Interactive HTML Preview Player */}
        {/* =================================================================== */}
        <div className="flex-1 flex flex-col bg-black/90 relative overflow-hidden">
          {/* Viewport bar */}
          <div className="flex items-center justify-between px-4 py-2 bg-ink-night/80 border-b border-muted-slate/15 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-slate">Viewport:</span>
              <span className="font-mono text-lamp-gold font-bold">
                {width} x {height} ({activeVideo?.metadata.aspectRatio || '16:9'})
              </span>
            </div>

            {/* Zoom selector */}
            <div className="flex items-center gap-1 bg-ink-night/60 rounded p-0.5 border border-muted-slate/20">
              {(['fit', '100', '75', '50'] as const).map((z) => (
                <button
                  key={z}
                  onClick={() => setZoomScale(z)}
                  className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono ${
                    zoomScale === z ? 'bg-lamp-gold text-ink-night font-bold' : 'text-muted-slate hover:text-white'
                  }`}
                >
                  {z === 'fit' ? 'Auto Fit' : `${z}%`}
                </button>
              ))}
            </div>
          </div>

          {/* Iframe Viewport Area */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative">
            <div
              className="relative shadow-2xl border border-muted-slate/30 bg-black overflow-hidden flex items-center justify-center"
              style={{
                width: isPortrait ? '360px' : '640px',
                height: isPortrait ? '640px' : '360px',
                transform: zoomScale === '100' ? 'scale(1)' : zoomScale === '75' ? 'scale(0.75)' : zoomScale === '50' ? 'scale(0.5)' : 'none',
                maxWidth: '100%',
                maxHeight: '100%',
              }}
            >
              <iframe
                ref={iframeRef}
                title="Hyperframes Preview"
                className="w-full h-full border-0 pointer-events-auto"
                sandbox="allow-scripts"
              />
            </div>
          </div>

          {/* Transport Bar & Scrubber */}
          <div className="p-4 bg-ink-night border-t border-muted-slate/15 space-y-3 z-10">
            {/* Timeline Scrubber */}
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-lamp-gold w-16 text-right">
                {currentTime.toFixed(1)}s
              </span>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                className="flex-1 accent-lamp-gold h-1.5 bg-muted-slate/30 rounded-lg cursor-pointer"
              />
              <span className="font-mono text-xs text-muted-slate w-16">
                {duration.toFixed(1)}s
              </span>
            </div>

            {/* Transport buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRestart}
                  className="btn-ghost p-2 rounded-full text-sm hover:text-lamp-gold"
                  title="Jump to Start"
                >
                  ⏮
                </button>
                <button
                  onClick={handlePlayToggle}
                  className="w-10 h-10 rounded-full bg-lamp-gold text-ink-night flex items-center justify-center font-bold text-lg hover:bg-lamp-gold-dim shadow-md transition-transform active:scale-95"
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <button
                  onClick={() => setIsLooping(!isLooping)}
                  className={`p-2 rounded-full text-xs font-mono transition-colors ${
                    isLooping ? 'text-lamp-gold bg-lamp-gold/10' : 'text-muted-slate hover:text-white'
                  }`}
                  title="Toggle Loop"
                >
                  🔁 Loop: {isLooping ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Status Info */}
              <div className="text-[11px] text-muted-slate font-mono">
                Stage: <span className="text-white">#{activeVideo?.metadata.templateType || 'composition'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* RIGHT PANEL: Code Editor, Render Hub & Diagnostics */}
        {/* =================================================================== */}
        <div className="w-96 border-l border-muted-slate/15 bg-ink-night/70 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-muted-slate/15 bg-ink-night/40 text-xs">
            <button
              onClick={() => setActiveTab('editor')}
              className={`flex-1 py-2.5 text-center font-medium border-b-2 transition-colors ${
                activeTab === 'editor' ? 'border-lamp-gold text-lamp-gold bg-lamp-gold/5' : 'border-transparent text-muted-slate hover:text-white'
              }`}
            >
              📝 HTML/GSAP
            </button>
            <button
              onClick={() => setActiveTab('render')}
              className={`flex-1 py-2.5 text-center font-medium border-b-2 transition-colors ${
                activeTab === 'render' ? 'border-lamp-gold text-lamp-gold bg-lamp-gold/5' : 'border-transparent text-muted-slate hover:text-white'
              }`}
            >
              ⚡ MP4 Output
            </button>
            <button
              onClick={() => setActiveTab('blocks')}
              className={`flex-1 py-2.5 text-center font-medium border-b-2 transition-colors ${
                activeTab === 'blocks' ? 'border-lamp-gold text-lamp-gold bg-lamp-gold/5' : 'border-transparent text-muted-slate hover:text-white'
              }`}
            >
              📦 Catalog
            </button>
            <button
              onClick={() => setActiveTab('doctor')}
              className={`flex-1 py-2.5 text-center font-medium border-b-2 transition-colors ${
                activeTab === 'doctor' ? 'border-lamp-gold text-lamp-gold bg-lamp-gold/5' : 'border-transparent text-muted-slate hover:text-white'
              }`}
            >
              🩺 Doctor
            </button>
          </div>

          {/* Tab 1: Code Editor */}
          {activeTab === 'editor' && (
            <div className="flex-1 flex flex-col p-4 overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-muted-slate">index.html (Hyperframes Syntax)</span>
                <button
                  onClick={() => updateIframeContent(htmlCode)}
                  className="text-xs text-lamp-gold hover:underline font-mono"
                >
                  ↻ Live Reload
                </button>
              </div>
              {/* Lint Banner — jade green / wax-seal-red per spec */}
              {lintResult && (
                <div className={`text-xs px-3 py-1.5 rounded border mb-2 flex items-center gap-2 ${lintResult.valid ? 'bg-jade-ink/10 border-jade-ink/30 text-jade-ink' : 'bg-wax-seal-red/10 border-wax-seal-red/30 text-wax-seal-red'}`}>
                  <span>{lintResult.valid ? '✓ Composition valid — no errors found' : `✗ ${lintResult.errors[0] || 'Composition has errors'}`}</span>
                  {lintResult.warnings.length > 0 && <span className="text-[10px] opacity-70">({lintResult.warnings.length} warnings)</span>}
                  {!lintResult.valid && lintResult.errors.length > 1 && <span className="text-[10px]">+{lintResult.errors.length - 1} more</span>}
                </div>
              )}
              <textarea
                value={htmlCode}
                onChange={(e) => {
                  setHtmlCode(e.target.value)
                }}
                className="flex-1 w-full bg-black/80 font-mono text-[11px] text-white p-3 rounded-lg border border-muted-slate/20 resize-none focus:outline-none focus:border-lamp-gold custom-scrollbar leading-relaxed"
                spellCheck={false}
              />
              <div className="pt-3">
                <button onClick={handleSaveComposition} className="w-full btn-secondary py-2 text-xs font-bold">
                  💾 Save Composition Changes
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Render & MP4 Video Gallery */}
          {activeTab === 'render' && (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 text-xs">
              <div>
                <h4 className="font-display text-sm text-lamp-gold font-semibold mb-1">Local MP4 Video Render</h4>
                <p className="text-muted-slate text-[11px]">
                  Renders your HTML composition via Hyperframes CLI + FFmpeg on your local machine.
                </p>
              </div>

              {/* Render Status Box */}
              <div className="p-3 bg-black/60 rounded-lg border border-muted-slate/20 space-y-2">
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span>Status:</span>
                  <span className={isRendering ? 'text-lamp-gold' : activeVideo?.metadata.hasRenderedVideo ? 'text-jade-ink' : 'text-muted-slate'}>
                    {isRendering ? 'Rendering in progress...' : activeVideo?.metadata.hasRenderedVideo ? '✓ MP4 Ready' : 'Not rendered yet'}
                  </span>
                </div>

                <button
                  onClick={handleRenderMp4}
                  disabled={isRendering}
                  className="w-full btn-primary py-2 text-xs font-bold shadow-md relative overflow-hidden"
                  style={{ backgroundColor: isRendering ? '#7C6FCD' : undefined, transition: 'all 0.15s ease' }}
                >
                  {/* Violet progress fills left-to-right per spec */}
                  {isRendering && (
                    <div
                      className="absolute inset-y-0 left-0 transition-all duration-300 animate-violet-fill"
                      style={{ width: `${renderProgress}%`, backgroundColor: 'rgba(124,111,205,0.9)', background: '#7C6FCD' }}
                    />
                  )}
                  <span className="relative">
                    {isRendering ? `Rendering... ${Math.round(renderProgress)}%` : '⚡ Render to MP4 Now'}
                  </span>
                </button>
              </div>

              {/* Rendered MP4 Preview Player if Available */}
              {activeVideo?.metadata.hasRenderedVideo && activeVideo.metadata.renderedMp4Path && (
                <div className="space-y-2">
                  <div className="font-semibold text-xs text-lamp-gold">Rendered Video Output</div>
                  <video
                    src={`file://${activeVideo.metadata.renderedMp4Path.replace(/\\/g, '/')}`}
                    controls
                    className="w-full rounded-lg border border-muted-slate/30 bg-black"
                  />
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-mono text-[10px] text-muted-slate truncate max-w-[200px]">
                      output.mp4
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => activeVideo && handlePreview(activeVideo)}
                        className="text-[11px] bg-violet-500/10 border border-violet-500/30 text-violet-300 px-2 py-1 rounded hover:bg-violet-500/20"
                        style={{ backgroundColor: 'rgba(124,111,205,0.1)', borderColor: 'rgba(124,111,205,0.3)', color: '#7C6FCD' }}
                        title="Preview in modal (Screen 8 spec)"
                      >
                        ▶ Preview
                      </button>
                      <button
                        onClick={handleSaveMp4As}
                        className="text-[11px] bg-lamp-gold/10 border border-lamp-gold/30 text-lamp-gold px-2 py-1 rounded hover:bg-lamp-gold/20"
                        title="Save MP4 to any folder via Save As dialog"
                      >
                        💾 Save MP4 As...
                      </button>
                      <button
                        onClick={() => handleOpenFolder(activeVideo.metadata.slug)}
                        className="text-[11px] text-lamp-gold hover:underline"
                      >
                        Show in Explorer →
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Render Logs Terminal */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[11px] text-muted-slate">Terminal Logs:</span>
                </div>
                <pre className="w-full h-48 bg-black p-3 rounded-lg border border-muted-slate/30 font-mono text-[10px] text-green-400 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                  {renderLogs || (renderError ? `ERROR: ${renderError}` : 'No render logs yet. Click "Render to MP4" to start.')}
                </pre>
              </div>
            </div>
          )}

          {/* Tab 3: Catalog Blocks */}
          {activeTab === 'blocks' && (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 text-xs">
              <div>
                <h4 className="font-display text-sm text-lamp-gold font-semibold mb-1">Hyperframes Catalog</h4>
                <p className="text-muted-slate text-[11px]">Ready-made animated blocks you can copy into your video.</p>
              </div>

              {CATALOG_BLOCKS.map((b, i) => (
                <div key={i} className="p-3 bg-black/50 rounded-lg border border-muted-slate/20 space-y-2">
                  <div className="font-semibold text-xs text-lamp-gold">{b.title}</div>
                  <pre className="bg-black/90 p-2 rounded text-[10px] font-mono text-muted-slate overflow-x-auto">
                    {b.snippet}
                  </pre>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(b.snippet)
                      setStatusMessage('✓ Copied snippet to clipboard!')
                      setTimeout(() => setStatusMessage(null), 2500)
                    }}
                    className="btn-ghost text-[10px] py-1 px-2 text-lamp-gold border border-lamp-gold/20"
                  >
                    📋 Copy Snippet
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Tab 4: Hyperframes Doctor Diagnostics */}
          {activeTab === 'doctor' && (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-display text-sm text-lamp-gold font-semibold mb-1">Hyperframes Doctor</h4>
                  <p className="text-muted-slate text-[11px]">System environment and dependencies check.</p>
                </div>
                <button onClick={checkDoctor} className="text-xs text-lamp-gold hover:underline">
                  ↻ Re-check
                </button>
              </div>

              {/* Status List */}
              <div className="space-y-2">
                {doctorStatus?.diagnostics.map((diag, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded border text-[11px] font-mono ${
                      diag.startsWith('✓')
                        ? 'bg-jade-ink/10 border-jade-ink/30 text-jade-ink'
                        : diag.startsWith('⚠')
                        ? 'bg-lamp-gold/10 border-lamp-gold/30 text-lamp-gold'
                        : diag.startsWith('✗')
                        ? 'bg-wax-seal-red/10 border-wax-seal-red/30 text-wax-seal-red'
                        : 'bg-muted-slate/10 border-muted-slate/20 text-muted-slate'
                    }`}
                  >
                    {diag}
                  </div>
                ))}
              </div>

              {/* Setup Helper Guide */}
              <div className="p-3 bg-black/40 rounded-lg border border-muted-slate/20 space-y-2 text-[11px] text-muted-slate">
                <div className="font-semibold text-xs text-white">Prerequisites Guide:</div>
                <div className="space-y-1">
                  <div className="font-bold text-lamp-gold">1. Install Node.js v22+</div>
                  <p>Download LTS from https://nodejs.org</p>
                </div>
                <div className="space-y-1 pt-1">
                  <div className="font-bold text-lamp-gold">2. Install FFmpeg</div>
                  <p>Windows: <code className="text-white bg-black/80 px-1 rounded font-mono">winget install FFmpeg</code></p>
                  <p>Mac: <code className="text-white bg-black/80 px-1 rounded font-mono">brew install ffmpeg</code></p>
                </div>
                <div className="space-y-1 pt-1">
                  <div className="font-bold text-lamp-gold">3. Hyperframes CLI</div>
                  <p>Runs automatically on demand via <code className="text-white bg-black/80 px-1 rounded font-mono">npx hyperframes</code></p>
                </div>
              </div>
            </div>
            )}
        </div>
      </div>
      )}

      {/* Video Preview Modal — Screen 8 */}
      <VideoPreviewModal
        video={previewVideo}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        projectPath={projectPath}
      />
    </div>
  )
}