/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#05060a',
          900: '#0a0c12',
          850: '#0e1119',
          800: '#12161f',
          700: '#1a1f2b',
          600: '#242a38',
          500: '#333b4d',
        },
        bull: { DEFAULT: '#22c55e', soft: '#16a34a', glow: 'rgba(34,197,94,0.15)' },
        bear: { DEFAULT: '#ef4444', soft: '#dc2626', glow: 'rgba(239,68,68,0.15)' },
        ai: { DEFAULT: '#8b5cf6', soft: '#6d28d9', cyan: '#22d3ee', glow: 'rgba(139,92,246,0.18)' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 40px -24px rgba(0,0,0,0.8)',
        glow: '0 0 0 1px rgba(139,92,246,0.35), 0 0 40px -10px rgba(139,92,246,0.45)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        pulseSoft: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.55 } },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
