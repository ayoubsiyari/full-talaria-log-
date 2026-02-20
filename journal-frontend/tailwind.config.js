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
          'glow': '0 0 20px rgba(59,130,246,0.3)',
          'glow-lg': '0 0 40px rgba(59,130,246,0.4)',
        },
        backdropBlur: {
          xs: '2px',
        },
        colors: {
          // Homepage color scheme
          primary: '#3b82f6',
          brand: {
            blue: '#3b82f6',
            'blue-dark': '#1e3a8a',
            indigo: '#6366f1',
            purple: '#8b5cf6',
            cyan: '#06b6d4',
            'dark-bg': '#030014',
            'alt-bg': '#0a0a1a',
            'card-bg': '#0f0f14',
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
  