import { useState } from 'react'

interface BannedPhrasesBadgeProps {
  bannedPhrasesFound: Array<{ phrase: string; count: number }>
  onAddToGlobalList: (phrase: string) => void
}

export function BannedPhrasesBadge({ bannedPhrasesFound, onAddToGlobalList }: BannedPhrasesBadgeProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [showDetails, setShowDetails] = useState(false)

  if (!bannedPhrasesFound || bannedPhrasesFound.length === 0) return null

  const totalMatches = bannedPhrasesFound.reduce((sum, item) => sum + item.count, 0)

  return (
    <div className="fixed top-20 right-4 z-40 animate-slide-in">
      <div className={`p-3 rounded-lg shadow-lg border-l-4 border-wax-seal-red bg-wax-seal-red/10 backdrop-blur-sm ${
        isVisible ? 'translate-x-0' : 'translate-x-96'
      } transition-transform duration-300`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-wax-seal-red font-bold text-lg">⦻</span>
            <span className="text-wax-seal-red font-semibold">Banned Phrases Detected</span>
            <span className="bg-wax-seal-red/20 text-wax-seal-red px-2 py-0.5 rounded text-xs font-bold">
              {totalMatches} matches
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-muted-slate hover:text-wax-seal-red transition-colors"
              title="Toggle details"
            >
              {showDetails ? '👁️' : '📋'}
            </button>
            <button
              onClick={() => setIsVisible(false)}
              className="text-muted-slate hover:text-wax-seal-red transition-colors"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>

        {showDetails && (
          <div className="mt-3 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
            <p className="text-xs text-muted-slate mb-2">Select phrases to add to global banned list:</p>
            {bannedPhrasesFound.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 bg-muted-slate/10 rounded border border-muted-slate/20 hover:bg-muted-slate/20 transition-colors cursor-pointer"
                onClick={() => onAddToGlobalList(item.phrase)}
              >
                <div className="flex-1">
                  <span className="text-wax-seal-red font-mono text-sm">
                    "{item.phrase}"
                  </span>
                  <p className="text-xs text-muted-slate mt-1">
                    {item.count} occurrence{item.count !== 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onAddToGlobalList(item.phrase)
                  }}
                  className="text-jade-ink hover:text-jade-ink/80 ml-2 text-xs bg-jade-ink/10 px-2 py-1 rounded transition-colors"
                >
                  Add to Global
                </button>
              </div>
            ))}
          </div>
        )}

        {!showDetails && (
          <p className="text-xs text-muted-slate mt-2">
            Click to view details and add to global banned list.
          </p>
        )}
      </div>
    </div>
  )
}