import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import type { StoryProject, CharacterSheet, OutlineBeat } from '../types'

export interface GraphNode {
  id: string
  label: string
  type: 'chapter' | 'character' | 'lore' | 'structure' | 'theme'
  color: string
  radius: number
  x: number
  y: number
  vx: number
  vy: number
  pinned?: boolean
  data?: any
}

export interface GraphEdge {
  source: string
  target: string
  weight?: number
  label?: string
  color?: string
}

interface StoryGraphViewProps {
  storyData: any
  currentStory: StoryProject | string
  onClose: () => void
  onSelectChapter?: (chapterNum: number) => void
  onSelectCharacter?: (character: any) => void
  theme?: 'light' | 'dark'
}

const TYPE_COLORS: Record<string, string> = {
  chapter: '#C9A84C', // Lamp Gold
  character: '#10B981', // Jade Ink / Emerald
  lore: '#06B6D4', // Cyan
  structure: '#A855F7', // Violet
  theme: '#F59E0B', // Amber
}

const TYPE_LABELS: Record<string, string> = {
  chapter: 'Chapters',
  character: 'Characters',
  lore: 'World Lore',
  structure: 'Plot Beats',
  theme: 'Themes',
}

export function StoryGraphView({
  storyData,
  currentStory,
  onClose,
  onSelectChapter,
  onSelectCharacter,
  theme = 'dark',
}: StoryGraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Camera transform: pan and zoom
  const [zoom, setZoom] = useState(1.0)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  // Filters & Controls
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTypes, setActiveTypes] = useState<Record<string, boolean>>({
    chapter: true,
    character: true,
    lore: true,
    structure: true,
    theme: true,
  })
  const [repulsionForce, setRepulsionForce] = useState(180)
  const [linkDistance, setLinkDistance] = useState(90)
  const [showControls, setShowControls] = useState(true)

  // Interactive state
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)

  // Mouse interaction refs for dragging
  const isDraggingCanvas = useRef(false)
  const draggedNodeRef = useRef<GraphNode | null>(null)
  const lastMousePos = useRef({ x: 0, y: 0 })
  const nodesRef = useRef<GraphNode[]>([])
  const edgesRef = useRef<GraphEdge[]>([])
  const animFrameId = useRef<number>(0)

  // 1. Build Graph Nodes & Edges from Story Data
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []
    const addedNodeIds = new Set<string>()

    // Helper to safely add node
    const addNode = (node: GraphNode) => {
      if (!addedNodeIds.has(node.id)) {
        addedNodeIds.add(node.id)
        nodes.push(node)
      }
    }

    // A. Chapters
    const chapters: OutlineBeat[] = storyData?.outline || storyData?.chapters || []
    if (chapters.length > 0) {
      chapters.forEach((ch, idx) => {
        const chNum = ch.chapter || (idx + 1)
        const id = `chapter-${chNum}`
        const wordCount = (ch as any).word_count || 0
        const title = (ch as any).title || (ch as any).beat_summary?.slice(0, 20)
        addNode({
          id,
          label: `Ch. ${chNum}${title ? `: ${title}` : ''}`,
          type: 'chapter',
          color: TYPE_COLORS.chapter,
          radius: 12 + Math.min(8, wordCount / 400),
          x: (Math.random() - 0.5) * 500,
          y: (Math.random() - 0.5) * 500,
          vx: 0,
          vy: 0,
          data: { ...ch, chapterNumber: chNum },
        })

        // Sequential chapter edges (Ch 1 -> Ch 2 -> Ch 3)
        if (idx > 0) {
          const prevChNum = chapters[idx - 1].chapter || idx
          edges.push({
            source: `chapter-${prevChNum}`,
            target: id,
            weight: 1.5,
            color: 'rgba(201, 168, 76, 0.4)',
          })
        }
      })
    } else {
      // Fallback demo chapters if empty
      for (let i = 1; i <= 3; i++) {
        const id = `chapter-${i}`
        addNode({
          id,
          label: `Chapter ${i}`,
          type: 'chapter',
          color: TYPE_COLORS.chapter,
          radius: 12,
          x: (i - 2) * 120,
          y: 0,
          vx: 0,
          vy: 0,
          data: { chapterNumber: i },
        })
        if (i > 1) {
          edges.push({ source: `chapter-${i - 1}`, target: id, color: 'rgba(201, 168, 76, 0.4)' })
        }
      }
    }

    // B. Characters
    const characters: CharacterSheet[] = storyData?.characters || []
    characters.forEach((char) => {
      const id = `char-${char.id || char.name}`
      const isProtagonist = char.role?.toLowerCase().includes('protagonist')
      const isAntagonist = char.role?.toLowerCase().includes('antagonist')
      addNode({
        id,
        label: char.name,
        type: 'character',
        color: TYPE_COLORS.character,
        radius: isProtagonist ? 16 : isAntagonist ? 14 : 11,
        x: (Math.random() - 0.5) * 600,
        y: (Math.random() - 0.5) * 600,
        vx: 0,
        vy: 0,
        data: char,
      })

      // Link Character to Chapters where they are present
      chapters.forEach((ch) => {
        const chNum = ch.chapter
        const present = (ch as any).charactersPresent || (ch as any).characters_present || []
        if (present.includes(char.id) || present.includes(char.name)) {
          edges.push({
            source: id,
            target: `chapter-${chNum}`,
            weight: 1,
            color: 'rgba(16, 185, 129, 0.45)',
          })
        }
      })
    })

    // C. World Bible Lore
    const worldBibleText: string = storyData?.worldBible || ''
    if (worldBibleText) {
      // Extract markdown headers or key lore terms
      const headerMatches = worldBibleText.match(/^(?:##|###)\s+([^\n]+)/gm)
      if (headerMatches) {
        headerMatches.slice(0, 10).forEach((h, idx) => {
          const title = h.replace(/^(?:##|###)\s+/, '').trim()
          if (!title) return
          const id = `lore-${idx}`
          addNode({
            id,
            label: title,
            type: 'lore',
            color: TYPE_COLORS.lore,
            radius: 10,
            x: (Math.random() - 0.5) * 600,
            y: (Math.random() - 0.5) * 600,
            vx: 0,
            vy: 0,
            data: { title, type: 'World Lore' },
          })

          // Connect lore to related characters or chapters if referenced
          characters.forEach((c) => {
            const voice = c.voice_fingerprint || ''
            const facts = (c.locked_facts || []).join(' ')
            if (voice.includes(title) || facts.includes(title)) {
              edges.push({ source: id, target: `char-${c.id || c.name}`, color: 'rgba(6, 182, 212, 0.35)' })
            }
          })
        })
      }
    }

    // D. Story Structure Beats
    const structureText: string = storyData?.structure || ''
    if (structureText) {
      const beatKeywords = ['Inciting Incident', 'Plot Point 1', 'Midpoint', 'All Hope Is Lost', 'Climax', 'Resolution']
      beatKeywords.forEach((beat, idx) => {
        if (structureText.includes(beat)) {
          const id = `beat-${idx}`
          addNode({
            id,
            label: beat,
            type: 'structure',
            color: TYPE_COLORS.structure,
            radius: 11,
            x: (Math.random() - 0.5) * 500,
            y: (Math.random() - 0.5) * 500,
            vx: 0,
            vy: 0,
            data: { name: beat, type: 'Plot Beat' },
          })
          // Connect to corresponding chapter proportion
          const targetChIdx = Math.floor((idx / beatKeywords.length) * chapters.length)
          if (chapters[targetChIdx]) {
            edges.push({
              source: id,
              target: `chapter-${chapters[targetChIdx].chapter || targetChIdx + 1}`,
              color: 'rgba(168, 85, 247, 0.4)',
            })
          }
        }
      })
    }

    // E. Story Themes
    const ideaNotes: string = storyData?.ideaNotes || ''
    const themes = ['Fate vs Will', 'Ascension', 'Sacrifice', 'Power & Corruption', 'Legacy', 'Revenge']
    themes.forEach((th, idx) => {
      if (ideaNotes.toLowerCase().includes(th.toLowerCase()) || structureText.toLowerCase().includes(th.toLowerCase())) {
        const id = `theme-${idx}`
        addNode({
          id,
          label: th,
          type: 'theme',
          color: TYPE_COLORS.theme,
          radius: 9,
          x: (Math.random() - 0.5) * 600,
          y: (Math.random() - 0.5) * 600,
          vx: 0,
          vy: 0,
          data: { theme: th },
        })
      }
    })

    return { initialNodes: nodes, initialEdges: edges }
  }, [storyData])

  // Sync to mutable refs for 60fps simulation
  useEffect(() => {
    nodesRef.current = initialNodes.map((n) => ({ ...n }))
    edgesRef.current = initialEdges
  }, [initialNodes, initialEdges])

  // 2. Physics Simulation & Render Loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let isRunning = true

    // Resize canvas to match display size
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect()
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width
        canvas.height = rect.height
      }
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    const simulateAndRender = () => {
      if (!isRunning) return

      const width = canvas.width
      const height = canvas.height
      const nodes = nodesRef.current
      const edges = edgesRef.current

      // Filter visible nodes based on activeTypes and search
      const query = searchQuery.trim().toLowerCase()
      const visibleNodes = nodes.filter((n) => {
        if (!activeTypes[n.type]) return false
        if (query && !n.label.toLowerCase().includes(query)) return false
        return true
      })
      const visibleNodeIds = new Set(visibleNodes.map((n) => n.id))

      // Physics forces
      const damping = 0.88
      const centerPull = 0.003
      const nodeCount = visibleNodes.length

      // A. Repulsion between all node pairs (Coulomb force)
      for (let i = 0; i < nodeCount; i++) {
        const a = visibleNodes[i]
        for (let j = i + 1; j < nodeCount; j++) {
          const b = visibleNodes[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const distSq = dx * dx + dy * dy || 1
          const dist = Math.sqrt(distSq)
          const minDist = a.radius + b.radius + 15

          // Repulsive force proportional to repulsionForce / dist
          const force = (repulsionForce * repulsionForce) / (dist * (dist < minDist ? 2 : 10))
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force

          if (a !== draggedNodeRef.current) {
            a.vx -= fx
            a.vy -= fy
          }
          if (b !== draggedNodeRef.current) {
            b.vx += fx
            b.vy += fy
          }
        }
      }

      // B. Edge springs (Hooke's law attraction)
      edges.forEach((edge) => {
        if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) return
        const a = visibleNodes.find((n) => n.id === edge.source)
        const b = visibleNodes.find((n) => n.id === edge.target)
        if (!a || !b) return

        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const displacement = dist - linkDistance
        const force = displacement * 0.035 * (edge.weight || 1)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force

        if (a !== draggedNodeRef.current) {
          a.vx += fx
          a.vy += fy
        }
        if (b !== draggedNodeRef.current) {
          b.vx -= fx
          b.vy -= fy
        }
      })

      // C. Center Gravity & Velocity Update
      visibleNodes.forEach((node) => {
        if (node === draggedNodeRef.current) {
          node.vx = 0
          node.vy = 0
          return
        }
        // Pull gently to origin (0,0)
        node.vx -= node.x * centerPull
        node.vy -= node.y * centerPull

        // Apply velocity with damping
        node.vx *= damping
        node.vy *= damping

        // Speed limit
        const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy)
        if (speed > 15) {
          node.vx = (node.vx / speed) * 15
          node.vy = (node.vy / speed) * 15
        }

        node.x += node.vx
        node.y += node.vy
      })

      // -------------------------------------------------------------
      // RENDERING (Obsidian Style Canvas)
      // -------------------------------------------------------------
      ctx.clearRect(0, 0, width, height)
      ctx.save()

      // Canvas background
      ctx.fillStyle = theme === 'light' ? '#F7F6F3' : '#0B0D13'
      ctx.fillRect(0, 0, width, height)

      // Transform coordinate space: center of canvas + pan + zoom
      ctx.translate(width / 2 + pan.x, height / 2 + pan.y)
      ctx.scale(zoom, zoom)

      // Find highlighted connections if a node is hovered or selected
      const activeInspectNode = hoveredNode || selectedNode
      const connectedNodeIds = new Set<string>()
      if (activeInspectNode) {
        connectedNodeIds.add(activeInspectNode.id)
        edges.forEach((e) => {
          if (e.source === activeInspectNode.id) connectedNodeIds.add(e.target)
          if (e.target === activeInspectNode.id) connectedNodeIds.add(e.source)
        })
      }

      // Draw subtle background coordinate grid
      ctx.strokeStyle = theme === 'light' ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.03)'
      ctx.lineWidth = 1 / zoom
      const gridSize = 100
      const minX = -width / zoom - pan.x
      const maxX = width / zoom - pan.x
      const minY = -height / zoom - pan.y
      const maxY = height / zoom - pan.y

      ctx.beginPath()
      for (let x = Math.floor(minX / gridSize) * gridSize; x <= maxX; x += gridSize) {
        ctx.moveTo(x, minY)
        ctx.lineTo(x, maxY)
      }
      for (let y = Math.floor(minY / gridSize) * gridSize; y <= maxY; y += gridSize) {
        ctx.moveTo(minX, y)
        ctx.lineTo(maxX, y)
      }
      ctx.stroke()

      // Draw Edges / Links
      edges.forEach((edge) => {
        if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) return
        const a = visibleNodes.find((n) => n.id === edge.source)
        const b = visibleNodes.find((n) => n.id === edge.target)
        if (!a || !b) return

        const isHighlighted =
          activeInspectNode && (edge.source === activeInspectNode.id || edge.target === activeInspectNode.id)
        const isDimmed = activeInspectNode && !isHighlighted

        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)

        if (isHighlighted) {
          ctx.strokeStyle = '#FACC15' // Bright glowing gold on highlight
          ctx.lineWidth = 2.5 / zoom
          ctx.shadowColor = 'rgba(250, 204, 21, 0.6)'
          ctx.shadowBlur = 8
        } else if (isDimmed) {
          ctx.strokeStyle = theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'
          ctx.lineWidth = 0.8 / zoom
          ctx.shadowBlur = 0
        } else {
          ctx.strokeStyle = edge.color || (theme === 'light' ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.12)')
          ctx.lineWidth = 1.2 / zoom
          ctx.shadowBlur = 0
        }
        ctx.stroke()
        ctx.shadowBlur = 0
      })

      // Draw Nodes
      visibleNodes.forEach((node) => {
        const isHovered = hoveredNode?.id === node.id
        const isSelected = selectedNode?.id === node.id
        const isConnected = connectedNodeIds.has(node.id)
        const isDimmed = activeInspectNode && !isConnected

        const alpha = isDimmed ? 0.2 : 1.0

        ctx.save()
        ctx.globalAlpha = alpha

        // Node Glow for Hover or Selection
        if (isHovered || isSelected) {
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.radius + 6 / zoom, 0, Math.PI * 2)
          ctx.fillStyle = node.color
          ctx.globalAlpha = 0.25
          ctx.fill()
          ctx.globalAlpha = alpha
        }

        // Main Node Circle
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fillStyle = node.color
        ctx.shadowColor = node.color
        ctx.shadowBlur = isHovered || isSelected ? 12 : 4
        ctx.fill()
        ctx.shadowBlur = 0

        // White border accent
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.strokeStyle = isHovered || isSelected ? '#FFFFFF' : 'rgba(255, 255, 255, 0.4)'
        ctx.lineWidth = (isHovered || isSelected ? 2 : 1) / zoom
        ctx.stroke()

        // Node Text Label
        ctx.font = `${Math.max(10, Math.round(11 / Math.sqrt(zoom)))}px Inter, system-ui, sans-serif`
        ctx.fillStyle = theme === 'light' ? (isDimmed ? 'rgba(0,0,0,0.2)' : '#1F2937') : isDimmed ? 'rgba(255,255,255,0.2)' : '#E5E7EB'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'

        // Truncate long label for canvas rendering
        const displayLabel = node.label.length > 20 ? node.label.slice(0, 18) + '…' : node.label
        ctx.fillText(displayLabel, node.x, node.y + node.radius + 4)

        ctx.restore()
      })

      ctx.restore()
      animFrameId.current = requestAnimationFrame(simulateAndRender)
    }

    animFrameId.current = requestAnimationFrame(simulateAndRender)

    return () => {
      isRunning = false
      cancelAnimationFrame(animFrameId.current)
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [theme, zoom, pan, activeTypes, searchQuery, repulsionForce, linkDistance, hoveredNode, selectedNode])

  // -------------------------------------------------------------
  // MOUSE & TOUCH EVENT HANDLERS
  // -------------------------------------------------------------
  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      const cx = (screenX - rect.left - canvas.width / 2 - pan.x) / zoom
      const cy = (screenY - rect.top - canvas.height / 2 - pan.y) / zoom
      return { x: cx, y: cy }
    },
    [pan, zoom]
  )

  const findNodeAtPos = useCallback(
    (worldX: number, worldY: number): GraphNode | null => {
      const nodes = nodesRef.current
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i]
        if (!activeTypes[n.type]) continue
        const dx = n.x - worldX
        const dy = n.y - worldY
        const hitDistance = (n.radius + 6) * (n.radius + 6)
        if (dx * dx + dy * dy <= hitDistance) {
          return n
        }
      }
      return null
    },
    [activeTypes]
  )

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    lastMousePos.current = { x: e.clientX, y: e.clientY }
    const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY)
    const hit = findNodeAtPos(wx, wy)

    if (hit) {
      draggedNodeRef.current = hit
      setSelectedNode(hit)
    } else {
      isDraggingCanvas.current = true
      setSelectedNode(null)
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const dx = e.clientX - lastMousePos.current.x
    const dy = e.clientY - lastMousePos.current.y
    lastMousePos.current = { x: e.clientX, y: e.clientY }

    if (draggedNodeRef.current) {
      draggedNodeRef.current.x += dx / zoom
      draggedNodeRef.current.y += dy / zoom
      draggedNodeRef.current.vx = 0
      draggedNodeRef.current.vy = 0
    } else if (isDraggingCanvas.current) {
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
    } else {
      // Hover detection
      const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY)
      const hit = findNodeAtPos(wx, wy)
      setHoveredNode(hit)
    }
  }

  const handleMouseUp = () => {
    draggedNodeRef.current = null
    isDraggingCanvas.current = false
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89
    setZoom((prev) => Math.min(3.5, Math.max(0.2, prev * zoomFactor)))
  }

  const handleResetView = () => {
    setZoom(1.0)
    setPan({ x: 0, y: 0 })
  }

  // Handle Action on Selected Node
  const handleOpenNode = (node: GraphNode) => {
    if (node.type === 'chapter') {
      const chNum = node.data?.chapter || node.data?.chapterNumber || 1
      if (onSelectChapter) {
        onSelectChapter(chNum)
        onClose()
      }
    } else if (node.type === 'character') {
      if (onSelectCharacter && node.data) {
        onSelectCharacter(node.data)
        onClose()
      }
    }
  }

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const storyTitle = typeof currentStory === 'object' ? currentStory.title : 'Web Novel'

  return (
    <div className="fixed inset-0 z-50 bg-ink-night/95 backdrop-blur-xl flex flex-col animate-fade-in select-none">
      {/* Top Header Bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-muted-slate/15 bg-aged-paper-dark/80 backdrop-blur-md shrink-0 pr-36">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-lamp-gold/15 border border-lamp-gold/30 flex items-center justify-center text-lamp-gold text-lg">
            🕸️
          </div>
          <div>
            <h1 className="font-display text-base text-text-primary flex items-center gap-2">
              <span>{storyTitle}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-lamp-gold/15 text-lamp-gold border border-lamp-gold/30 font-mono">
                Graph View
              </span>
            </h1>
            <p className="text-xs text-muted-slate">
              Obsidian Interactive Knowledge Graph · {initialNodes.length} Nodes · {initialEdges.length} Links
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowControls(!showControls)}
            className={`btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 rounded-lg border ${
              showControls ? 'bg-lamp-gold/15 text-lamp-gold border-lamp-gold/30' : 'border-muted-slate/20 text-muted-slate'
            }`}
          >
            <span>⚙️</span>
            <span>Filters & Physics</span>
          </button>
          <button
            onClick={handleResetView}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
            title="Reset Zoom & Pan"
          >
            🎯 Recenter
          </button>
          <button
            onClick={onClose}
            className="btn-ghost text-xs px-3 py-1.5 hover:text-wax-seal-red hover:bg-wax-seal-red/10 border border-muted-slate/20 rounded-lg"
            title="Close Graph View (Esc)"
          >
            ✕ Close
          </button>
        </div>
      </header>

      {/* Main Graph Area */}
      <div ref={containerRef} className="relative flex-1 w-full h-full overflow-hidden cursor-grab active:cursor-grabbing">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full block"
        />

        {/* Floating Zoom Controls (Bottom Left) */}
        <div className="absolute bottom-6 left-6 flex items-center gap-1.5 p-1.5 bg-ink-night/80 border border-muted-slate/20 rounded-lg backdrop-blur-md shadow-xl text-xs">
          <button
            onClick={() => setZoom((z) => Math.min(3.5, z * 1.2))}
            className="p-1.5 hover:bg-aged-paper/20 rounded text-text-primary font-bold"
            title="Zoom In"
          >
            ＋
          </button>
          <span className="px-2 font-mono text-muted-slate">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.max(0.2, z * 0.83))}
            className="p-1.5 hover:bg-aged-paper/20 rounded text-text-primary font-bold"
            title="Zoom Out"
          >
            －
          </button>
          <button
            onClick={handleResetView}
            className="px-2 py-1 hover:bg-aged-paper/20 rounded text-lamp-gold text-[11px]"
            title="Fit to Screen"
          >
            Fit
          </button>
        </div>

        {/* Floating Inspector Card for Selected or Hovered Node */}
        {(selectedNode || hoveredNode) && (
          <div className="absolute top-6 left-6 max-w-sm w-80 p-4 rounded-xl bg-ink-night/90 border border-muted-slate/25 backdrop-blur-md shadow-2xl space-y-2.5 animate-spring-pop z-10 pointer-events-auto">
            <div className="flex items-center justify-between border-b border-muted-slate/15 pb-2">
              <span
                className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded"
                style={{
                  backgroundColor: `${(selectedNode || hoveredNode)!.color}20`,
                  color: (selectedNode || hoveredNode)!.color,
                  border: `1px solid ${(selectedNode || hoveredNode)!.color}40`,
                }}
              >
                {(selectedNode || hoveredNode)!.type}
              </span>
              <span className="text-[11px] text-muted-slate font-mono">
                {(selectedNode || hoveredNode)!.id}
              </span>
            </div>

            <h3 className="font-display text-base text-text-primary leading-tight">
              {(selectedNode || hoveredNode)!.label}
            </h3>

            {/* Dynamic Node Content */}
            {(selectedNode || hoveredNode)!.type === 'chapter' && (
              <div className="text-xs text-muted-slate space-y-1">
                <p>
                  <strong className="text-text-primary">Beat:</strong>{' '}
                  {(selectedNode || hoveredNode)!.data?.beat_summary || 'Outline beat draft'}
                </p>
                {(selectedNode || hoveredNode)!.data?.pov_character && (
                  <p>
                    <strong className="text-text-primary">POV:</strong>{' '}
                    {(selectedNode || hoveredNode)!.data.pov_character}
                  </p>
                )}
                <button
                  onClick={() => handleOpenNode((selectedNode || hoveredNode)!)}
                  className="btn-primary w-full text-xs py-1.5 mt-2 flex items-center justify-center gap-1 font-semibold"
                >
                  📖 Jump to Chapter
                </button>
              </div>
            )}

            {(selectedNode || hoveredNode)!.type === 'character' && (
              <div className="text-xs text-muted-slate space-y-1">
                <p>
                  <strong className="text-text-primary">Role:</strong>{' '}
                  {(selectedNode || hoveredNode)!.data?.role || 'Character'}
                </p>
                {(selectedNode || hoveredNode)!.data?.voice_fingerprint && (
                  <p className="line-clamp-2">
                    <strong className="text-text-primary">Voice:</strong>{' '}
                    {(selectedNode || hoveredNode)!.data.voice_fingerprint}
                  </p>
                )}
                <button
                  onClick={() => handleOpenNode((selectedNode || hoveredNode)!)}
                  className="btn-secondary w-full text-xs py-1.5 mt-2 flex items-center justify-center gap-1 font-semibold text-lamp-gold"
                >
                  👤 Open Character Sheet
                </button>
              </div>
            )}

            {(selectedNode || hoveredNode)!.type === 'lore' && (
              <p className="text-xs text-muted-slate">
                World Bible entity. Linked to plot beats and characters that reference this world lore.
              </p>
            )}

            {(selectedNode || hoveredNode)!.type === 'structure' && (
              <p className="text-xs text-muted-slate">
                Key structural narrative beat anchor for overarching pacing and dramatic progression.
              </p>
            )}
          </div>
        )}

        {/* Obsidian Control Drawer (Right Panel) */}
        {showControls && (
          <aside className="absolute top-6 right-6 w-72 p-4 bg-ink-night/90 border border-muted-slate/20 rounded-xl backdrop-blur-md shadow-2xl space-y-4 text-xs animate-slide-up z-20">
            <div className="flex items-center justify-between border-b border-muted-slate/15 pb-2">
              <span className="font-semibold text-text-primary flex items-center gap-1.5">
                <span>🔍</span> Graph Search & Filter
              </span>
              <button
                onClick={() => setShowControls(false)}
                className="text-muted-slate hover:text-text-primary text-sm p-0.5"
              >
                ✕
              </button>
            </div>

            {/* Search filter input */}
            <div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search nodes by name..."
                className="input-field text-xs py-1.5 px-2.5 h-8 w-full"
              />
              {searchQuery && (
                <div className="flex justify-between items-center mt-1 text-[11px] text-lamp-gold">
                  <span>Filtering by "{searchQuery}"</span>
                  <button onClick={() => setSearchQuery('')} className="underline hover:opacity-80">
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Category Node Toggles */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-muted-slate block">Node Categories</span>
              <div className="space-y-1.5">
                {Object.entries(TYPE_LABELS).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between p-1.5 rounded hover:bg-aged-paper/10 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TYPE_COLORS[key] }} />
                      <span className="text-text-primary">{label}</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={activeTypes[key]}
                      onChange={(e) => setActiveTypes((prev) => ({ ...prev, [key]: e.target.checked }))}
                      className="accent-lamp-gold w-3.5 h-3.5"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Physics Engine Knobs */}
            <div className="space-y-2 pt-2 border-t border-muted-slate/15">
              <span className="text-[11px] font-semibold text-muted-slate block">Physics Tuning</span>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-[11px] text-muted-slate mb-1">
                    <span>Node Repulsion</span>
                    <span className="font-mono">{repulsionForce}</span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="400"
                    step="10"
                    value={repulsionForce}
                    onChange={(e) => setRepulsionForce(Number(e.target.value))}
                    className="w-full accent-lamp-gold h-1.5 bg-aged-paper-dark rounded cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-muted-slate mb-1">
                    <span>Link Distance</span>
                    <span className="font-mono">{linkDistance}</span>
                  </div>
                  <input
                    type="range"
                    min="40"
                    max="220"
                    step="10"
                    value={linkDistance}
                    onChange={(e) => setLinkDistance(Number(e.target.value))}
                    className="w-full accent-lamp-gold h-1.5 bg-aged-paper-dark rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
