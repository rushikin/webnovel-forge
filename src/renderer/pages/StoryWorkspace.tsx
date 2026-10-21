import { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../App'
import { ChatPanel } from '../components/ChatPanel'
import { PhaseSealRibbon } from '../components/PhaseSealRibbon'
import { EditorNotesPanel } from '../components/EditorNotesPanel'
import { BannedPhrasesBadge } from '../components/BannedPhrasesBadge'
import { VideoStudioScreen } from './VideoStudioScreen'
import { AnalyticsModal } from '../components/AnalyticsModal'
import { OutlineTable } from '../components/OutlineTable'
import { CharacterFactEditor } from '../components/CharacterFactEditor'
import { HighlightedDraft } from '../components/HighlightedDraft'
import { ForgeLogo } from '../components/ForgeLogo'
import { StoryGraphView } from '../components/StoryGraphView'
import type { Phase, CharacterSheet } from '../types'

const PHASES: Phase[] = ['brainstorm', 'structure', 'world_plot', 'characters', 'chapters', 'video_studio']

const PHASE_LABELS: Record<Phase, string> = {
  brainstorm: 'Brainstorm',
  structure: 'Structure',
  world_plot: 'World & Plot',
  characters: 'Characters',
  chapters: 'Chapters',
  video_studio: '🎥 Video Studio',
}

interface EditorResultState {
  issues: string[]
  bannedPhrasesFound: Array<{ phrase: string; count: number }>
  summary: string
}

export function StoryWorkspace() {
  const { currentStory, currentPhase, setCurrentPhase, storyData, setStoryData, setCurrentStory, config, setConfig } = useApp()
  const [rightPanelContent, setRightPanelContent] = useState<string>('')
  const [selectedChapter, setSelectedChapter] = useState<any>(null)
  const [outline, setOutline] = useState<any[]>([])
  const [showChapterList, setShowChapterList] = useState(false)

  // Anti-hallucination state
  const [chapterDraft, setChapterDraft] = useState<string>('')
  const [editorResult, setEditorResult] = useState<EditorResultState | null>(null)
  const [isRunningCheck, setIsRunningCheck] = useState(false)

  // Milestone 8 state
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const [selectedCharacterForEdit, setSelectedCharacterForEdit] = useState<CharacterSheet | null>(null)

  // 5. Resize handle + copy/search
  const [leftWidth, setLeftWidth] = useState(50)
  const [isResizing, setIsResizing] = useState(false)
  const [rightSearchOpen, setRightSearchOpen] = useState(false)
  const [rightSearchQuery, setRightSearchQuery] = useState('')
  const workspaceRef = useRef<HTMLDivElement>(null)

  // Living Document Edit/Paste state
  const [isEditingRight, setIsEditingRight] = useState(false)
  const [editableContent, setEditableContent] = useState('')
  const [isSavingRight, setIsSavingRight] = useState(false)
  const [rightSaveMsg, setRightSaveMsg] = useState<string | null>(null)
  const [targetVideoTab, setTargetVideoTab] = useState<'ai' | 'animate' | 'template' | 'list'>('ai')
  const [isHumanizing, setIsHumanizing] = useState(false)
  const [showGraphView, setShowGraphView] = useState(false)

  // Obsidian Graph View shortcut: Ctrl+G or Cmd+G
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        setShowGraphView((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleGlobalKeys)
    return () => window.removeEventListener('keydown', handleGlobalKeys)
  }, [])

  const handleAnimateChapter = (chapter: any) => {
    if (chapter) {
      handleChapterSelect(chapter)
    }
    setTargetVideoTab('animate')
    setCurrentPhase('video_studio')
  }

  useEffect(() => {
    if (currentStory) {
      loadStoryData()
    }
  }, [currentStory])

  // Close action menus on outside click
  useEffect(() => {
    if (!showActionsMenu && !showExportMenu) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-actions-menu]')) {
        setShowActionsMenu(false)
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showActionsMenu, showExportMenu])

  const loadStoryData = async () => {
    if (!currentStory) return
    const projectPath = typeof currentStory === 'string' ? currentStory : currentStory.path
    try {
      const projectIdResult = await window.electronAPI.dbGet(projectPath, 'SELECT id FROM projects LIMIT 1', [])
      const projectId = projectIdResult?.id || 1

      const [ideaNotes, structure, worldBible, characters, outlineResult, rollingSummary, bannedPhrasesRaw] = await Promise.all([
        window.electronAPI.dbGet(projectPath, 'SELECT content FROM idea_notes WHERE project_id = ?', [projectId]),
        window.electronAPI.dbGet(projectPath, 'SELECT content FROM story_structure WHERE project_id = ?', [projectId]),
        window.electronAPI.dbGet(projectPath, 'SELECT content FROM world_bible WHERE project_id = ?', [projectId]),
        window.electronAPI.dbAll(projectPath, 'SELECT sheet_json FROM characters WHERE project_id = ?', [projectId]),
        window.electronAPI.dbAll(projectPath, 'SELECT * FROM plot_outline WHERE project_id = ? ORDER BY chapter_number', [projectId]),
        window.electronAPI.dbGet(projectPath, 'SELECT content FROM rolling_summary WHERE project_id = ?', [projectId]),
        window.electronAPI.dbAll(projectPath, 'SELECT phrase FROM banned_phrases WHERE project_id = ?', [projectId]),
      ])

      const parsedCharacters = characters.map((c: any) => JSON.parse(c.sheet_json))
      const parsedOutline = outlineResult.map((o: any) => ({
        ...o,
        characters_present: JSON.parse(o.characters_present || '[]'),
        must_include: JSON.parse(o.must_include || '[]'),
      }))

      setOutline(parsedOutline)

      // Derive completed phases for PhaseSealRibbon (also try authoritative pipeline status)
      const derivedCompleted: string[] = []
      if (ideaNotes?.content) derivedCompleted.push('brainstorm')
      if (structure?.content) derivedCompleted.push('structure')
      if (worldBible?.content && parsedOutline.length > 0) derivedCompleted.push('world_plot')
      if (parsedCharacters.length > 0) derivedCompleted.push('characters')
      if (parsedOutline.some((o: any) => o.status === 'approved' || o.status === 'drafted')) derivedCompleted.push('chapters')

      let completedPhases = derivedCompleted
      try {
        const pipelineStat: any = await (window.electronAPI.pipelineStatus ? window.electronAPI.pipelineStatus(projectPath) : null)
        if (pipelineStat?.completed && Array.isArray(pipelineStat.completed) && pipelineStat.completed.length > 0) {
          // Prefer pipeline's authoritative list if richer
          if (pipelineStat.completed.length >= derivedCompleted.length) {
            completedPhases = pipelineStat.completed
          }
        }
      } catch {}

      setStoryData({
        projectId,
        ideaNotes: ideaNotes?.content || '',
        structure: structure?.content || '',
        worldBible: worldBible?.content || '',
        characters: parsedCharacters,
        outline: parsedOutline,
        rollingSummary: rollingSummary?.content || '',
        bannedPhrases: bannedPhrasesRaw.map((b: any) => b.phrase),
        completedPhases,
      })

      const nextChapter = parsedOutline.find((o: any) => o.status !== 'approved')
      if (nextChapter) {
        setSelectedChapter(nextChapter)
      }
    } catch (error) {
      console.error('Failed to load story data:', error)
    }
  }

  // Run continuity check on the current draft
  const runContinuityCheck = useCallback(async (draft: string) => {
    if (!currentStory || !draft.trim()) return
    const projectPath = typeof currentStory === 'string' ? currentStory : currentStory.path
    const chapterNumber = selectedChapter?.chapter || 1

    setIsRunningCheck(true)
    try {
      const result = await window.electronAPI.runContinuityCheck(
        projectPath,
        chapterNumber,
        draft
      )
      setEditorResult({
        issues: result.issues || [],
        bannedPhrasesFound: result.bannedPhrasesFound || [],
        summary: result.summary || '',
      })

      if (result.summary) {
        await window.electronAPI.updateRollingSummary(projectPath, chapterNumber, result.summary)
      }
    } catch (error) {
      console.error('Continuity check failed:', error)
      setEditorResult({ issues: [], bannedPhrasesFound: [], summary: '' })
    } finally {
      setIsRunningCheck(false)
    }
  }, [currentStory, selectedChapter])

  // Detect banned phrases locally (instant feedback)
  const detectBannedInDraft = useCallback(async (draft: string) => {
    if (!draft.trim()) {
      setEditorResult(prev => prev ? { ...prev, bannedPhrasesFound: [] } : null)
      return
    }
    try {
      const detected = await window.electronAPI.detectBannedPhrases(draft)
      if (detected && detected.length > 0) {
        setEditorResult(prev => ({
          issues: prev?.issues || [],
          bannedPhrasesFound: detected,
          summary: prev?.summary || '',
        }))
      }
    } catch {
      // ignore — will be caught by the full continuity check
    }
  }, [])

  const handleSave = (content: string) => {
    if (currentPhase === 'chapters' && content) {
      setChapterDraft(content)
      // Run both the local banned-phrase scan and the AI continuity check
      detectBannedInDraft(content)
      runContinuityCheck(content)
    }
  }

  // Regenerate with Editor Feedback loop — feeds editor issues back into Writer Agent per ARCHITECTURE §8
  const handleRegenerate = useCallback(async () => {
    if (!currentStory) return
    const projectPath = typeof currentStory === 'string' ? currentStory : currentStory.path
    const chapterNumber = selectedChapter?.chapter || selectedChapter?.chapter_number || 1

    // If we are in chapters phase with a selected chapter, wire editor feedback into Writer
    if (currentPhase === 'chapters' && selectedChapter) {
      setIsRunningCheck(true)
      try {
        // Build editorFeedback from flagged issues per spec: editorFeedback = editorResult.issues.join('\n')
        const editorFeedback = editorResult && editorResult.issues ? editorResult.issues.join('\n') : ''
        const bannedFeedback = editorResult && editorResult.bannedPhrasesFound ? editorResult.bannedPhrasesFound.map(b => b.phrase).join(', ') : ''

        // Call pipelineWriteChapter with feedback history so Writer corrects draft
        const feedbackHistory: any[] = []
        if (editorFeedback) {
          feedbackHistory.push({
            role: 'user',
            content: `Regenerate Chapter ${chapterNumber} addressing these editor issues:\n${editorFeedback}\n\nBanned phrases to avoid: ${bannedFeedback}\nPlease produce a corrected draft that fixes all flagged issues.`,
          })
        } else if (chapterDraft) {
          feedbackHistory.push({ role: 'user', content: `Regenerate Chapter ${chapterNumber} with improved continuity.` })
        }

        const result = await window.electronAPI.pipelineWriteChapter(projectPath, feedbackHistory, chapterNumber)

        const draftContent = result?.content || result?.chapter?.content || ''
        if (draftContent) {
          setChapterDraft(draftContent)
          detectBannedInDraft(draftContent)
          await runContinuityCheck(draftContent)
        } else if (result?.error) {
          console.error('Regenerate failed:', result.error)
        }
      } catch (error) {
        console.error('Regenerate with editor feedback failed:', error)
        if (chapterDraft) {
          await runContinuityCheck(chapterDraft)
        }
      } finally {
        setIsRunningCheck(false)
      }
      return
    }

    // Non-chapter phases: re-run continuity check on current draft as lightweight regenerate
    if (chapterDraft) {
      await runContinuityCheck(chapterDraft)
    }
  }, [currentStory, selectedChapter, currentPhase, chapterDraft, editorResult, runContinuityCheck, detectBannedInDraft])

  const handleAcceptChapter = async () => {
    if (!currentStory || !selectedChapter) return
    const projectPath = typeof currentStory === 'string' ? currentStory : currentStory.path
    const chapterNumber = selectedChapter.chapter
    try {
      await window.electronAPI.dbRun(
        projectPath,
        'UPDATE plot_outline SET status = ? WHERE project_id = ? AND chapter_number = ?',
        ['approved', storyData?.projectId || 1, chapterNumber]
      )
      // Merge any newly-detected banned phrases into the global list
      if (editorResult?.bannedPhrasesFound && editorResult.bannedPhrasesFound.length > 0) {
        const globalList = editorResult.bannedPhrasesFound.map(b => ({
          phrase: b.phrase,
          reason: 'Flagged during chapter approval',
        }))
        await window.electronAPI.addGlobalBannedPhrases(globalList)
      }
      // Reload story data to reflect the approved status
      await loadStoryData()
      setEditorResult(null)
      setChapterDraft('')
    } catch (error) {
      console.error('Failed to approve chapter:', error)
    }
  }

  const handleAddToGlobalBannedList = async (phrases: string[]) => {
    if (phrases.length === 0) return
    const entries = phrases.map(p => ({ phrase: p, reason: 'Added from Editor Notes Panel' }))
    try {
      await window.electronAPI.addGlobalBannedPhrases(entries)
    } catch (error) {
      console.error('Failed to add global banned phrases:', error)
    }
  }

  // Milestone 8: Export handlers
  const handleExport = async (format: 'docx' | 'epub' | 'markdown' | 'pdf') => {
    if (!currentStory) return
    const projectPath = typeof currentStory === 'string' ? currentStory : currentStory.path
    setExporting(format)
    setShowExportMenu(false)
    try {
      const api: any = window.electronAPI
      if (api.exportNovel) {
        const result = await api.exportNovel(projectPath, format)
        if (result.success) {
          setBackupStatus(`Exported ${result.count || ''} chapters to ${result.filePath}`)
          setTimeout(() => setBackupStatus(null), 4000)
        } else if (!result.canceled) {
          alert(result.error || 'Export failed')
        }
      } else {
        alert('Export not available in this build')
      }
    } catch (e: any) {
      alert(e.message || 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  const handleBackup = async () => {
    if (!currentStory) return
    const projectPath = typeof currentStory === 'string' ? currentStory : currentStory.path
    try {
      const api: any = window.electronAPI
      if (api.backupStory) {
        const result = await api.backupStory(projectPath)
        if (result.success) {
          setBackupStatus(`Backup saved to ${result.filePath}`)
          setTimeout(() => setBackupStatus(null), 4000)
        } else if (!result.canceled) {
          alert(result.error || 'Backup failed')
        }
      }
    } catch (e: any) {
      alert(e.message || 'Backup failed')
    }
  }

  const handleChapterSelect = (chapter: any) => {
    setSelectedChapter(chapter)
    setShowChapterList(false)
    // Reset editor state when switching chapters
    setEditorResult(null)
    setChapterDraft('')
  }

  const handleOutlineUpdated = (newOutline: any[]) => {
    setOutline(newOutline)
    setStoryData((prev: any) => ({ ...prev, outline: newOutline }))
  }

  // 5. Resize handle — 4px rgba(201,168,76,0.15) → gold on hover, draggable 30-70%
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizing || !workspaceRef.current) return
      const rect = workspaceRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const pct = Math.min(70, Math.max(30, (x / rect.width) * 100))
      setLeftWidth(pct)
    }
    const onUp = () => setIsResizing(false)
    if (isResizing) {
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  const handleCopyRight = async () => {
    try {
      await navigator.clipboard.writeText(rightPanelContent)
      setBackupStatus('📋 Copied')
      setTimeout(() => setBackupStatus(null), 1500)
    } catch {}
  }
  const handleSearchRight = () => {
    if (rightSearchOpen && rightSearchQuery) {
      // @ts-ignore
      if ((window as any).find) (window as any).find(rightSearchQuery)
    } else {
      setRightSearchOpen(!rightSearchOpen)
    }
  }

  // Living Document Edit/Paste Handlers
  const handleStartEditRight = (initialText?: string) => {
    setEditableContent(typeof initialText === 'string' ? initialText : rightPanelContent)
    setIsEditingRight(true)
  }

  const handleCancelEditRight = () => {
    setIsEditingRight(false)
    setEditableContent('')
  }

  const handlePasteClipboardToRight = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setEditableContent(text)
        setIsEditingRight(true)
        setRightSaveMsg('📋 Pasted from clipboard')
        setTimeout(() => setRightSaveMsg(null), 2500)
      }
    } catch {
      alert('Unable to read clipboard automatically. Please click inside the editor and press Ctrl+V.')
      setIsEditingRight(true)
    }
  }

  const handleSaveRightContent = async () => {
    if (!currentStory) return
    const projectPath = typeof currentStory === 'string' ? currentStory : currentStory.path
    setIsSavingRight(true)
    setRightSaveMsg(null)
    try {
      const projIdRes = await window.electronAPI.dbGet(projectPath, 'SELECT id FROM projects LIMIT 1', [])
      const projectId = projIdRes?.id || 1

      switch (currentPhase) {
        case 'brainstorm':
          await window.electronAPI.dbRun(projectPath, 'INSERT OR REPLACE INTO idea_notes (project_id, content) VALUES (?, ?)', [projectId, editableContent])
          await window.electronAPI.saveProjectFile(projectPath, 'idea_notes.md', editableContent)
          setStoryData((prev: any) => ({ ...prev, ideaNotes: editableContent }))
          setRightPanelContent(editableContent)
          break

        case 'structure':
          await window.electronAPI.dbRun(projectPath, 'INSERT OR REPLACE INTO story_structure (project_id, content) VALUES (?, ?)', [projectId, editableContent])
          await window.electronAPI.saveProjectFile(projectPath, 'story_structure.md', editableContent)
          setStoryData((prev: any) => ({ ...prev, structure: editableContent }))
          setRightPanelContent(editableContent)
          break

        case 'world_plot':
          await window.electronAPI.dbRun(projectPath, 'INSERT OR REPLACE INTO world_bible (project_id, content) VALUES (?, ?)', [projectId, editableContent])
          await window.electronAPI.saveProjectFile(projectPath, 'world_bible.md', editableContent)
          setStoryData((prev: any) => ({ ...prev, worldBible: editableContent }))
          setRightPanelContent(editableContent)
          break

        case 'characters':
          await window.electronAPI.saveProjectFile(projectPath, 'characters_custom.md', editableContent)
          setRightPanelContent(editableContent)
          break

        case 'chapters': {
          const chNum = selectedChapter?.chapter || selectedChapter?.chapter_number || 1
          const filename = `chapters/ch${String(chNum).padStart(2, '0')}.md`
          await window.electronAPI.saveProjectFile(projectPath, filename, editableContent)
          await window.electronAPI.dbRun(projectPath, 'UPDATE plot_outline SET status = "drafted" WHERE project_id = ? AND chapter_number = ?', [projectId, chNum])
          setOutline(prev => prev.map(o => (o.chapter === chNum || o.chapter_number === chNum) ? { ...o, status: 'drafted' } : o))
          setChapterDraft(editableContent)
          setRightPanelContent(editableContent)
          detectBannedInDraft(editableContent)
          runContinuityCheck(editableContent)
          break
        }
      }

      setRightSaveMsg('✓ Document saved!')
      setIsEditingRight(false)
      setTimeout(() => setRightSaveMsg(null), 3000)
    } catch (err: any) {
      alert(err.message || 'Failed to save document')
    } finally {
      setIsSavingRight(false)
    }
  }

  const handleHumanizeScript = async () => {
    const textToHumanize = isEditingRight ? editableContent : (rightPanelContent || chapterDraft || '')
    if (!textToHumanize.trim()) return

    setIsHumanizing(true)
    setRightSaveMsg('✨ Humanizing prose cadence & purging AI slop...')
    try {
      const voiceProfile = storyData?.characters?.map((c: any) => `${c.name}: ${c.voice_fingerprint || ''}`).join('; ') || ''

      const res = await window.electronAPI.humanizeNarrative({
        text: textToHumanize,
        voiceProfile,
      })

      if (res && res.success && res.humanizedText) {
        const humanized = res.humanizedText
        if (isEditingRight) {
          setEditableContent(humanized)
        }
        setRightPanelContent(humanized)
        if (currentPhase === 'chapters') {
          setChapterDraft(humanized)
          detectBannedInDraft(humanized)
        }

        // Auto-save the humanized result to storage immediately if in a project
        if (currentStory) {
          const projectPath = typeof currentStory === 'string' ? currentStory : currentStory.path
          const projIdRes = await window.electronAPI.dbGet(projectPath, 'SELECT id FROM projects LIMIT 1', [])
          const projectId = projIdRes?.id || 1

          switch (currentPhase) {
            case 'brainstorm':
              await window.electronAPI.dbRun(projectPath, 'INSERT OR REPLACE INTO idea_notes (project_id, content) VALUES (?, ?)', [projectId, humanized])
              await window.electronAPI.saveProjectFile(projectPath, 'idea_notes.md', humanized)
              setStoryData((prev: any) => ({ ...prev, ideaNotes: humanized }))
              break
            case 'structure':
              await window.electronAPI.dbRun(projectPath, 'INSERT OR REPLACE INTO story_structure (project_id, content) VALUES (?, ?)', [projectId, humanized])
              await window.electronAPI.saveProjectFile(projectPath, 'story_structure.md', humanized)
              setStoryData((prev: any) => ({ ...prev, structure: humanized }))
              break
            case 'world_plot':
              await window.electronAPI.dbRun(projectPath, 'INSERT OR REPLACE INTO world_bible (project_id, content) VALUES (?, ?)', [projectId, humanized])
              await window.electronAPI.saveProjectFile(projectPath, 'world_bible.md', humanized)
              setStoryData((prev: any) => ({ ...prev, worldBible: humanized }))
              break
            case 'chapters': {
              const chNum = selectedChapter?.chapter || selectedChapter?.chapter_number || 1
              const padded = String(chNum).padStart(2, '0')
              await window.electronAPI.saveProjectFile(projectPath, `chapters/ch${padded}.md`, humanized)
              await window.electronAPI.dbRun(projectPath, 'INSERT OR REPLACE INTO chapters (project_id, chapter_number, content, status) VALUES (?, ?, ?, "drafted")', [projectId, chNum, humanized])
              break
            }
          }
        }

        const burstBefore = res.originalStats?.burstinessScore || 0
        const burstAfter = res.humanizedStats?.burstinessScore || 0
        const slopPurged = res.changesCount || 0
        setRightSaveMsg(`✨ Humanized: Burstiness ${burstBefore} → ${burstAfter} (${slopPurged} AI tells purged)`)
      }
    } catch (err: any) {
      console.error('Humanize failed:', err)
      setRightSaveMsg(`⚠️ Humanize failed: ${err.message || String(err)}`)
    } finally {
      setIsHumanizing(false)
      setTimeout(() => setRightSaveMsg(null), 5000)
    }
  }

  const updateRightPanel = () => {
    const data = storyData
    if (!data) {
      setRightPanelContent('')
      return
    }

    switch (currentPhase) {
      case 'brainstorm':
        setRightPanelContent(data.ideaNotes || 'Brainstorm notes will appear here as you chat.')
        break
      case 'structure':
        setRightPanelContent(data.structure || 'Story structure will appear here.')
        break
      case 'world_plot':
        setRightPanelContent(data.worldBible || 'World bible will appear here.')
        break
      case 'characters':
        if (data.characters.length > 0) {
          setRightPanelContent(
            data.characters.map((c: CharacterSheet) => 
              `## ${c.name} (${c.role})\n\n**Voice Fingerprint:** ${c.voice_fingerprint}\n\n**Locked Facts:**\n${c.locked_facts.map((f: string) => `- ${f}`).join('\n')}`
            ).join('\n\n---\n\n')
          )
        } else {
          setRightPanelContent('Character sheets will appear here as you create them.')
        }
        break
      case 'chapters':
        if (chapterDraft) {
          setRightPanelContent(chapterDraft)
        } else if (selectedChapter) {
          setRightPanelContent(`## Chapter ${selectedChapter.chapter}: ${selectedChapter.beat_summary}\n\n**POV:** ${selectedChapter.pov_character}\n**Characters:** ${selectedChapter.characters_present.join(', ')}\n**Must Include:** ${selectedChapter.must_include.join(', ')}\n**Status:** ${selectedChapter.status}`)
        } else {
          setRightPanelContent('Select a chapter from the sidebar to see its outline beat.')
        }
        break
    }
  }

  useEffect(() => {
    updateRightPanel()
  }, [currentPhase, storyData, selectedChapter, chapterDraft])

  if (!currentStory) {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="paper-card p-12 max-w-md text-center">
          <h2 className="font-display text-2xl text-lamp-gold mb-4">No story selected</h2>
          <p className="text-muted-slate">Go back to Library to create or open a story.</p>
        </div>
      </div>
    )
  }

  const projectPath = typeof currentStory === 'string' ? currentStory : currentStory.path

  return (
    <div className="app-shell">
      <header className="flex items-center justify-between px-6 pr-36 py-2.5 border-b border-muted-slate/10 bg-ink-night/95 backdrop-blur-md z-10 min-w-0 select-none">
        <div className="flex items-center gap-4 min-w-0 flex-1 overflow-hidden">
          <ForgeLogo size={28} showText />
          <div className="min-w-0 flex-1 overflow-hidden">
            <PhaseSealRibbon currentPhase={currentPhase} completedPhases={storyData?.completedPhases || []} />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {/* Obsidian Graph View Button */}
          <button
            onClick={() => setShowGraphView(true)}
            className="btn-ghost text-sm px-2.5 py-1.5 flex items-center gap-1.5 rounded-lg border border-muted-slate/15 hover:border-lamp-gold/40 group hover:scale-105 active:scale-95 transition-all duration-200"
            title="Open Obsidian Interactive Knowledge Graph (Ctrl+G)"
          >
            <span className="group-hover:rotate-12 transition-transform duration-200">🕸️</span>
            <span className="text-xs hidden sm:inline font-medium text-lamp-gold">Graph View</span>
          </button>

          {/* Quick Theme Switcher Button */}
          <button
            onClick={() => setConfig({ theme: config.theme === 'dark' ? 'light' : 'dark' })}
            className="btn-ghost text-sm px-2.5 py-1.5 flex items-center gap-1.5 rounded-lg border border-muted-slate/15 hover:border-lamp-gold/40 group hover:scale-105 active:scale-95 transition-all duration-200"
            title={`Switch to ${config.theme === 'dark' ? 'Obsidian Light' : 'Obsidian Dark'} mode`}
          >
            <span className="transition-transform duration-500 ease-out group-hover:rotate-45 group-hover:scale-110">
              {config.theme === 'dark' ? '☀️' : '🌙'}
            </span>
            <span className="text-xs hidden md:inline font-medium">{config.theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

          {/* Analytics — always visible */}
          <button
            onClick={() => setShowAnalytics(true)}
            className="btn-ghost text-sm px-3 py-1.5 flex items-center gap-1 hover:scale-105 active:scale-95 transition-transform duration-150"
            title="Word count & cost dashboard"
          >
            <span className="hover:animate-bounce">📊</span> <span className="hidden sm:inline">Analytics</span>
          </button>

          {/* ⋯ Actions overflow dropdown — Export + Backup + Project ID */}
          <div className="relative" data-actions-menu>
            <button
              onClick={() => { setShowActionsMenu(!showActionsMenu); setShowExportMenu(false) }}
              className="btn-ghost text-sm px-3 py-1.5 flex items-center gap-1 hover:scale-105 active:scale-95 transition-transform duration-150"
              title="More actions"
            >
              ⋯
            </button>
            {showActionsMenu && (
              <div className="absolute right-0 mt-2 w-60 bg-aged-paper-dark border border-muted-slate/20 rounded-lg shadow-2xl z-30 overflow-hidden animate-spring-pop">
                {/* Project ID badge */}
                <div className="px-4 py-2 border-b border-muted-slate/10 text-xs text-muted-slate/60 font-mono">
                  Project #{storyData?.projectId ?? '—'}
                </div>

                {/* Export submenu trigger */}
                <div className="relative group">
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    disabled={!!exporting}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-aged-paper/10 text-muted-slate hover:text-lamp-gold flex items-center justify-between"
                  >
                    <span>{exporting ? `Exporting ${exporting}…` : '📤 Export Novel'}</span>
                    <span className="text-xs opacity-60">▸</span>
                  </button>
                  {showExportMenu && (
                    <div className="absolute right-full top-0 mr-1 w-48 bg-aged-paper-dark border border-muted-slate/20 rounded-lg shadow-xl overflow-hidden z-40">
                      <button onClick={() => handleExport('markdown')} className="w-full text-left px-4 py-2 text-sm hover:bg-aged-paper/10 text-muted-slate hover:text-lamp-gold">📄 Markdown (.md)</button>
                      <button onClick={() => handleExport('docx')} className="w-full text-left px-4 py-2 text-sm hover:bg-aged-paper/10 text-muted-slate hover:text-lamp-gold">📝 Word (.docx)</button>
                      <button onClick={() => handleExport('epub')} className="w-full text-left px-4 py-2 text-sm hover:bg-aged-paper/10 text-muted-slate hover:text-lamp-gold">📖 EPUB (.epub)</button>
                      <button onClick={() => handleExport('pdf')} className="w-full text-left px-4 py-2 text-sm hover:bg-aged-paper/10 text-muted-slate hover:text-lamp-gold">📑 PDF (.pdf → HTML)</button>
                    </div>
                  )}
                </div>

                {/* Backup */}
                <button
                  onClick={() => { handleBackup(); setShowActionsMenu(false) }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-aged-paper/10 text-muted-slate hover:text-lamp-gold"
                >
                  💾 Backup ZIP
                </button>
              </div>
            )}
          </div>

          {/* ← Library — always visible */}
          <button
            onClick={() => setCurrentStory(null)}
            className="btn-ghost text-sm px-3 py-1.5 flex items-center gap-1 shrink-0"
          >
            ← <span className="hidden sm:inline">Library</span>
          </button>
        </div>
      </header>
      {backupStatus && (
        <div className="bg-jade-ink/10 border border-jade-ink/30 text-jade-ink text-sm px-6 py-2 text-center">
          {backupStatus}
        </div>
      )}
      {showAnalytics && (
        <AnalyticsModal projectPath={projectPath} onClose={() => setShowAnalytics(false)} />
      )}
      {selectedCharacterForEdit && (
        <CharacterFactEditor
          character={selectedCharacterForEdit}
          projectPath={projectPath}
          onClose={() => setSelectedCharacterForEdit(null)}
          onUpdated={(updated) => {
            setStoryData((prev: any) => ({
              ...prev,
              characters: prev.characters.map((c: any) => c.id === updated.id ? updated : c),
            }))
            setSelectedCharacterForEdit(updated)
          }}
        />
      )}

      {/* Obsidian Interactive Knowledge Graph Modal */}
      {showGraphView && (
        <StoryGraphView
          storyData={storyData}
          currentStory={currentStory}
          theme={config.theme}
          onClose={() => setShowGraphView(false)}
          onSelectChapter={(chNum) => {
            const ch = outline.find((o) => o.chapter === chNum) || { chapter: chNum }
            handleChapterSelect(ch)
            setCurrentPhase('chapters')
          }}
          onSelectCharacter={(char) => {
            setSelectedCharacterForEdit(char)
          }}
        />
      )}

      <main className="flex-1 overflow-hidden">
        {/* Phase Tabs — Obsidian workspace ribbon style */}
        <div className="flex items-center border-b border-muted-slate/10 bg-aged-paper-dark px-4 py-1.5 gap-1.5 overflow-x-auto">
          {PHASES.map(phase => {
            const isActive = currentPhase === phase
            return (
              <button
                key={phase}
                onClick={() => { setCurrentPhase(phase); updateRightPanel() }}
                className={`group px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 flex items-center gap-1.5 shrink-0 hover:scale-[1.03] active:scale-[0.96] ${
                  isActive
                    ? 'bg-aged-paper text-lamp-gold shadow-sm border border-lamp-gold/30 font-semibold ring-1 ring-lamp-gold/20'
                    : 'text-muted-slate hover:text-text-primary hover:bg-muted-slate/10 border border-transparent'
                }`}
              >
                <span className="transition-transform duration-200 group-hover:scale-125">
                  {phase === 'brainstorm' ? '💡' : phase === 'structure' ? '📐' : phase === 'world_plot' ? '🌐' : phase === 'characters' ? '👥' : phase === 'chapters' ? '📖' : '🎥'}
                </span>
                <span>{PHASE_LABELS[phase]}</span>
              </button>
            )
          })}

          <div className="h-4 w-px bg-muted-slate/20 mx-1 shrink-0" />
          <button
            onClick={() => setShowGraphView(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg text-lamp-gold hover:bg-lamp-gold/10 border border-lamp-gold/30 bg-lamp-gold/5 transition-all flex items-center gap-1.5 shrink-0 shadow-sm hover:scale-105 active:scale-95"
            title="Open Obsidian Interactive Knowledge Graph (Ctrl+G)"
          >
            <span>🕸️</span>
            <span className="font-semibold">Graph View</span>
          </button>
        </div>

        {/* Banned Phrases Badge (only on Chapters phase) */}
        {currentPhase === 'chapters' && editorResult?.bannedPhrasesFound && editorResult.bannedPhrasesFound.length > 0 && (
          <BannedPhrasesBadge
            bannedPhrasesFound={editorResult.bannedPhrasesFound}
            onAddToGlobalList={(phrase) => handleAddToGlobalBannedList([phrase])}
          />
        )}

        {/* Main Workspace */}
        {currentPhase === 'video_studio' ? (
          <div className="h-[calc(100%-48px)]">
            <VideoStudioScreen
              projectPath={projectPath}
              initialEpisodeNumber={selectedChapter?.chapter || selectedChapter?.chapter_number || 1}
              initialTab={targetVideoTab}
            />
          </div>
        ) : (
          <div
            ref={workspaceRef}
            className={`flex h-[calc(100%-48px)] overflow-hidden ${currentPhase === 'chapters' && editorResult ? 'split-panel-three' : 'split-panel'}`}
          >
            {/* Left Panel - Chat */}
            <div className="flex flex-col overflow-hidden shrink-0" style={{ width: `${leftWidth}%`, minWidth: '30%', maxWidth: '70%' }}>
              <ChatPanel
                phase={currentPhase}
                projectPath={projectPath}
                onSave={handleSave}
                onRegenerate={handleRegenerate}
                savedContent={rightPanelContent}
                chapterNumber={selectedChapter?.chapter || selectedChapter?.chapter_number || 1}
              />
            </div>

            {/* Draggable handle — 4px rgba(201,168,76,0.15) → gold on hover, 30-70% */}
            <div
              onMouseDown={handleMouseDown}
              className={`shrink-0 cursor-col-resize transition-all duration-200 ${isResizing ? 'bg-[#C9A84C] scale-x-125' : 'hover:bg-[#C9A84C] hover:scale-x-125'}`}
              style={{ width: '4px', backgroundColor: isResizing ? '#C9A84C' : 'rgba(201,168,76,0.15)' }}
              title="Drag to resize (30-70%)"
            />

          {/* Right Panel - Living Document */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="p-4 border-b border-muted-slate/10 bg-ink-night/50 relative">
              {isHumanizing && (
                <div className="absolute top-0 left-0 right-0 h-0.5 shimmer-active" />
              )}
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <h3 className="font-display text-lg text-lamp-gold capitalize truncate">{PHASE_LABELS[currentPhase]} Notes</h3>
                  {isEditingRight && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-lamp-gold/20 text-lamp-gold border border-lamp-gold/30 font-mono font-bold animate-spring-pop shrink-0">
                      EDITING
                    </span>
                  )}
                  <span className="text-[10px] px-2 py-0.5 rounded bg-jade-ink/10 text-jade-ink border border-jade-ink/20 font-mono flex items-center gap-1 shrink-0" title="Passive Narrative Humanizer is active on every generation">
                    <span className="w-1.5 h-1.5 rounded-full bg-jade-ink animate-pulse" />
                    Auto-Humanizer: Active
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                  {rightSaveMsg && (
                    <span className="text-xs text-jade-ink font-mono bg-jade-ink/10 px-2 py-0.5 rounded border border-jade-ink/20 animate-spring-pop ring-1 ring-jade-ink/30">
                      {rightSaveMsg}
                    </span>
                  )}

                  {isEditingRight ? (
                    <>
                      <button
                        onClick={handleSaveRightContent}
                        disabled={isSavingRight}
                        className="btn-primary text-xs px-3 py-1 flex items-center gap-1 font-bold shadow hover:scale-105 active:scale-95 transition-all duration-150"
                        title="Save changes (Ctrl+S)"
                      >
                        {isSavingRight ? 'Saving…' : '💾 Save'}
                      </button>
                      <button
                        onClick={handlePasteClipboardToRight}
                        className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1 hover:scale-105 active:scale-95 transition-all duration-150"
                        title="Paste from clipboard"
                      >
                        📋 Paste
                      </button>
                      <button
                        onClick={handleHumanizeScript}
                        disabled={isHumanizing || isSavingRight}
                        className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1 text-lamp-gold border-lamp-gold/40 hover:bg-lamp-gold/10 hover:scale-105 active:scale-95 transition-all duration-150"
                        title="Run Narrative Humanizer: Purge AI tells, optimize burstiness and human cadence"
                      >
                        {isHumanizing ? '✨ Humanizing…' : '👁️ Humanize'}
                      </button>
                      <button
                        onClick={handleCancelEditRight}
                        disabled={isSavingRight}
                        className="btn-ghost text-xs px-2.5 py-1 hover:scale-105 active:scale-95 transition-all duration-150"
                        title="Cancel editing"
                      >
                        ↩ Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleStartEditRight()}
                        className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1 hover:text-lamp-gold hover:scale-105 active:scale-95 transition-all duration-150"
                        title="Edit script directly"
                      >
                        ✏️ Edit Script
                      </button>
                      <button
                        onClick={handlePasteClipboardToRight}
                        className="btn-ghost text-xs px-2.5 py-1 flex items-center gap-1 hover:text-lamp-gold hover:scale-105 active:scale-95 transition-all duration-150"
                        title="Paste your script from clipboard"
                      >
                        📋 Paste Script
                      </button>
                      <button
                        onClick={handleHumanizeScript}
                        disabled={isHumanizing}
                        className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1 text-lamp-gold border-lamp-gold/40 hover:bg-lamp-gold/10 hover:scale-105 active:scale-95 transition-all duration-150"
                        title="Run Narrative Humanizer: Purge AI tells, optimize burstiness and human cadence"
                      >
                        {isHumanizing ? '✨ Humanizing…' : '👁️ Humanize'}
                      </button>
                      <button onClick={handleCopyRight} className="btn-ghost p-1.5 text-xs hover:scale-110 active:scale-90 transition-transform duration-150" title="Copy document">📋</button>
                      <button onClick={handleSearchRight} className="btn-ghost p-1.5 text-xs hover:scale-110 active:scale-90 transition-transform duration-150" title="Search in document">🔍</button>
                      {currentPhase === 'chapters' && (
                        <>
                          <button
                            onClick={() => handleAnimateChapter(selectedChapter || { chapter: 1 })}
                            className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1 hover:text-lamp-gold border-lamp-gold/40 text-lamp-gold hover:scale-105 active:scale-95 transition-all duration-150"
                            title="Auto-animate this chapter into video scenes and dialogue"
                          >
                            🎬 Animate Episode
                          </button>
                          <button
                            onClick={() => setShowChapterList(!showChapterList)}
                            className="btn-ghost text-sm px-3 py-1 ml-1 hover:scale-105 active:scale-95 transition-all duration-150"
                          >
                            {showChapterList ? 'Hide' : 'Show'} Chapters
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
              <p className="text-sm text-muted-slate">
                {isEditingRight
                  ? 'Editing script directly. Press Ctrl+S to save anytime.'
                  : 'Updates live as you chat, or click "Edit Script" to write or paste your own script.'}
              </p>
              {rightSearchOpen && (
                <div className="mt-2 flex gap-2">
                  <input
                    value={rightSearchQuery}
                    onChange={e => setRightSearchQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSearchRight() }}
                    placeholder="Search in document..."
                    className="input-field flex-1 h-8 text-xs"
                    autoFocus
                  />
                  <button onClick={handleSearchRight} className="btn-secondary text-xs px-3">Find</button>
                  <button onClick={() => setRightSearchOpen(false)} className="btn-ghost text-xs">✕</button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
              {isEditingRight ? (
                <div className="paper-card p-4 flex flex-col h-full min-h-[500px] space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-slate border-b border-muted-slate/15 pb-2">
                    <span className="font-mono text-lamp-gold">✏️ Direct Script Editor — {PHASE_LABELS[currentPhase]}</span>
                    <span className="font-mono">
                      {editableContent.trim() ? editableContent.trim().split(/\s+/).length : 0} words · {editableContent.length} chars
                    </span>
                  </div>
                  <textarea
                    value={editableContent}
                    onChange={e => setEditableContent(e.target.value)}
                    onKeyDown={e => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                        e.preventDefault()
                        handleSaveRightContent()
                      }
                    }}
                    placeholder={`Paste or write your ${PHASE_LABELS[currentPhase].toLowerCase()} script or chapter prose here...\n\nKeyboard shortcut: Ctrl+S to save.`}
                    className="flex-1 w-full p-4 bg-ink-night/70 text-text-primary font-mono text-sm leading-relaxed border border-muted-slate/20 rounded-lg resize-none focus:outline-none focus:border-lamp-gold custom-scrollbar min-h-[460px]"
                    autoFocus
                    spellCheck={false}
                  />
                  <div className="flex items-center justify-between pt-2 border-t border-muted-slate/10 text-xs">
                    <span className="text-muted-slate/70">Press <kbd className="px-1.5 py-0.5 bg-black/60 rounded font-mono text-[10px]">Ctrl+S</kbd> to save</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCancelEditRight}
                        disabled={isSavingRight}
                        className="btn-ghost text-xs px-3 py-1"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveRightContent}
                        disabled={isSavingRight}
                        className="btn-primary text-xs px-4 py-1.5 font-bold shadow"
                      >
                        {isSavingRight ? 'Saving…' : '💾 Save Changes'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="paper-card p-6 min-h-full prose prose-sm max-w-none text-text-primary">
                  {(() => {
                    // In-prose banned phrases highlighter — yellow/red spans in draft viewer per §4.3
                    const banned = editorResult?.bannedPhrasesFound || []
                    const text = chapterDraft || rightPanelContent
                    if (text && banned.length > 0 && (currentPhase === 'chapters' || chapterDraft)) {
                      return <HighlightedDraft content={text} bannedPhrases={banned} />
                    }
                    if (rightPanelContent) {
                      return <div className="obsidian-note-prose whitespace-pre-wrap leading-relaxed font-sans">{rightPanelContent}</div>
                    }
                    return (
                      <div className="text-center text-muted-slate/50 py-12">
                        <p>Start chatting on the left to see your {PHASE_LABELS[currentPhase].toLowerCase()} take shape here, or click "Edit Script" above to paste your own.</p>
                      </div>
                    )
                  })()}
                </div>
              )}
              {/* Milestone 5b: Batch Outline Table (visible in World & Plot and Chapters) */}
              {(currentPhase === 'world_plot' || currentPhase === 'chapters' || outline.length > 0) && (
                <OutlineTable outline={outline} projectPath={projectPath} onOutlineUpdated={handleOutlineUpdated} />
              )}
            </div>

            {/* Chapter Sidebar */}
            {currentPhase === 'chapters' && showChapterList && (
              <div className="panel-narrow p-4 border-t border-muted-slate/10 bg-ink-night/30">
                <h4 className="font-display text-sm text-lamp-gold mb-3">Chapters</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                  {outline.map((chapter: any) => (
                    <div
                      key={chapter.chapter}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleChapterSelect(chapter)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleChapterSelect(chapter) }}
                      className={`w-full text-left p-3 rounded-lg text-sm transition-colors cursor-pointer ${
                        selectedChapter?.chapter === chapter.chapter
                          ? 'bg-lamp-gold/10 border border-lamp-gold/30 text-text-primary'
                          : 'bg-ink-night/50 hover:bg-ink-night text-muted-slate'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-lamp-gold font-bold">Ch. {chapter.chapter}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            chapter.status === 'approved' ? 'bg-jade-ink/20 text-jade-ink' :
                            chapter.status === 'drafted' ? 'bg-lamp-gold/20 text-lamp-gold' :
                            'bg-muted-slate/20 text-muted-slate'
                          }`}>
                            {chapter.status}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAnimateChapter(chapter)
                            }}
                            className="text-[10px] bg-lamp-gold/10 hover:bg-lamp-gold/25 text-lamp-gold px-2 py-0.5 rounded border border-lamp-gold/30 transition-colors font-mono font-medium flex items-center gap-1"
                            title={`Auto-Animate Chapter ${chapter.chapter} into video`}
                          >
                            🎬 Animate
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-slate/70 mt-1 line-clamp-1">{chapter.beat_summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Character Roster — click to open 🔒/🟢 fact modal */}
            {currentPhase === 'characters' && storyData && storyData.characters.length > 0 && (
              <div className="panel-narrow p-4 border-t border-muted-slate/10 bg-ink-night/30 space-y-3">
                <h4 className="font-display text-sm text-lamp-gold">Character Roster — Click to edit locked/open facts</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                  {storyData.characters.map((char: CharacterSheet) => (
                    <div
                      key={char.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Edit ${char.name} facts, ${char.locked_facts?.length || 0} locked`}
                      onClick={() => setSelectedCharacterForEdit(char)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedCharacterForEdit(char) } }}
                      className="p-3 rounded-lg border cursor-pointer transition-colors hover:bg-aged-paper/10 bg-ink-night/50 border-muted-slate/10 focus:outline-none focus:ring-2 focus:ring-lamp-gold"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-text-primary">{char.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted-slate/20 text-muted-slate">{char.role}</span>
                      </div>
                      <p className="text-[11px] text-muted-slate/70 mt-1 line-clamp-1">{char.voice_fingerprint}</p>
                      <p className="text-[10px] text-muted-slate/50">🔒 {char.locked_facts?.length || 0} locked • 🟢 {(char.current_state?.split('\n').filter(Boolean).length || 0) - (char.locked_facts?.length || 0)} open • Click for pill toggle modal</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Editor Notes Side-Panel (only on Chapters phase when results are available) */}
          {currentPhase === 'chapters' && editorResult && (
            <div className="panel-editor">
              {isRunningCheck ? (
                <div className="flex items-center justify-center h-full p-6">
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-lamp-gold/30 border-t-lamp-gold rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-slate text-sm">Running continuity check...</p>
                  </div>
                </div>
              ) : (
                <EditorNotesPanel
                  issues={editorResult.issues}
                  bannedPhrasesFound={editorResult.bannedPhrasesFound}
                  summary={editorResult.summary}
                  chapterNumber={selectedChapter?.chapter || 1}
                  onAccept={handleAcceptChapter}
                  onRegenerate={handleRegenerate}
                  onAddToGlobalBannedList={handleAddToGlobalBannedList}
                />
              )}
            </div>
          )}
        </div>
        )}
      </main>
    </div>
  )
}
