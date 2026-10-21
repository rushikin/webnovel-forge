import React from 'react'

const PHASES = [
  { id: 'brainstorm', label: 'Brainstorm', short: 'B' },
  { id: 'structure', label: 'Structure', short: 'S' },
  { id: 'world_plot', label: 'World & Plot', short: 'W' },
  { id: 'characters', label: 'Characters', short: 'C' },
  { id: 'chapters', label: 'Chapters', short: 'Ch' },
] as const

interface PhaseSealRibbonProps {
  phases?: typeof PHASES
  currentPhase?: string
  completedPhases?: string[]
}

export function PhaseSealRibbon({ 
  phases = PHASES, 
  currentPhase = 'brainstorm',
  completedPhases = [] 
}: PhaseSealRibbonProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ink-night/50 border border-muted-slate/10">
      {phases.map((phase, index) => {
        const isComplete = completedPhases.includes(phase.id)
        const isCurrent = currentPhase === phase.id
        const isLocked = index > 0 && !completedPhases.includes(phases[index - 1].id)

        return (
          <React.Fragment key={phase.id}>
            <button
              className={`phase-seal flex items-center justify-center ${
                isComplete ? 'complete' : isCurrent ? 'in-progress animate-gold-glow' : 'locked'
              } ${isCurrent ? 'ring-2 ring-lamp-gold ring-offset-2 ring-offset-ink-night animate-gold-glow' : ''}`}
              style={{ transition: 'all 0.15s ease' }}
              disabled={isLocked}
              title={phase.label}
              aria-label={phase.label}
            >
              {isComplete ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <span className="font-display text-[10px] font-bold">{phase.short}</span>
              )}
            </button>
            {index < phases.length - 1 && (
              <div 
                className={`w-8 h-0.5 mx-1 transition-colors duration-300 ${
                  completedPhases.includes(phases[index + 1].id) ? 'bg-jade-ink' : 'bg-muted-slate/20'
                }`} 
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}