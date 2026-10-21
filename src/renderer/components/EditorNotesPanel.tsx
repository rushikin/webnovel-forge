import { useState } from 'react'

interface EditorNotesPanelProps {
  issues: string[]
  bannedPhrasesFound: Array<{ phrase: string; count: number }>
  summary: string
  chapterNumber: number
  onAccept?: () => void
  onRegenerate?: () => void
  onAddToGlobalBannedList?: (phrases: string[]) => void
}

export function EditorNotesPanel({
  issues,
  bannedPhrasesFound,
  summary,
  chapterNumber,
  onAccept,
  onRegenerate,
  onAddToGlobalBannedList,
}: EditorNotesPanelProps) {
  const [activeTab, setActiveTab] = useState<'issues' | 'banned-phrases' | 'summary'>('issues')
  const [selectedPhrases, setSelectedPhrases] = useState<Set<string>>(new Set())

  const handlePhraseSelect = (phrase: string) => {
    const newSelected = new Set(selectedPhrases)
    if (newSelected.has(phrase)) {
      newSelected.delete(phrase)
    } else {
      newSelected.add(phrase)
    }
    setSelectedPhrases(newSelected)
  }

  const handleAddToGlobalBannedList = () => {
    if (selectedPhrases.size > 0) {
      onAddToGlobalBannedList?.(Array.from(selectedPhrases))
      setSelectedPhrases(new Set())
    }
  }

  return (
    <div className="panel-narrow bg-ink-night/30 border-l border-muted-slate/10 p-6 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg text-lamp-gold">Continuity Editor Notes</h3>
        <div className="text-xs text-muted-slate/60 bg-ink-night/50 px-2 py-1 rounded">
          Chapter {chapterNumber}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-4 bg-ink-night/50 rounded-lg p-1">
        {[
          { id: 'issues', label: 'Issues', count: issues.length },
          { id: 'banned-phrases', label: 'Banned Phrases', count: bannedPhrasesFound.length },
          { id: 'summary', label: 'Summary', count: 0 },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-lamp-gold/20 text-lamp-gold'
                : 'text-muted-slate hover:text-text-primary/80 hover:bg-muted-slate/10'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 bg-wax-seal-red/20 text-wax-seal-red px-1.5 py-0.5 rounded text-xs font-bold">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === 'issues' && (
          <div className="space-y-3">
            {issues.length > 0 ? (
              issues.map((issue, idx) => (
                <div key={idx} className="p-3 bg-wax-seal-red/10 border border-wax-seal-red/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-wax-seal-red font-bold text-sm">⚠</span>
                    <span className="text-wax-seal-red text-sm font-medium">Issue</span>
                  </div>
                  <p className="text-text-primary/80 text-sm leading-relaxed">{issue}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-jade-ink/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-jade-ink text-xl">✓</span>
                </div>
                <p className="text-muted-slate text-sm">No continuity issues found.</p>
                <p className="text-muted-slate/60 text-xs mt-1">This chapter looks good!</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'banned-phrases' && (
          <div className="space-y-3">
            {bannedPhrasesFound.length > 0 ? (
              bannedPhrasesFound.map((item, idx) => {
                const isSelected = selectedPhrases.has(item.phrase)
                return (
                  <div
                    key={idx}
                    onClick={() => handlePhraseSelect(item.phrase)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-lamp-gold/20 border-lamp-gold/40'
                        : 'bg-muted-slate/10 border-muted-slate/20 hover:bg-muted-slate/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-text-primary/80 font-mono text-sm font-medium">
                        "{item.phrase}"
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-slate/60 text-xs">
                          {item.count}×
                        </span>
                        <div className={`w-4 h-4 rounded border-2 ${
                          isSelected
                            ? 'bg-lamp-gold border-lamp-gold'
                            : 'border-muted-slate/40'
                        }`}>
                          {isSelected && (
                            <div className="w-2 h-2 bg-ink-night rounded-sm ml-[2px] mt-[2px]" />
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-muted-slate/70 text-xs">
                      Frequency: {item.count} occurrence{ item.count !== 1 ? 's' : '' }
                    </p>
                  </div>
                )
              })
            ) : (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-muted-slate/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-muted-slate text-xl">⦻</span>
                </div>
                <p className="text-muted-slate text-sm">No banned phrases detected.</p>
                <p className="text-muted-slate/60 text-xs mt-1">Clean language usage!</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="space-y-3">
            {summary ? (
              <div className="p-4 bg-jade-ink/10 border border-jade-ink/30 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-jade-ink font-bold">📋</span>
                  <span className="text-jade-ink font-medium">Editor Summary</span>
                </div>
                <p className="text-text-primary/80 text-sm leading-relaxed whitespace-pre-wrap">
                  {summary}
                </p>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-muted-slate/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-muted-slate text-xl">?</span>
                </div>
                <p className="text-muted-slate text-sm">No summary available.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 mt-4 pt-4 border-t border-muted-slate/10">
        <button
          onClick={onRegenerate}
          className="flex-1 btn-secondary text-sm py-2.5"
          disabled={issues.length === 0 && bannedPhrasesFound.length === 0}
        >
          Regenerate Chapter
        </button>
        <button
          onClick={handleAddToGlobalBannedList}
          className="btn-primary text-sm py-2.5"
          disabled={selectedPhrases.size === 0}
        >
          Add {selectedPhrases.size > 0 ? `(${selectedPhrases.size}) ` : ''}to Global Banned List
        </button>
        <button
          onClick={onAccept}
          className="btn-ghost text-sm py-2.5 text-jade-ink"
          disabled={issues.length === 0 && bannedPhrasesFound.length === 0}
        >
          Accept as-is ✓
        </button>
      </div>
    </div>
  )
}