module.exports = {
    content: ["./src/**/*.{js,jsx,ts,tsx}"],
    darkMode: 'class', // enable .dark class toggling
    theme: {
      extend: {
        boxShadow: {
          'card': '0 2px 8px rgba(0,0,0,0.04)',
          'card-hover': '0 6px 20px rgba(0,0,0,0.12)',
        },
        backdropBlur: {
          xs: '2px',
        },
        colors: {
          primary: '#3090FF',
          brand: {
            blue: '#3090FF',
            'dark-bg': '#040028',
            white: '#FFFFFF',
          },
          theme: {
            'bg-light': '#FFFFFF', // Light mode main background
            'bg-dark': '#040028', // Dark mode main background from brand
            'card-bg-light': '#FFFFFF',
            'card-bg-dark': '#0E0C32', // A slightly lighter shade of the dark-bg for cards
            'divider-light': '#e2e8f0',
            'divider-dark': '#2A284F', // A shade for dividers
            'text-primary-light': '#040028', // Dark text on light background
            'text-primary-dark': '#FFFFFF', // White text on dark background
            'text-secondary-light': '#718096',
            'text-secondary-dark': '#a0aec0',
            'input-bg-light': '#FFFFFF',
            'input-bg-dark': '#0E0C32',
            'input-border-light': '#cbd5e0',
            'input-border-dark': '#2A284F',
          }
        },
      },
    },
    plugins: [],
  }
  