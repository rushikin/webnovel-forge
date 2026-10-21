import { useState, useRef } from 'react'
import type { HyperframesVideo } from '../types'

interface VideoPreviewModalProps {
  video: HyperframesVideo | null
  isOpen: boolean
  onClose: () => void
  projectPath: string
}

export function VideoPreviewModal({ video, isOpen, onClose, projectPath }: VideoPreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  if (!isOpen || !video) return null

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
    }
  }

  const togglePlay = () => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
      setIsPlaying(false)
    } else {
      videoRef.current.play()
      setIsPlaying(true)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value)
    if (videoRef.current) {
      videoRef.current.currentTime = t
      setCurrentTime(t)
    }
  }

  const handleOpenFolder = () => {
    ;(window as any).electronAPI?.hyperframesOpenFolder?.({ projectPath, slug: video.metadata.slug })
  }

  const handleCopyCommand = async () => {
    const cmd = `npx hyperframes render -o ${video.metadata.slug}/output.mp4`
    await navigator.clipboard.writeText(cmd)
    setStatusMsg('✓ Copied npx command')
    setTimeout(() => setStatusMsg(null), 2500)
  }

  const handleReRender = async () => {
    try {
      setStatusMsg('⚡ Re-rendering...')
      const result: any = await (window as any).electronAPI?.hyperframesRenderVideo?.({ projectPath, slug: video.metadata.slug })
      if (result?.success) setStatusMsg('✓ Re-render complete')
      else setStatusMsg(result?.error || 'Re-render failed')
      setTimeout(() => setStatusMsg(null), 3000)
    } catch (e: any) {
      setStatusMsg(e.message || 'Re-render failed')
    }
  }

  const handleDownload = async () => {
    try {
      const result: any = await (window as any).electronAPI?.hyperframesSaveMp4As?.({ projectPath, slug: video.metadata.slug })
      if (result?.success) {
        setStatusMsg(`✓ Saved to ${result.filePath}`)
      } else if (!result?.canceled) {
        setStatusMsg(result?.error || 'Save failed')
      }
      setTimeout(() => setStatusMsg(null), 3000)
    } catch (e: any) {
      setStatusMsg(e.message)
    }
  }

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const src = video.metadata.renderedMp4Path ? `file://${video.metadata.renderedMp4Path.replace(/\\/g, '/')}` : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      {/* Backdrop rgba(0,0,0,0.88) + blur */}
      <div className="absolute inset-0 backdrop-blur-sm" style={{ backgroundColor: 'rgba(0,0,0,0.88)' }} onClick={onClose} />

      {/* Modal 900px centered bg-card 16r shadow */}
      <div
        className="relative w-full max-w-[900px] max-h-[90vh] flex flex-col overflow-hidden animate-slide-up"
        style={{
          backgroundColor: '#1A1D26',
          borderRadius: '16px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
          border: '1px solid rgba(107,122,153,0.12)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'rgba(107,122,153,0.12)' }}>
          <h2 className="font-display text-lg" style={{ fontFamily: 'Cinzel, serif', color: '#C9A84C' }}>
            {video.metadata.slug}.mp4
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-muted-slate" style={{ color: '#6B7A99' }}>
            ×
          </button>
        </div>

        {/* Video Player 16:9 ~700×394 */}
        <div className="p-6 pb-0">
          <div className="relative w-full bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9', maxHeight: '394px', borderRadius: '8px' }}>
            {src ? (
              <video
                ref={videoRef}
                src={src}
                className="w-full h-full"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-slate text-sm" style={{ color: '#6B7A99' }}>
                No rendered MP4 found. Render the video first.
              </div>
            )}

            {/* Native-style controls bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-3 py-2 flex items-center gap-3">
              <button onClick={togglePlay} className="w-7 h-7 flex items-center justify-center bg-white rounded-full text-black text-xs">
                {isPlaying ? '⏸' : '▶'}
              </button>

              <input
                type="range"
                min={0}
                max={duration || video.metadata.duration || 30}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 accent-violet-500"
                style={{ accentColor: '#7C6FCD' }}
              />

              <span className="font-mono text-xs text-white" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {formatTime(currentTime)} / {formatTime(duration || video.metadata.duration)}
              </span>

              <div className="flex items-center gap-1">
                <span className="text-white text-xs">🔊</span>
                <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); if (videoRef.current) videoRef.current.volume = v }} className="w-16 accent-white" />
              </div>

              <button
                onClick={() => videoRef.current?.requestFullscreen?.()}
                className="text-white text-xs px-1"
                title="Fullscreen"
              >
                ⛶
              </button>
            </div>
          </div>
          {statusMsg && <div className="text-xs text-jade-ink mt-2" style={{ color: '#4CAF7D' }}>{statusMsg}</div>}
        </div>

        {/* Two-col below player */}
        <div className="p-6 grid grid-cols-2 gap-4">
          {/* Left metadata card #0D0F14 10r 16p */}
          <div className="rounded-[10px] p-4 space-y-2" style={{ backgroundColor: '#0D0F14', borderRadius: '10px', padding: '16px' }}>
            {[
              ['Source', video.metadata.title || `Chapter ${video.metadata.targetChapter || '—'}`],
              ['Type', `${video.metadata.templateType} (${video.metadata.aspectRatio})`],
              ['Duration', `${video.metadata.duration}s`],
              ['Resolution', `${video.metadata.width}×${video.metadata.height}`],
              ['Render time', video.metadata.hasRenderedVideo ? '—' : 'Not yet rendered'],
              ['Composition', `${video.metadata.slug}/index.html`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-xs">
                <span style={{ color: '#6B7A99', fontFamily: 'Inter, sans-serif' }}>{label}</span>
                <span style={{ color: '#E8EAF0', fontFamily: label === 'Composition' ? 'JetBrains Mono, monospace' : 'Inter, sans-serif' }} className="truncate ml-4 text-right">
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* Right vertical stack gap8 */}
          <div className="flex flex-col gap-2">
            <button onClick={handleOpenFolder} className="w-full h-10 rounded-lg border text-sm font-medium" style={{ borderColor: 'rgba(107,122,153,0.2)', color: '#E8EAF0', height: '40px' }}>
              📂 Open in Explorer
            </button>
            <button onClick={handleCopyCommand} className="w-full h-10 rounded-lg border text-sm font-medium" style={{ borderColor: 'rgba(107,122,153,0.2)', color: '#E8EAF0', height: '40px' }}>
              📋 Copy npx Command
            </button>
            <button onClick={handleReRender} className="w-full h-10 rounded-lg font-medium" style={{ border: '1px solid #C9A84C', color: '#C9A84C', height: '40px' }}>
              🔄 Re-render
            </button>
            <button onClick={handleDownload} className="w-full rounded-lg font-bold text-sm" style={{ backgroundColor: '#7C6FCD', color: 'white', height: '44px', borderRadius: '8px' }}>
              ⬇ Download MP4
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
