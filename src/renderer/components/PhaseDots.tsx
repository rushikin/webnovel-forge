import React from 'react'
import type { Phase } from '../types'

const PHASES: Array<{ id: Phase; label: string; short: string }> = [
  { id: 'brainstorm', label: 'Brainstorm', short: 'B' },
  { id: 'structure', label: 'Structure', short: 'S' },
  { id: 'world_plot', label: 'World & Plot', short: 'W' },
  { id: 'characters', label: 'Characters', short: 'C' },
  { id: 'chapters', label: 'Chapters', short: 'Ch' },
]

interface PhaseDotsProps {
  phasesCompleted?: Phase[]
  completedCount?: number
  size?: 'sm' | 'md'
}

export function PhaseDots({ phasesCompleted, completedCount, size = 'sm' }: PhaseDotsProps) {
  const completed = phasesCompleted ? phasesCompleted.length : completedCount || 0
  const completedSet = new Set(phasesCompleted || PHASES.slice(0, completed).map(p => p.id))

  return (
    <div className="flex items-center gap-1.5">
      {PHASES.map((phase, idx) => {
        const isCompleted = completedSet.has(phase.id) || idx < completed
        const isCurrent = !isCompleted && idx === completed

        return (
          <React.Fragment key={phase.id}>
            <div
              className={`flex items-center justify-center rounded-full border text-[9px] font-bold font-mono transition-all ${
                isCompleted
                  ? 'bg-[#C9A84C] border-[#C9A84C] text-white'
                  : isCurrent
                  ? 'border-[#C9A84C] text-[#C9A84C] bg-[#C9A84C]/10 animate-pulse'
                  : 'bg-muted-slate/10 border-muted-slate/20 text-muted-slate/60'
              }`}
              style={{
                width: size === 'sm' ? '18px' : '22px',
                height: size === 'sm' ? '18px' : '22px',
                boxShadow: isCurrent ? '0 0 8px rgba(201,168,76,0.4)' : undefined,
              }}
              title={`${phase.label}: ${isCompleted ? 'completed' : isCurrent ? 'in progress' : 'not started'}`}
            >
              {isCompleted ? '✓' : phase.short}
            </div>
            {idx < PHASES.length - 1 && (
              <span className="text-[8px] text-muted-slate/30" style={{ color: 'rgba(107,122,153,0.3)' }}>
                ·
              </span>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
