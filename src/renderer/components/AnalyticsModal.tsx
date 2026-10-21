import { useEffect, useState } from 'react'

interface AnalyticsData {
  success: boolean
  totalWords: number
  totalChars: number
  chapterCount: number
  approvedCount: number
  avgWordsPerChapter: number
  perChapter: Array<{ number: number; title: string; words: number; chars: number; status: string }>
  totalTokens: number
  tokensByPhase: Record<string, number>
  costByModel: Record<string, number>
  totalCost: number
  logEntries: Array<{ phase: string; model: string; tokens: number }>
  error?: string
}

export function AnalyticsModal({ projectPath, onClose }: { projectPath: string; onClose: () => void }) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      try {
        // Prefer IPC handler, fallback to direct DB queries
        if ((window as any).electronAPI?.getAnalytics) {
          const result = await (window as any).electronAPI.getAnalytics(projectPath)
          if (result.success) setData(result)
          else setError(result.error || 'Failed to fetch analytics')
        } else {
          // Fallback: compute via DB queries directly
          const outline: any[] = await window.electronAPI.dbAll(projectPath, 'SELECT * FROM plot_outline ORDER BY chapter_number', [])
          const logs: any[] = await window.electronAPI.dbAll(projectPath, 'SELECT phase, model, tokens_used FROM generation_log', [])
          let totalWords = 0
          const perChapter = outline.map((o: any) => {
            const content = o.beat_summary || ''
            const words = content.split(/\s+/).filter(Boolean).length
            totalWords += words
            return { number: o.chapter_number, title: o.beat_summary?.slice(0, 40) || `Chapter ${o.chapter_number}`, words, chars: content.length, status: o.status }
          })
          const tokensByPhase: Record<string, number> = {}
          const costByModel: Record<string, number> = {}
          let totalTokens = 0
          for (const l of logs) {
            const tokens = Number(l.tokens_used || 0)
            totalTokens += tokens
            tokensByPhase[l.phase] = (tokensByPhase[l.phase] || 0) + tokens
            const price = l.model?.includes('claude') ? 0.015 : 0.003
            costByModel[l.model] = (costByModel[l.model] || 0) + (tokens / 1000) * price
          }
          const totalCost = Object.values(costByModel).reduce((a, b) => a + b, 0)
          setData({
            success: true,
            totalWords,
            totalChars: totalWords * 5,
            chapterCount: outline.length,
            approvedCount: outline.filter((o: any) => o.status === 'approved').length,
            avgWordsPerChapter: outline.length ? Math.round(totalWords / outline.length) : 0,
            perChapter,
            totalTokens,
            tokensByPhase,
            costByModel,
            totalCost,
            logEntries: logs.map((l: any) => ({ phase: l.phase, model: l.model, tokens: l.tokens_used })),
          })
        }
      } catch (e: any) {
        setError(e.message || 'Failed to load analytics')
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [projectPath])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-night/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative paper-card p-6 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl text-lamp-gold">📊 Story Analytics</h2>
          <button onClick={onClose} className="btn-ghost text-sm">✕ Close</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-lamp-gold/30 border-t-lamp-gold rounded-full animate-spin" />
            <span className="ml-3 text-muted-slate">Loading analytics...</span>
          </div>
        ) : error ? (
          <div className="p-4 bg-wax-seal-red/10 border border-wax-seal-red/30 rounded-lg text-wax-seal-red">{error}</div>
        ) : data ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-2">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-ink-night/50 border border-muted-slate/10 rounded-lg p-4 text-center">
                <div className="text-2xl font-display text-lamp-gold">{data.totalWords.toLocaleString()}</div>
                <div className="text-xs text-muted-slate uppercase tracking-wide">Total Words</div>
              </div>
              <div className="bg-ink-night/50 border border-muted-slate/10 rounded-lg p-4 text-center">
                <div className="text-2xl font-display text-lamp-gold">{data.chapterCount}</div>
                <div className="text-xs text-muted-slate uppercase tracking-wide">Chapters</div>
                <div className="text-[11px] text-jade-ink">{data.approvedCount} approved</div>
              </div>
              <div className="bg-ink-night/50 border border-muted-slate/10 rounded-lg p-4 text-center">
                <div className="text-2xl font-display text-lamp-gold">{data.avgWordsPerChapter.toLocaleString()}</div>
                <div className="text-xs text-muted-slate uppercase tracking-wide">Avg / Chapter</div>
              </div>
              <div className="bg-ink-night/50 border border-muted-slate/10 rounded-lg p-4 text-center">
                <div className="text-2xl font-display text-lamp-gold">{data.totalTokens.toLocaleString()}</div>
                <div className="text-xs text-muted-slate uppercase tracking-wide">Tokens Used</div>
                <div className="text-[11px] text-muted-slate/60">~${data.totalCost.toFixed(4)} est.</div>
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="paper-card p-4">
              <h3 className="font-display text-lg text-text-primary mb-3">Token Usage by Phase</h3>
              {Object.keys(data.tokensByPhase).length === 0 ? (
                <p className="text-sm text-muted-slate/60">No generation logs yet. Chat with the AI to generate content.</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(data.tokensByPhase).map(([phase, tokens]) => (
                    <div key={phase} className="flex items-center justify-between text-sm">
                      <span className="capitalize text-muted-slate">{phase}</span>
                      <span className="font-mono text-text-primary">{tokens.toLocaleString()} tokens</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-muted-slate/10">
                <h4 className="text-sm font-medium text-muted-slate mb-2">Cost by Model</h4>
                {Object.keys(data.costByModel).length === 0 ? (
                  <p className="text-xs text-muted-slate/60">No cost data yet.</p>
                ) : (
                  Object.entries(data.costByModel).map(([model, cost]) => (
                    <div key={model} className="flex items-center justify-between text-xs font-mono">
                      <span className="text-muted-slate truncate mr-2">{model}</span>
                      <span className="text-jade-ink">${cost.toFixed(4)}</span>
                    </div>
                  ))
                )}
                <div className="flex justify-between mt-2 pt-2 border-t border-muted-slate/10 font-bold text-sm">
                  <span>Total Estimated Cost</span>
                  <span className="text-lamp-gold">${data.totalCost.toFixed(4)}</span>
                </div>
              </div>
            </div>

            {/* Per-Chapter Breakdown */}
            <div className="paper-card p-4">
              <h3 className="font-display text-lg text-text-primary mb-3">Per-Chapter Word Count</h3>
              {data.perChapter.length === 0 ? (
                <p className="text-sm text-muted-slate/60">No chapters yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-slate/60 text-xs uppercase tracking-wide">
                        <th className="pb-2">Ch #</th>
                        <th className="pb-2">Title</th>
                        <th className="pb-2 text-right">Words</th>
                        <th className="pb-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.perChapter.map(ch => (
                        <tr key={ch.number} className="border-t border-muted-slate/10">
                          <td className="py-2 font-mono text-lamp-gold">Ch. {ch.number}</td>
                          <td className="py-2 text-text-primary/80 max-w-[200px] truncate">{ch.title}</td>
                          <td className="py-2 text-right font-mono">{ch.words.toLocaleString()}</td>
                          <td className="py-2 text-center"><span className={`text-[10px] px-1.5 py-0.5 rounded ${ch.status === 'approved' ? 'bg-jade-ink/20 text-jade-ink' : ch.status === 'drafted' ? 'bg-lamp-gold/20 text-lamp-gold' : 'bg-muted-slate/20 text-muted-slate'}`}>{ch.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-slate/50 text-center">
              Cost estimated at blended rates: $0.003/1K for free/cheap models, $0.015/1K for Claude/GPT-4 class. Tokens from generation_log.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
