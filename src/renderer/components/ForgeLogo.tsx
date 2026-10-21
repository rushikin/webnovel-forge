import React from 'react'

interface ForgeLogoProps {
  size?: number | string
  className?: string
  showText?: boolean
  subtitle?: string
}

/**
 * Unique bespoke vector logo for WebNovel Forge.
 * Symbolism:
 * - The Hexagonal Obsidian Monolith (Structured World Bible & Facts)
 * - The Anvil of Narrative Craft (The Forge)
 * - The Radiant Celestial Stylus / Quill (Authorial Voice & Burstiness)
 * - Interconnected Graph Nodes (Knowledge Network & Obsidian Graph View)
 */
export const ForgeLogo: React.FC<ForgeLogoProps> = ({
  size = 32,
  className = '',
  showText = false,
  subtitle,
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none group cursor-pointer ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform duration-300 ease-out group-hover:scale-110 group-active:scale-95"
      >
        <defs>
          {/* Obsidian Purple to Cyan Gradient */}
          <linearGradient id="forgeGemGrad" x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#A855F7" />
            <stop offset="50%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#06B6D4" />
          </linearGradient>

          {/* Forge Molten Gold Gradient */}
          <linearGradient id="forgeGoldGrad" x1="16" y1="12" x2="48" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="35%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>

          {/* Anvil Obsidian Slate Gradient */}
          <linearGradient id="forgeAnvilGrad" x1="8" y1="40" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#312E81" />
            <stop offset="50%" stopColor="#1E1B4B" />
            <stop offset="100%" stopColor="#0F172A" />
          </linearGradient>

          {/* Ambient Luminescence Glow */}
          <filter id="forgeGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Hexagonal Matrix Facet (Knowledge Graph Lattice) with subtle hover spin */}
        <path
          d="M32 4 L56 18 L56 46 L32 60 L8 46 L8 18 Z"
          stroke="url(#forgeGemGrad)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="2 2"
          className="opacity-40 group-hover:opacity-80 transition-opacity duration-300"
        />

        {/* Lower Anvil / Open Tome Hearth */}
        <path
          d="M14 43 L22 36 L42 36 L50 43 L46 51 L18 51 Z"
          fill="url(#forgeAnvilGrad)"
          stroke="url(#forgeGemGrad)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          className="transition-transform duration-200 group-hover:translate-y-0.5"
        />

        {/* Anvil Core Horns / Story Spine */}
        <path
          d="M22 36 L32 44 L42 36"
          stroke="url(#forgeGoldGrad)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Central Radiant Quill Stylus Blade with lift on hover */}
        <path
          d="M32 10 L38 24 L35 38 L32 44 L29 38 L26 24 Z"
          fill="url(#forgeGoldGrad)"
          stroke="#FFFBEB"
          strokeWidth="1"
          strokeLinejoin="round"
          filter="url(#forgeGlow)"
          className="transition-transform duration-200 group-hover:-translate-y-1"
        />

        {/* Quill Ink Channel & Slit */}
        <path
          d="M32 16 L32 34"
          stroke="#78350F"
          strokeWidth="1.25"
          strokeLinecap="round"
          className="transition-transform duration-200 group-hover:-translate-y-1"
        />

        {/* Constellation / Graph Network Nodes with micro pulse */}
        <circle cx="32" cy="10" r="2.25" fill="#FFFFFF" filter="url(#forgeGlow)" className="transition-transform duration-200 group-hover:-translate-y-1 animate-pulse" />
        <circle cx="18" cy="20" r="1.75" fill="#38BDF8" className="transition-transform duration-300 group-hover:scale-125" />
        <circle cx="46" cy="20" r="1.75" fill="#C084FC" className="transition-transform duration-300 group-hover:scale-125" />
        <circle cx="32" cy="44" r="1.75" fill="#FDE047" className="animate-pulse" />

        {/* Connecting Facet Vector Beams */}
        <line x1="32" y1="10" x2="18" y2="20" stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.6" className="group-hover:stroke-opacity-90 transition-all duration-300" />
        <line x1="32" y1="10" x2="46" y2="20" stroke="#C084FC" strokeWidth="1" strokeOpacity="0.6" className="group-hover:stroke-opacity-90 transition-all duration-300" />
        <line x1="18" y1="20" x2="26" y2="24" stroke="url(#forgeGemGrad)" strokeWidth="0.8" strokeOpacity="0.5" />
        <line x1="46" y1="20" x2="38" y2="24" stroke="url(#forgeGemGrad)" strokeWidth="0.8" strokeOpacity="0.5" />
      </svg>

      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 leading-none">
            <span className="font-display font-semibold tracking-wide text-base bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500 bg-clip-text text-transparent">
              WebNovel
            </span>
            <span className="font-display font-bold tracking-wider text-base text-purple-400 dark:text-purple-300">
              Forge
            </span>
          </div>
          {subtitle && (
            <span className="text-[10px] tracking-wider uppercase text-muted-slate font-medium mt-0.5">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
export default ForgeLogo
