export interface Skill {
  id: string
  icon: string
  title: string
  description: string
  prompt: string
}

export const SKILLS: Skill[] = [
  {
    id: 'hook_generator',
    icon: '🎣',
    title: 'Hook Generator',
    description: '5 alternative opening lines for this chapter',
    prompt: 'Generate 5 alternative opening lines (hooks) for the current chapter. Each should be vivid, hook the reader in under 25 words, and vary between action, dialogue, mystery, and sensory openings. Number them 1-5.',
  },
  {
    id: 'cliffhanger_crafter',
    icon: '⚡',
    title: 'Cliffhanger Crafter',
    description: '3 endings that demand \'next chapter\'',
    prompt: 'Craft 3 alternative cliffhanger endings for this chapter. Each should be 1-2 sentences that create urgent curiosity to read the next chapter. Label them A, B, C.',
  },
  {
    id: 'dialogue_polish',
    icon: '💬',
    title: 'Dialogue Polish',
    description: 'Flag and fix out-of-voice dialogue lines',
    prompt: 'Review the last chapter draft and flag any dialogue lines that sound out-of-voice for the characters. For each flagged line, explain why it breaks voice and propose a revised version that matches the character voice fingerprint.',
  },
  {
    id: 'pacing_analyzer',
    icon: '📊',
    title: 'Pacing Analyzer',
    description: 'Scene-by-scene tension and pacing report',
    prompt: 'Analyze the current chapter or outline for pacing. Provide a scene-by-scene tension curve (1-10), flag slow or rushed sections, and suggest concrete pacing fixes.',
  },
  {
    id: 'chapter_title_seo',
    icon: '🏷',
    title: 'Chapter Title & SEO',
    description: '5 platform-optimized title options',
    prompt: 'Propose 5 platform-optimized chapter title options for the current chapter. Each should be under 60 characters, include a hook keyword, and be ranked by click-through potential. Explain each choice.',
  },
  {
    id: 'foreshadowing_tracker',
    icon: '🔮',
    title: 'Foreshadowing Tracker',
    description: 'Unpaid setups and new planted seeds',
    prompt: 'Scan the story so far for foreshadowing. List: 1) Unpaid setups (promises made but not paid off), 2) Seeds planted in this chapter that should pay off later, 3) Any dropped threads.',
  },
  {
    id: 'genre_trope_advisor',
    icon: '📚',
    title: 'Genre Trope Advisor',
    description: 'Missing reader-expected tropes for genre',
    prompt: 'Given the story genre and current phase, list reader-expected tropes that are missing or under-delivered. For each, suggest a subtle way to weave it in without cliché.',
  },
  {
    id: 'synopsis_writer',
    icon: '✍',
    title: 'Synopsis Writer',
    description: '100-150 word platform blurb',
    prompt: 'Write a 100-150 word platform-ready synopsis/blurb for the story so far. Make it hooky, spoiler-light, and optimized for webnovel platforms. Provide one main version and one alternative tone.',
  },
]

interface SkillsDrawerProps {
  isOpen: boolean
  onClose: () => void
  onRunSkill: (skill: Skill) => void
}

export function SkillsDrawer({ isOpen, onClose, onRunSkill }: SkillsDrawerProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="relative w-full bg-card border-t border-muted-slate/10 flex flex-col animate-slide-up"
        style={{
          height: '50vh',
          maxHeight: '400px',
          backgroundColor: '#1A1D26',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header 48px */}
        <div className="flex items-center justify-between px-5 h-12 border-b shrink-0" style={{ borderColor: 'rgba(107,122,153,0.12)', height: '48px' }}>
          <h3 className="font-display text-lg" style={{ fontFamily: 'Cinzel, serif', color: '#C9A84C' }}>
            ✨ Bonus Writing Skills
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 text-muted-slate hover:text-white transition-colors"
            style={{ color: '#6B7A99' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Grid 2 cols gap12 pad20 scrollable */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            {SKILLS.map((skill) => (
              <div
                key={skill.id}
                className="group p-3.5 rounded-[10px] flex flex-col justify-between hover:border transition-colors"
                style={{
                  backgroundColor: '#13161E',
                  border: `1px solid rgba(107,122,153,0.12)`,
                  padding: '14px',
                  borderRadius: '10px',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(201,168,76,0.4)'
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(107,122,153,0.12)'
                }}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[28px] leading-none">{skill.icon}</span>
                    <span className="font-bold text-sm" style={{ fontFamily: 'Inter, sans-serif', color: '#E8EAF0' }}>
                      {skill.title}
                    </span>
                  </div>
                  <p className="text-xs leading-snug" style={{ color: '#6B7A99', fontFamily: 'Inter, sans-serif' }}>
                    {skill.description}
                  </p>
                </div>
                <div className="flex justify-end mt-3">
                  <button
                    onClick={() => onRunSkill(skill)}
                    className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors"
                    style={{
                      backgroundColor: '#C9A84C',
                      color: '#0D0F14',
                      height: '28px',
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    Run →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
