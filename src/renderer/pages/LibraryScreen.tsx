import React, { useState, useEffect } from 'react'
import { useApp } from '../App'
import { PhaseDots } from '../components/PhaseDots'
import { ForgeLogo } from '../components/ForgeLogo'
import type { StoryProject } from '../types'

export function LibraryScreen() {
  const { config, setCurrentStory, setConfig, setShowSettings } = useApp()
  const [stories, setStories] = useState<StoryProject[]>([])
  const [showNewStory, setShowNewStory] = useState(false)
  const [newStoryTitle, setNewStoryTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [storyToDelete, setStoryToDelete] = useState<StoryProject | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [storyToRename, setStoryToRename] = useState<StoryProject | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'completed'>('all')
  const [duplicating, setDuplicating] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [zipStatus, setZipStatus] = useState<string | null>(null)

  useEffect(() => {
    loadStories()
  }, [config.libraryPath])

  const loadStories = async () => {
    try {
      // Prefer getStories, fallback to scanLibrary for backwards compat
      const api: any = window.electronAPI
      const result = api.getStories
        ? await api.getStories()
        : api.scanLibrary
          ? await api.scanLibrary()
          : []
      setStories(result || [])
    } catch (error) {
      console.error('Failed to load stories:', error)
      setStories([])
    }
  }

  const handleCreateStory = async () => {
    if (!newStoryTitle.trim()) return
    setCreating(true)
    try {
      const story = await window.electronAPI.createStory(newStoryTitle.trim())
      const newStoryProject: StoryProject = {
        id: story.id,
        title: story.title,
        path: story.path,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        phasesCompleted: [],
        chapterCount: 0,
        wordCount: 0
      }
      setStories(prev => [...prev, newStoryProject])
      setShowNewStory(false)
      setNewStoryTitle('')
      setCurrentStory(newStoryProject)
    } catch (error: any) {
      alert(error.message || 'Failed to create story')
    } finally {
      setCreating(false)
    }
  }

  const handleOpenStory = (story: StoryProject) => {
    setCurrentStory(story)
  }

  const handleOpenFolder = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await window.electronAPI.openStoryFolder(path)
  }

  const handleSelectLibrary = async () => {
    const path = await window.electronAPI.selectLibraryFolder()
    if (path) {
      setConfig({ libraryPath: path })
      loadStories()
    }
  }

  const handleDeleteRequest = (story: StoryProject, e: React.MouseEvent) => {
    e.stopPropagation()
    setStoryToDelete(story)
    setDeleteError(null)
  }

  const handleConfirmDelete = async () => {
    if (!storyToDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const api: any = window.electronAPI
      const result = api.deleteStory
        ? await api.deleteStory(storyToDelete.path)
        : await (window as any).electron?.invoke?.('library:delete-story', storyToDelete.path)

      // Main returns { success: boolean, error?: string } or may throw
      if (result && result.success === false) {
        throw new Error(result.error || 'Failed to delete story')
      }
      setStories(prev => prev.filter(s => s.path !== storyToDelete.path))
      setStoryToDelete(null)
    } catch (error: any) {
      console.error('Failed to delete story:', error)
      setDeleteError(error.message || 'Failed to delete story')
    } finally {
      setDeleting(false)
    }
  }

  const handleCancelDelete = () => {
    if (deleting) return
    setStoryToDelete(null)
    setDeleteError(null)
  }

  const handleRenameRequest = (story: StoryProject, e: React.MouseEvent) => {
    e.stopPropagation()
    setStoryToRename(story)
    setRenameTitle(story.title)
    setRenameError(null)
  }

  const handleConfirmRename = async () => {
    if (!storyToRename || !renameTitle.trim()) return
    const trimmed = renameTitle.trim()
    if (trimmed === storyToRename.title) {
      setStoryToRename(null)
      return
    }
    setRenaming(true)
    setRenameError(null)
    try {
      const api: any = window.electronAPI
      const result = api.renameStory
        ? await api.renameStory(storyToRename.path, trimmed)
        : await (window as any).electron?.invoke?.('library:rename-story', { oldPath: storyToRename.path, newTitle: trimmed })

      if (result && result.success === false) {
        throw new Error(result.error || 'Failed to rename story')
      }

      const newPath = result?.newPath || storyToRename.path.replace(/[^/\\]+$/, trimmed)
      const newTitleSanitized = result?.newTitle || trimmed

      setStories(prev => prev.map(s => s.path === storyToRename.path ? { ...s, title: newTitleSanitized, id: newTitleSanitized, path: newPath } : s))
      setStoryToRename(null)
      setRenameTitle('')
    } catch (error: any) {
      console.error('Failed to rename story:', error)
      setRenameError(error.message || 'Failed to rename story')
    } finally {
      setRenaming(false)
    }
  }

  const handleCancelRename = () => {
    if (renaming) return
    setStoryToRename(null)
    setRenameTitle('')
    setRenameError(null)
  }

  const handleBackupStory = async (story: StoryProject, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const api: any = window.electronAPI
      const result = api.backupStory ? await api.backupStory(story.path) : null
      if (result?.success) {
        setZipStatus(`Backup saved: ${result.filePath}`)
        setTimeout(() => setZipStatus(null), 4000)
      } else if (!result?.canceled && result?.error) {
        alert(result.error)
      }
    } catch (err: any) {
      alert(err.message || 'Backup failed')
    }
  }

  const handleImportStory = async () => {
    setImporting(true)
    try {
      const api: any = window.electronAPI
      const result = api.importStory ? await api.importStory() : null
      if (result?.success) {
        setZipStatus(`Imported: ${result.title || result.dest}`)
        await loadStories()
        setTimeout(() => setZipStatus(null), 4000)
      } else if (!result?.canceled && result?.error) {
        alert(result.error)
      }
    } catch (err: any) {
      alert(err.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const handleDuplicateStory = async (story: StoryProject, e: React.MouseEvent) => {
    e.stopPropagation()
    setDuplicating(story.path)
    try {
      const api: any = window.electronAPI
      const result = api.duplicateStory ? await api.duplicateStory(story.path) : null
      if (result?.success) {
        setZipStatus(`Duplicated: ${result.title}`)
        await loadStories()
        setTimeout(() => setZipStatus(null), 4000)
      } else if (!result?.canceled && result?.error) {
        alert(result.error)
      }
    } catch (err: any) {
      alert(err.message || 'Duplicate failed')
    } finally {
      setDuplicating(null)
    }
  }

  // Derived filtered stories per search + chips
  const filteredStories = stories.filter(story => {
    const matchesSearch = !searchQuery || story.title.toLowerCase().includes(searchQuery.toLowerCase())
    let matchesFilter = true
    const completed = story.phasesCompleted?.length || 0
    if (filter === 'in_progress') matchesFilter = completed > 0 && completed < 5
    if (filter === 'completed') matchesFilter = completed === 5
    return matchesSearch && matchesFilter
  })

  if (!config.libraryPath) {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="paper-card p-12 max-w-md w-full mx-4 text-center">
          <h1 className="font-display text-4xl text-lamp-gold mb-4">Welcome to WebNovel Forge</h1>
          <p className="text-muted-slate mb-8">
            First, choose where your stories will live. This folder will contain all your projects —
            each story gets its own self-contained subfolder with database, chapters, and chat history.
          </p>
          <button onClick={handleSelectLibrary} className="btn-primary w-full">
            Select Library Folder
          </button>
          <p className="text-xs text-muted-slate/60 mt-4">
            Default: <code className="font-mono bg-ink-night/50 px-1 rounded">{config.libraryPath || 'Documents/WebNovelForge'}</code>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="flex items-center justify-between px-8 pr-36 py-5 border-b border-muted-slate/10 bg-ink-night/95 backdrop-blur-md select-none">
        <div className="flex items-center gap-4">
          <ForgeLogo size={36} showText subtitle="Knowledge Base & Story Library" />
        </div>
        <div className="flex items-center gap-2.5">
          {/* Quick Theme Switcher Button */}
          <button
            onClick={() => setConfig({ theme: config.theme === 'dark' ? 'light' : 'dark' })}
            className="btn-ghost text-sm px-3 py-1.5 flex items-center gap-1.5 rounded-lg border border-muted-slate/15 hover:border-lamp-gold/40 group hover:scale-105 active:scale-95 transition-all duration-200"
            title={`Switch to ${config.theme === 'dark' ? 'Obsidian Light' : 'Obsidian Dark'} mode`}
          >
            <span className="transition-transform duration-500 ease-out group-hover:rotate-45 group-hover:scale-110">
              {config.theme === 'dark' ? '☀️' : '🌙'}
            </span>
            <span className="text-xs font-medium">{config.theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
          <button onClick={handleSelectLibrary} className="btn-ghost text-sm hover:scale-105 active:scale-95 transition-all duration-150" title="Select library folder">
            📁 Library
          </button>
          <button onClick={handleImportStory} disabled={importing} className="btn-ghost text-sm hover:scale-105 active:scale-95 transition-all duration-150" title="Import story from ZIP">
            {importing ? 'Importing...' : '📦 Import ZIP'}
          </button>
          <button onClick={() => setShowSettings(true)} className="btn-ghost text-sm hover:scale-105 active:scale-95 transition-all duration-150" title="Open Settings">
            ⚙️ Settings
          </button>
          <button onClick={() => setShowNewStory(true)} className="btn-primary hover:scale-105 active:scale-95 transition-all duration-150 shadow">
            + New Story
          </button>
        </div>
      </header>
      {zipStatus && (
        <div className="bg-jade-ink/10 border-b border-jade-ink/30 text-jade-ink text-sm px-8 py-2 text-center animate-spring-pop">
          {zipStatus}
        </div>
      )}

      {/* Search + Filter Bar — Obsidian sleek toolbar */}
      <div className="flex items-center justify-between px-8 py-2.5 border-b border-muted-slate/10 bg-aged-paper-dark min-h-[48px]">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-slate text-sm">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search stories..."
            className="input-field pl-9 text-sm w-80 focus:w-96 h-9 rounded-lg transition-all duration-300"
          />
        </div>
        <div className="flex items-center gap-2">
          {(['all', 'in_progress', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-200 hover:scale-105 active:scale-95 ${filter === f ? 'text-white border-[#C9A84C] shadow-sm' : 'text-muted-slate border-muted-slate/20 hover:border-muted-slate/40'}`}
              style={filter === f ? { backgroundColor: '#C9A84C', borderColor: '#C9A84C' } : {}}
            >
              {f === 'all' ? 'All' : f === 'in_progress' ? 'In Progress' : 'Completed'}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto p-8">
        {stories.length === 0 && !showNewStory ? (
          <div className="max-w-4xl mx-auto text-center py-20">
            <div className="paper-card p-12 max-w-md mx-auto">
              <svg className="w-16 h-16 mx-auto text-muted-slate/30 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h2 className="font-display text-2xl text-text-primary mb-2">No stories yet</h2>
              <p className="text-muted-slate mb-6">
                Create your first story and start building your web novel. Each story lives in its own folder
                with full portability — zip it, move it, back it up, share it.
              </p>
              <button onClick={() => setShowNewStory(true)} className="btn-primary">
                Create Your First Story
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto">
            {showNewStory && (
              <div className="paper-card p-6 mb-8 animate-slide-up">
                <h2 className="font-display text-xl text-lamp-gold mb-4">New Story</h2>
                <div className="flex gap-3 max-w-md">
                  <input
                    type="text"
                    value={newStoryTitle}
                    onChange={e => setNewStoryTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateStory()}
                    placeholder="Story title..."
                    className="input-field flex-1"
                    autoFocus
                  />
                  <button onClick={handleCreateStory} disabled={creating || !newStoryTitle.trim()} className="btn-primary">
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                  <button onClick={() => { setShowNewStory(false); setNewStoryTitle('') }} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {filteredStories.length === 0 ? (
              <div className="text-center py-12 text-muted-slate">
                <p className="text-sm">No stories match "{searchQuery}" with filter "{filter}"</p>
                <button onClick={() => { setSearchQuery(''); setFilter('all') }} className="btn-ghost text-xs mt-2">Clear filters</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {filteredStories.map(story => (
                  <StorySpine
                    key={story.id}
                    story={story}
                    onClick={() => handleOpenStory(story)}
                    onOpenFolder={e => handleOpenFolder(story.path, e)}
                    onDelete={e => handleDeleteRequest(story, e)}
                    onRename={e => handleRenameRequest(story, e)}
                    onBackup={e => handleBackupStory(story, e)}
                    onDuplicate={e => handleDuplicateStory(story, e)}
                    isDuplicating={duplicating === story.path}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {storyToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-night/70 backdrop-blur-sm" onClick={handleCancelDelete} />
          <div className="relative paper-card p-6 max-w-md w-full animate-slide-up">
            <h3 className="font-display text-xl text-wax-seal-red mb-2">Delete Story?</h3>
            <p className="text-muted-slate mb-1">
              Are you sure you want to delete <span className="font-semibold text-text-primary">"{storyToDelete.title}"</span>?
            </p>
            <p className="text-sm text-wax-seal-red/80 mb-4">
              This will permanently delete the story folder and all its data (chapters, characters, history). This cannot be undone.
            </p>
            <p className="font-mono text-xs bg-ink-night/50 px-2 py-1 rounded mb-4 break-all text-muted-slate/70">
              {storyToDelete.path}
            </p>
            {deleteError && (
              <div className="mb-4 p-3 rounded-lg text-sm bg-wax-seal-red/10 text-wax-seal-red border border-wax-seal-red/30">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={handleCancelDelete} disabled={deleting} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="btn-primary bg-wax-seal-red hover:bg-wax-seal-red/90 border-wax-seal-red disabled:opacity-50"
                style={{ backgroundColor: '#8C3B3B', borderColor: '#8C3B3B' }}
              >
                {deleting ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {storyToRename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-night/70 backdrop-blur-sm" onClick={handleCancelRename} />
          <div className="relative paper-card p-6 max-w-md w-full animate-slide-up">
            <h3 className="font-display text-xl text-lamp-gold mb-4">Rename Story</h3>
            <p className="text-sm text-muted-slate mb-3">
              New title for <span className="font-semibold">"{storyToRename.title}"</span>
            </p>
            <input
              type="text"
              value={renameTitle}
              onChange={e => setRenameTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleConfirmRename()
                if (e.key === 'Escape') handleCancelRename()
              }}
              placeholder="Story title..."
              className="input-field w-full mb-2"
              autoFocus
            />
            {renameError && (
              <div className="mb-4 p-3 rounded-lg text-sm bg-wax-seal-red/10 text-wax-seal-red border border-wax-seal-red/30">
                {renameError}
              </div>
            )}
            <p className="text-xs text-muted-slate/60 mb-4">Invalid characters &lt;&gt;:"/\\|?* will be removed.</p>
            <div className="flex justify-end gap-3">
              <button onClick={handleCancelRename} disabled={renaming} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleConfirmRename}
                disabled={renaming || !renameTitle.trim()}
                className="btn-primary disabled:opacity-50"
              >
                {renaming ? 'Renaming…' : 'Rename'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface StorySpineProps {
  story: StoryProject
  onClick: () => void
  onOpenFolder: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  onRename: (e: React.MouseEvent) => void
  onBackup: (e: React.MouseEvent) => void
  onDuplicate: (e: React.MouseEvent) => void
  isDuplicating?: boolean
}

function StorySpine({ story, onClick, onOpenFolder, onDelete, onRename, onBackup, onDuplicate, isDuplicating }: StorySpineProps) {
  const phaseCount = story.phasesCompleted?.length || 0
  const totalPhases = 5
  const [showMenu, setShowMenu] = useState(false)
  const status = phaseCount === 0 ? 'Just Started' : phaseCount === 5 ? 'Completed' : 'In Progress'
  const statusColor = phaseCount === 0 ? 'bg-muted-slate/20 text-muted-slate' : phaseCount === 5 ? 'bg-[#4CAF7D]/20 text-[#4CAF7D] border border-[#4CAF7D]/30' : 'bg-amber-500/20 text-amber-600 border border-amber-500/30'

  return (
    <div
      className={`group relative flex flex-col bg-aged-paper border border-muted-slate/15 rounded-xl p-5 hover:shadow-2xl transition-all duration-300 ease-out cursor-pointer hover:-translate-y-1.5 hover:border-lamp-gold/60 ${phaseCount === totalPhases ? 'complete' : ''}`}
      onClick={onClick}
    >
      {/* Overflow menu ⋮ top-right */}
      <button
        onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
        className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted-slate/15 text-muted-slate hover:text-text-primary transition-all duration-150 hover:scale-110 active:scale-95"
        aria-label="More actions"
      >
        ⋮
      </button>
      {showMenu && (
        <div
          className="absolute top-10 right-3 w-40 bg-aged-paper-dark border border-muted-slate/20 rounded-lg shadow-xl z-20 overflow-hidden animate-spring-pop"
          onClick={e => e.stopPropagation()}
        >
          <button onClick={(e) => { setShowMenu(false); onRename(e) }} className="w-full text-left px-3 py-2 text-xs hover:bg-muted-slate/15 flex items-center gap-2 text-text-primary transition-colors">✏ Rename</button>
          <button onClick={(e) => { setShowMenu(false); onDuplicate(e) }} className="w-full text-left px-3 py-2 text-xs hover:bg-muted-slate/15 flex items-center gap-2 text-text-primary transition-colors">{isDuplicating ? '⏳ Duplicating...' : '📋 Duplicate'}</button>
          <button onClick={(e) => { setShowMenu(false); onBackup(e) }} className="w-full text-left px-3 py-2 text-xs hover:bg-muted-slate/15 flex items-center gap-2 text-text-primary transition-colors">📦 Export ZIP</button>
          <button onClick={(e) => { setShowMenu(false); onDelete(e) }} className="w-full text-left px-3 py-2 text-xs hover:bg-muted-slate/15 flex items-center gap-2 text-wax-seal-red transition-colors">🗑 Delete</button>
        </div>
      )}

      <div className="w-full h-1 rounded-full mb-3 transition-all duration-300" style={{ background: phaseCount > 0 ? '#C9A84C' : 'rgba(107,122,153,0.2)', opacity: phaseCount ? Math.max(0.3, phaseCount / totalPhases) : 1 }} />

      <h3 className="font-display text-lg leading-tight break-words pr-6 group-hover:text-lamp-gold transition-colors duration-200" style={{ fontFamily: 'Cinzel, serif', color: '#C9A84C' }}>
        {story.title}
      </h3>

      {/* Phase progress strip B·S·W·C·Ch */}
      <div className="mt-3">
        <PhaseDots phasesCompleted={story.phasesCompleted as any} completedCount={phaseCount} size="sm" />
      </div>

      <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: '#6B7A99' }}>
        <span>📖 {story.wordCount ? story.wordCount.toLocaleString() : (story.chapterCount * 2500).toLocaleString()} words</span>
        <span>·</span>
        <span className="font-mono text-xs">{story.lastEdited || '—'}</span>
      </div>

      <div className="mt-2">
        <span className={`text-[10px] px-2 py-1 rounded-full font-medium transition-transform duration-200 inline-block group-hover:scale-105 ${statusColor}`}>{status}</span>
      </div>

      <button
        onClick={onClick}
        className="mt-4 w-full h-9 rounded-lg font-medium text-sm flex items-center justify-center gap-1 transition-all duration-150 btn-primary !py-0 hover:scale-[1.02] active:scale-[0.97]"
      >
        {isDuplicating ? 'Duplicating...' : 'Open →'}
      </button>

      <div className="flex items-center justify-center gap-1 mt-2 pt-2 border-t border-muted-slate/15">
        <button
          onClick={onOpenFolder}
          className="p-1.5 rounded hover:bg-white/5 transition-all duration-150 hover:scale-115 active:scale-95"
          style={{ color: '#6B7A99' }}
          title="Open folder"
          aria-label="Open story folder"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </button>
        <button
          onClick={onRename}
          className="p-1.5 rounded hover:bg-white/5 transition-all duration-150 hover:scale-115 active:scale-95"
          style={{ color: '#6B7A99' }}
          title="Rename story"
          aria-label="Rename story"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={onBackup}
          className="p-1.5 rounded hover:bg-white/5 transition-all duration-150 hover:scale-115 active:scale-95"
          style={{ color: '#6B7A99' }}
          title="Backup story as ZIP"
          aria-label="Backup story"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded hover:bg-white/5 transition-all duration-150 hover:scale-115 active:scale-95 text-wax-seal-red/70 hover:text-wax-seal-red"
          style={{ color: '#6B7A99' }}
          title="Delete story"
          aria-label="Delete story"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  )
}
