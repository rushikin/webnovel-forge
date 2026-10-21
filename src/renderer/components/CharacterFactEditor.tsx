import { useState, useEffect } from 'react'
import type { CharacterSheet } from '../types'

interface Props {
  character: CharacterSheet
  projectPath: string
  onUpdated?: (updated: CharacterSheet) => void
  onClose?: () => void
}

export function CharacterFactEditor({ character, projectPath, onUpdated, onClose }: Props) {
  const [lockedFacts, setLockedFacts] = useState<string[]>(() => {
    const deduped: string[] = []
    const seen = new Set<string>()
    for (const f of character.locked_facts || []) {
      const t = f.trim()
      const k = t.toLowerCase()
      if (t && !seen.has(k)) { seen.add(k); deduped.push(t) }
    }
    return deduped
  })
  const [openFacts, setOpenFacts] = useState<string[]>(() => {
    const locked = (character.locked_facts || []).map(f => f.trim().toLowerCase())
    const lockedSet = new Set(locked)
    const all = character.current_state ? character.current_state.split('\n').map(s => s.trim()).filter(Boolean) : []
    const deduped: string[] = []
    const seen = new Set<string>()
    for (const f of all) {
      const k = f.toLowerCase()
      if (!lockedSet.has(k) && !seen.has(k) && f) { seen.add(k); deduped.push(f) }
    }
    return deduped
  })
  const [newFact, setNewFact] = useState('')
  const [saving, setSaving] = useState(false)
  const [isLockedMode, setIsLockedMode] = useState(true)

  useEffect(() => {
    const dedupedLocked: string[] = []
    const seenL = new Set<string>()
    for (const f of character.locked_facts || []) {
      const t = f.trim()
      const k = t.toLowerCase()
      if (t && !seenL.has(k)) { seenL.add(k); dedupedLocked.push(t) }
    }
    setLockedFacts(dedupedLocked)
    const lockedSet = new Set(dedupedLocked.map(f => f.toLowerCase()))
    const all = character.current_state ? character.current_state.split('\n').map(s => s.trim()).filter(Boolean) : []
    const dedupedOpen: string[] = []
    const seenO = new Set<string>()
    for (const f of all) {
      const k = f.toLowerCase()
      if (!lockedSet.has(k) && !seenO.has(k) && f) { seenO.add(k); dedupedOpen.push(f) }
    }
    setOpenFacts(dedupedOpen)
  }, [character])

  const handleAddFact = async () => {
    if (!newFact.trim()) return
    const fact = newFact.trim()
    if (isLockedMode) {
      const updated = [...lockedFacts, fact]
      setLockedFacts(updated)
      setNewFact('')
      await persist(updated, openFacts)
    } else {
      const updated = [...openFacts, fact]
      setOpenFacts(updated)
      setNewFact('')
      await persist(lockedFacts, updated)
    }
  }

  const handleRemove = async (idx: number, locked: boolean) => {
    if (locked) {
      const updated = lockedFacts.filter((_, i) => i !== idx)
      setLockedFacts(updated)
      await persist(updated, openFacts)
    } else {
      const updated = openFacts.filter((_, i) => i !== idx)
      setOpenFacts(updated)
      await persist(lockedFacts, updated)
    }
  }

  const handleToggleLock = async (idx: number, currentlyLocked: boolean) => {
    if (currentlyLocked) {
      const fact = lockedFacts[idx]
      const newLocked = lockedFacts.filter((_, i) => i !== idx)
      const newOpen = [...openFacts, fact]
      setLockedFacts(newLocked)
      setOpenFacts(newOpen)
      await persist(newLocked, newOpen)
    } else {
      const fact = openFacts[idx]
      const newOpen = openFacts.filter((_, i) => i !== idx)
      const newLocked = [...lockedFacts, fact]
      setOpenFacts(newOpen)
      setLockedFacts(newLocked)
      await persist(newLocked, newOpen)
    }
  }

  const persist = async (locked: string[], open: string[]) => {
    setSaving(true)
    try {
      const updated: CharacterSheet = {
        ...character,
        locked_facts: locked,
        current_state: [...locked, ...open].join('\n'),
      }
      const raw = await window.electronAPI.pipelineReadFile(projectPath, 'characters.json')
      if (raw) {
        const arr = JSON.parse(raw)
        const idx = arr.findIndex((c: any) => c.id === character.id)
        if (idx >= 0) {
          arr[idx] = updated
          await window.electronAPI.saveProjectFile(projectPath, 'characters.json', JSON.stringify(arr, null, 2))
          await window.electronAPI.dbRun(projectPath, 'UPDATE characters SET sheet_json = ? WHERE id = ?', [JSON.stringify(updated), character.id])
        }
      } else {
        // Fallback: create file with single character
        await window.electronAPI.saveProjectFile(projectPath, 'characters.json', JSON.stringify([updated], null, 2))
      }
      onUpdated?.(updated)
    } catch (e) {
      console.error('Failed to persist facts', e)
    } finally {
      setSaving(false)
    }
  }

  // Modal wrapper if onClose provided, otherwise inline card
  const content = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-lg text-lamp-gold flex items-center gap-2">
          {character.name} — <span className="text-sm font-normal text-muted-slate">Character Sheet</span>
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-slate/60">{saving ? 'Saving...' : `${lockedFacts.length} 🔒 • ${openFacts.length} 🟢`}</span>
          {onClose && (
            <button onClick={onClose} className="btn-ghost text-xs px-2 py-1">✕ Close</button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-slate">Role:</span>
        <span className="text-xs bg-muted-slate/20 px-2 py-0.5 rounded">{character.role}</span>
        <span className="text-xs text-muted-slate/60 truncate max-w-[200px]">{character.voice_fingerprint}</span>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 text-xs">
        <button
          onClick={() => setIsLockedMode(true)}
          className={`flex-1 px-3 py-1.5 rounded-full border font-medium transition-colors ${isLockedMode ? 'bg-wax-seal-red/20 text-wax-seal-red border-wax-seal-red/30' : 'bg-muted-slate/10 text-muted-slate border-transparent'}`}
        >
          🔒 Locked Facts (canon)
        </button>
        <button
          onClick={() => setIsLockedMode(false)}
          className={`flex-1 px-3 py-1.5 rounded-full border font-medium transition-colors ${!isLockedMode ? 'bg-jade-ink/20 text-jade-ink border-jade-ink/30' : 'bg-muted-slate/10 text-muted-slate border-transparent'}`}
        >
          🟢 Open Facts (mutable)
        </button>
      </div>

      {/* Locked facts pills */}
      <div>
        <div className="text-xs font-bold text-wax-seal-red mb-2 flex items-center gap-1">🔒 Locked — Permanent canon <span className="font-normal text-muted-slate/60">({lockedFacts.length})</span></div>
        <div className="flex flex-wrap gap-2 min-h-[40px] p-2 bg-wax-seal-red/5 border border-wax-seal-red/10 rounded-lg">
          {lockedFacts.length === 0 ? (
            <p className="text-xs text-muted-slate/50 w-full text-center py-2">No locked facts yet. Add a fact as 🔒 to make it permanent.</p>
          ) : (
            lockedFacts.map((f, i) => (
              <span
                key={`locked-${i}`}
                className="inline-flex items-center gap-1.5 bg-wax-seal-red/10 border border-wax-seal-red/30 text-wax-seal-red text-xs px-3 py-1 rounded-full pill-toggle"
              >
                <span className="max-w-[160px] truncate">{f}</span>
                <button
                  onClick={() => handleToggleLock(i, true)}
                  className="ml-1 bg-jade-ink/20 text-jade-ink text-[10px] px-1.5 py-0.5 rounded-full hover:bg-jade-ink/30"
                  title="Toggle to 🟢 Open"
                >
                  → 🟢
                </button>
                <button onClick={() => handleRemove(i, true)} className="text-muted-slate hover:text-wax-seal-red ml-1">✕</button>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Open facts pills */}
      <div>
        <div className="text-xs font-bold text-jade-ink mb-2 flex items-center gap-1">🟢 Open — Evolving state <span className="font-normal text-muted-slate/60">({openFacts.length})</span></div>
        <div className="flex flex-wrap gap-2 min-h-[40px] p-2 bg-jade-ink/5 border border-jade-ink/10 rounded-lg">
          {openFacts.length === 0 ? (
            <p className="text-xs text-muted-slate/50 w-full text-center py-2">No open facts. Current mood, injuries, location go here.</p>
          ) : (
            openFacts.map((f, i) => (
              <span
                key={`open-${i}`}
                className="inline-flex items-center gap-1.5 bg-jade-ink/10 border border-jade-ink/30 text-jade-ink text-xs px-3 py-1 rounded-full pill-toggle"
              >
                <span className="max-w-[160px] truncate">{f}</span>
                <button
                  onClick={() => handleToggleLock(i, false)}
                  className="ml-1 bg-wax-seal-red/20 text-wax-seal-red text-[10px] px-1.5 py-0.5 rounded-full hover:bg-wax-seal-red/30"
                  title="Toggle to 🔒 Locked"
                >
                  → 🔒
                </button>
                <button onClick={() => handleRemove(i, false)} className="text-muted-slate hover:text-wax-seal-red ml-1">✕</button>
              </span>
            ))
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={newFact}
          onChange={e => setNewFact(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddFact()}
          placeholder={isLockedMode ? 'Add locked fact (e.g. sister died in ch 2, left-handed)...' : 'Add open fact (e.g. Currently anxious in capital)...'}
          className="input-field flex-1 text-xs"
        />
        <button onClick={handleAddFact} disabled={!newFact.trim() || saving} className="btn-primary text-xs px-4 disabled:opacity-30">
          Add {isLockedMode ? '🔒' : '🟢'}
        </button>
      </div>
      <p className="text-[10px] text-muted-slate/50">
        🔒 Locked facts are injected into every chapter prompt's <code>lockedFactsPrompt</code> and cannot be hallucinated against. 🟢 Open facts are mutable and track evolving state.
      </p>
    </div>
  )

  if (onClose) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-ink-night/70 backdrop-blur-sm" onClick={onClose} />
        <div className="relative paper-card p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar animate-slide-up">
          {content}
        </div>
      </div>
    )
  }

  return <div className="paper-card p-4">{content}</div>
}
