import React from 'react'

interface HighlightedDraftProps {
  content: string
  bannedPhrases: Array<{ phrase: string; count: number }>
}

export function HighlightedDraft({ content, bannedPhrases }: HighlightedDraftProps) {
  if (!bannedPhrases || bannedPhrases.length === 0 || !content) {
    return <div className="whitespace-pre-wrap leading-relaxed text-text-primary">{content}</div>
  }

  // Build a case-insensitive regex from all phrases, sorted longest first to prefer longer matches
  const sorted = [...bannedPhrases].sort((a, b) => b.phrase.length - a.phrase.length)
  const escaped = sorted.map(p => p.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (escaped.length === 0) {
    return <div className="whitespace-pre-wrap leading-relaxed text-text-primary">{content}</div>
  }

  const pattern = `(${escaped.join('|')})`
  const regex = new RegExp(pattern, 'gi')
  const parts = content.split(regex)

  // For quick lookup of phrase severity: locked phrases red, others yellow
  // We treat all as banned -> yellow with red text; could differentiate via count
  return (
    <div className="whitespace-pre-wrap leading-relaxed text-text-primary">
      {parts.map((part, idx) => {
        const match = sorted.find(p => p.phrase.toLowerCase() === part.toLowerCase())
        if (match) {
          const isFrequent = match.count > 2
          return (
            <span
              key={idx}
              className={`px-0.5 rounded border ${isFrequent ? 'bg-wax-seal-red/20 border-wax-seal-red/40 text-wax-seal-red' : 'bg-yellow-200 border-yellow-400 text-wax-seal-red'} font-medium`}
              title={`Banned phrase: "${match.phrase}" — ${match.count}× occurrences`}
            >
              {part}
            </span>
          )
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>
      })}
    </div>
  )
}
