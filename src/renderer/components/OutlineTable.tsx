import { useState } from 'react'

interface OutlineBeat {
  chapter?: number
  chapter_number?: number
  beat_summary: string
  pov_character?: string
  pov_character_id?: string
  characters_present: string[]
  must_include: string[]
  status: string
}

interface OutlineTableProps {
  outline: OutlineBeat[]
  projectPath: string
  onOutlineUpdated?: (newOutline: OutlineBeat[]) => void
  storyData?: any
}

export function OutlineTable({ outline, projectPath, onOutlineUpdated }: OutlineTableProps) {
  const [batchSize] = useState(20)
  const [currentBatch, setCurrentBatch] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalBatches = Math.max(1, Math.ceil(outline.length / batchSize))
  const startIdx = currentBatch * batchSize
  const batch = outline.slice(startIdx, startIdx + batchSize)
  const nextChapterNumber = outline.length + 1

  const handleGenerateNextBatch = async () => {
    setGenerating(true)
    setError(null)
    try {
      // Use chatHistory empty or with context for batch generation
      const chatHistory: any[] = []
      // Try dedicated batch handler, fallback to plotOutline
      let result: any = null
      if ((window as any).electronAPI?.generateOutlineBatch) {
        result = await (window as any).electronAPI.generateOutlineBatch(projectPath, chatHistory, batchSize, nextChapterNumber)
      } else {
        result = await window.electronAPI.pipelinePlotOutline(projectPath, [{ role: 'user', content: `Generate next batch chapters ${nextChapterNumber}-${nextChapterNumber + batchSize - 1}` } as any])
      }

      if (result?.success) {
        const newBeats: OutlineBeat[] = result.batch || []
        // If batch not structured, try to parse content
        let parsed: OutlineBeat[] = newBeats
        if (parsed.length === 0 && result.content) {
          try {
            const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/)
            const jsonStr = jsonMatch ? jsonMatch[1] : result.content
            const maybe = JSON.parse(jsonStr)
            if (Array.isArray(maybe)) parsed = maybe
          } catch {}
        }
        if (parsed.length > 0) {
          const merged = [...outline, ...parsed]
          onOutlineUpdated?.(merged)
          setCurrentBatch(totalBatches) // jump to new batch
        } else {
          setError('Generated batch was empty, try again with more context.')
        }
      } else {
        setError(result?.error || 'Failed to generate next batch')
      }
    } catch (e: any) {
      setError(e.message || 'Batch generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="paper-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-lg text-lamp-gold">Outline — Batch {currentBatch + 1} of {totalBatches} </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentBatch(Math.max(0, currentBatch - 1))}
            disabled={currentBatch === 0}
            className="btn-ghost text-xs px-2 py-1 disabled:opacity-30"
          >
            ← Prev 20
          </button>
          <span className="text-xs font-mono text-muted-slate">
            Ch {startIdx + 1}–{Math.min(startIdx + batchSize, outline.length) || startIdx} / {outline.length}
          </span>
          <button
            onClick={() => setCurrentBatch(Math.min(totalBatches - 1, currentBatch + 1))}
            disabled={currentBatch >= totalBatches - 1}
            className="btn-ghost text-xs px-2 py-1 disabled:opacity-30"
          >
            Next 20 →
          </button>
        </div>
      </div>

      {outline.length === 0 ? (
        <div className="text-center py-8 text-muted-slate/60 text-sm">
          <p>No outline yet. Use the chat on the left to generate your first 20 chapters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-ink-night/5 text-left text-xs uppercase tracking-wide text-muted-slate">
                <th className="px-2 py-2 w-16">Ch #</th>
                <th className="px-2 py-2 w-28">POV</th>
                <th className="px-2 py-2">Beat Summary</th>
                <th className="px-2 py-2 w-40">Must Include</th>
                <th className="px-2 py-2 w-24 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {batch.map((beat: any, idx: number) => {
                const chNum = beat.chapter ?? beat.chapter_number ?? startIdx + idx + 1
                const pov = beat.pov_character || beat.pov_character_id || '—'
                const must = Array.isArray(beat.must_include) ? beat.must_include.join(', ') : beat.must_include || '—'
                const chars = Array.isArray(beat.characters_present) ? beat.characters_present.join(', ') : ''
                return (
                  <tr key={chNum} className="border-t border-muted-slate/10 hover:bg-aged-paper/10">
                    <td className="px-2 py-2 font-mono text-lamp-gold">Ch. {chNum}</td>
                    <td className="px-2 py-2 text-text-primary/80 text-xs">{pov}{chars ? <span className="block text-[10px] text-muted-slate/60 truncate max-w-[100px]">{chars}</span> : null}</td>
                    <td className="px-2 py-2 text-text-primary/80 text-xs leading-snug max-w-[300px]">{beat.beat_summary || beat.summary || '—'}</td>
                    <td className="px-2 py-2 text-muted-slate text-xs max-w-[150px] truncate">{must || '—'}</td>
                    <td className="px-2 py-2 text-center">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${beat.status === 'approved' ? 'bg-jade-ink/20 text-jade-ink' : beat.status === 'drafted' ? 'bg-lamp-gold/20 text-lamp-gold' : beat.status === 'not_written' ? 'bg-muted-slate/20 text-muted-slate' : 'bg-muted-slate/20 text-muted-slate'}`}>
                        {beat.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-muted-slate/60">
          Outlines are generated in batches of 20 to keep beats specific. Each batch uses world bible + prior beats as context.
        </p>
        <button
          onClick={handleGenerateNextBatch}
          disabled={generating}
          className="btn-primary text-sm px-4 py-2 whitespace-nowrap disabled:opacity-50"
          title={`Generate chapters ${nextChapterNumber}–${nextChapterNumber + batchSize - 1}`}
        >
          {generating ? 'Generating…' : `+ Generate Next 20 Chapters (Ch ${nextChapterNumber}–${nextChapterNumber + batchSize - 1})`}
        </button>
      </div>
      {error && <div className="mt-3 p-2 bg-wax-seal-red/10 text-wax-seal-red border border-wax-seal-red/30 rounded text-xs">{error}</div>}
    </div>
  )
}
