/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Hanken Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Bricolage Grotesque', 'Hanken Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        success: 'hsl(var(--success))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        brand: {
          blue: 'hsl(var(--brand-blue))',
          'blue-bright': 'hsl(var(--brand-blue-bright))',
          yellow: 'hsl(var(--brand-yellow))',
          'yellow-hover': 'hsl(var(--brand-yellow-hover))',
          'yellow-foreground': 'hsl(var(--brand-yellow-foreground))',
          'yellow-ink': 'hsl(var(--brand-yellow-ink))',
        },
      },
      borderRadius: {
        '2xl': 'calc(var(--radius) + 8px)',
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        card: '0 1px 2px hsl(209 60% 6% / 0.04), 0 8px 24px -12px hsl(209 60% 6% / 0.18)',
        glow: '0 0 0 1px hsl(var(--brand-yellow) / 0.35), 0 8px 30px -8px hsl(var(--brand-yellow) / 0.25)',
        'glow-sm': '0 0 0 1px hsl(var(--brand-yellow) / 0.25), 0 4px 16px -6px hsl(var(--brand-yellow) / 0.2)',
        'glow-lg': '0 0 0 1px hsl(var(--brand-yellow) / 0.4), 0 12px 48px -8px hsl(var(--brand-yellow) / 0.35)',
        'glow-blue': '0 0 0 1px hsl(var(--brand-blue) / 0.5), 0 10px 40px -10px hsl(var(--brand-blue) / 0.55)',
      },
      backgroundImage: {
        'grid-pattern':
          'linear-gradient(to right, hsl(var(--brand-blue) / 0.5) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--brand-blue) / 0.5) 1px, transparent 1px)',
        'gold-sheen':
          'linear-gradient(110deg, hsl(var(--brand-yellow)) 0%, hsl(var(--brand-yellow-hover)) 35%, hsl(0 0% 100% / 0.9) 50%, hsl(var(--brand-yellow-hover)) 65%, hsl(var(--brand-yellow)) 100%)',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(120%)' },
        },
        'border-beam': {
          '100%': { 'offset-distance': '100%' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        shine: {
          '0%': { 'background-position': '200% center' },
          '100%': { 'background-position': '-200% center' },
        },
        'gradient-pan': {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%': { 'background-position': '100% 50%' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 2.5s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2.4s ease-in-out infinite',
        shine: 'shine 6s linear infinite',
        'gradient-pan': 'gradient-pan 8s ease infinite',
        'fade-in-up': 'fade-in-up 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};
