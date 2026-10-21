function withOpacity(variableName) {
  return ({ opacityValue }) => {
    if (opacityValue !== undefined) {
      return `rgba(var(${variableName}), ${opacityValue})`
    }
    return `rgb(var(${variableName}))`
  }
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dynamic Obsidian Theme Palette with alpha support
        'ink-night': withOpacity('--ink-night-rgb'),
        'bg-primary': withOpacity('--ink-night-rgb'),
        'bg-secondary': withOpacity('--aged-paper-dark-rgb'),
        'bg-card': withOpacity('--aged-paper-rgb'),
        'bg-input': withOpacity('--aged-paper-dark-rgb'),
        'aged-paper': withOpacity('--aged-paper-rgb'),
        'aged-paper-dark': withOpacity('--aged-paper-dark-rgb'),
        'lamp-gold': withOpacity('--lamp-gold-rgb'),
        'accent-gold': withOpacity('--lamp-gold-rgb'),
        'lamp-gold-dim': withOpacity('--lamp-gold-dim-rgb'),
        'wax-seal-red': withOpacity('--wax-seal-red-rgb'),
        'accent-red': withOpacity('--wax-seal-red-rgb'),
        'jade-ink': withOpacity('--jade-ink-rgb'),
        'accent-green': withOpacity('--jade-ink-rgb'),
        'accent-violet': withOpacity('--accent-violet-rgb'),
        'muted-slate': withOpacity('--muted-slate-rgb'),
        'text-primary': withOpacity('--text-primary-rgb'),
        'text-muted': withOpacity('--text-muted-rgb'),
        'border': 'var(--border)',
        'desk-warm': '#F7F2E9',
        'paper-cream': '#FFFDF8',
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        body: ['Inter', 'sans-serif'],
        manuscript: ['Lora', 'serif'],
        utility: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'story-title': ['2.5rem', { lineHeight: '1.2', fontWeight: '600' }],
        'phase-header': ['1.5rem', { lineHeight: '1.3', fontWeight: '500' }],
        'body-lg': ['1.125rem', { lineHeight: '1.7' }],
        'body-base': ['1rem', { lineHeight: '1.7' }],
      },
      spacing: {
        'desk': '2rem',
        'page-padding': '1.5rem',
      },
      boxShadow: {
        'paper': '0 4px 20px -4px rgba(0,0,0,0.3), 0 0 0 1px rgba(216,164,72,0.1)',
        'paper-hover': '0 8px 30px -8px rgba(0,0,0,0.4), 0 0 0 1px rgba(216,164,72,0.2)',
        'lamp-glow': '0 0 20px rgba(216,164,72,0.15), 0 0 40px rgba(216,164,72,0.05)',
      },
      borderRadius: {
        'paper': '8px',
        'spine': '4px 4px 0 0',
      },
      transitionDuration: {
        'button': '150ms',
        'page-turn': '300ms',
      },
      transitionTimingFunction: {
        'ease': 'ease',
        'page-ease': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        slideUpFade: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        springPop: {
          '0%': { transform: 'scale(0.92)', opacity: '0' },
          '65%': { transform: 'scale(1.03)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmerSweep: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        subtleFloat: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        pulseSubtle: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.85' },
          '50%': { transform: 'scale(1.04)', opacity: '1' },
        },
        dotsPulse: {
          '0%, 80%, 100%': { transform: 'scale(0.8)', opacity: '0.5' },
          '40%': { transform: 'scale(1)', opacity: '1' },
        },
        goldGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(201,168,76,0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(201,168,76,0)' },
        },
        violetFill: {
          '0%': { width: '0%' },
          '100%': { width: '100%' },
        },
      },
      animation: {
        'slide-up-fade': 'slideUpFade 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'spring-pop': 'springPop 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        'shimmer': 'shimmerSweep 2.2s infinite ease-in-out',
        'subtle-float': 'subtleFloat 3s ease-in-out infinite',
        'pulse-subtle': 'pulseSubtle 2.5s ease-in-out infinite',
        'dots-pulse': 'dotsPulse 1.4s infinite ease-in-out',
        'gold-glow': 'goldGlow 2s ease-in-out infinite',
        'violet-fill': 'violetFill 0.3s ease-out',
      },
    },
  },
  plugins: [],
}