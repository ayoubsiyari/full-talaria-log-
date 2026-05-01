module.exports = {
    content: ["./src/**/*.{js,jsx,ts,tsx}"],
    darkMode: 'class',
    theme: {
      extend: {
        fontFamily: {
          'zain': ['Zain', 'Inter', 'system-ui', 'sans-serif'],
          'sans': ['Zain', 'Inter', 'system-ui', 'sans-serif'],
        },
        boxShadow: {
          'card': '0 2px 8px rgba(0,0,0,0.04)',
          'card-hover': '0 6px 20px rgba(0,0,0,0.12)',
          'glow': '0 0 24px rgba(34,211,238,0.18)',
          'glow-lg': '0 0 40px rgba(34,211,238,0.22)',
          'jf-card': 'inset 0 1px 0 0 rgba(34,211,238,0.06), 0 0 28px -8px rgba(34,211,238,0.12)',
        },
        backdropBlur: {
          xs: '2px',
        },
        colors: {
          jf: {
            bg: '#050a10',
            surface: '#071218',
            neon: '#22d3ee',
          },
          // Homepage color scheme (legacy – prefer cyan / jf.*)
          primary: '#22d3ee',
          brand: {
            blue: '#22d3ee',
            'blue-dark': '#0891b2',
            indigo: '#06b6d4',
            purple: '#67e8f9',
            cyan: '#22d3ee',
            'dark-bg': '#050a10',
            'alt-bg': '#071218',
            'card-bg': 'rgba(6, 78, 94, 0.3)',
            white: '#FFFFFF',
          },
          theme: {
            'bg-light': '#FFFFFF',
            'bg-dark': '#030014',
            'card-bg-light': '#FFFFFF',
            'card-bg-dark': '#0f0f14',
            'divider-light': '#e2e8f0',
            'divider-dark': '#1f1f2e',
            'text-primary-light': '#030014',
            'text-primary-dark': '#FFFFFF',
            'text-secondary-light': '#71717a',
            'text-secondary-dark': '#a1a1aa',
            'input-bg-light': '#FFFFFF',
            'input-bg-dark': '#0a0a0f',
            'input-border-light': '#e2e8f0',
            'input-border-dark': '#27272a',
          }
        },
      },
    },
    plugins: [],
  }
  