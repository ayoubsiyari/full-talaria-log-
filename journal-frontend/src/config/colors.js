// Talaria-Log Brand Colors Configuration
// This file centralizes all color definitions for consistent theming across the application
// Updated with official brand guidelines from brand book

export const colors = {
  // Primary Brand Colors (from brand book)
  primary: {
    blue: '#3090FF',         // Primary brand blue
    darkBlue: '#232CF4',     // Dark brand blue
    navy: '#040028',         // Dark navy background
    white: '#FFFFFF',        // Pure white
  },

  // Secondary Brand Colors (from brand book)
  secondary: {
    lightBlue: '#5FACF9',    // Light blue accent
    purple: '#353089',       // Purple accent
    black: '#000000',        // Pure black
  },

  // Gradients with brand colors
  gradients: {
    primary: 'from-[#3090FF] to-[#232CF4]',           // Main brand gradient
    primaryHover: 'from-[#232CF4] to-[#353089]',      // Hover state for main gradient
    secondary: 'from-[#5FACF9] to-[#353089]',         // Secondary gradient
    text: 'from-[#3090FF] to-[#232CF4]',              // Text gradients
    icon: 'from-[#3090FF] to-[#232CF4]',              // Icon backgrounds
    logo: 'from-[#3090FF] to-[#232CF4]',              // Logo gradients
    dark: 'from-[#040028] to-[#000000]',              // Dark background gradient
  },

  // Background Colors
  backgrounds: {
    primary: '#040028',      // Main background (brand navy)
    secondary: 'bg-white/5',  // Secondary background
    tertiary: 'bg-white/10',  // Tertiary background
    overlay: 'bg-white/5',    // Overlay backgrounds
    card: 'bg-white/5',       // Card backgrounds
  },

  // Text Colors
  text: {
    primary: 'text-white',           // Primary text
    secondary: 'text-white/60',      // Secondary text
    tertiary: 'text-white/40',       // Tertiary text
    muted: 'text-white/20',          // Muted text
    brand: 'text-[#3090FF]',         // Brand color text
  },

  // Border Colors
  borders: {
    primary: 'border-white/10',      // Primary borders
    secondary: 'border-white/20',    // Secondary borders
    accent: 'border-[#3090FF]/20',   // Brand accent borders
    brand: 'border-[#3090FF]',       // Full brand borders
  },

  // Status Colors (keeping existing for functionality)
  status: {
    success: '#10b981',      // Emerald Green
    error: '#ef4444',        // Ruby Red
    warning: '#f59e0b',      // Amber Gold
    info: '#5FACF9',         // Brand light blue
  },

  // Component Specific Colors
  components: {
    // Navigation
    nav: {
      background: 'bg-[#040028]/80',
      border: 'border-white/5',
      link: 'text-white/70',
      linkHover: 'text-white',
      linkActive: 'text-[#3090FF]',
      linkBg: 'bg-white/5',
      linkBorder: 'border-white/10',
    },

    // Buttons
    button: {
      primary: 'bg-gradient-to-r from-[#3090FF] to-[#232CF4]',
      primaryHover: 'hover:from-[#232CF4] hover:to-[#353089]',
      secondary: 'bg-white/10 backdrop-blur-sm',
      secondaryHover: 'hover:bg-white/15',
      outline: 'border-[#5FACF9] text-[#5FACF9]',
      outlineHover: 'hover:bg-[#3090FF] hover:border-[#3090FF] hover:text-white',
      text: 'text-white',
    },

    // Cards
    card: {
      background: 'bg-white/5 backdrop-blur-sm',
      border: 'border-white/10',
      hover: 'hover:bg-white/10 hover:border-[#3090FF]/20',
      glow: 'shadow-[0_0_20px_rgba(48,144,255,0.1)]',
      glowHover: 'hover:shadow-[0_0_30px_rgba(48,144,255,0.2)]',
    },

    // Icons
    icon: {
      background: 'bg-gradient-to-br from-[#3090FF] to-[#232CF4]',
      text: 'text-white',
      accent: 'text-[#5FACF9]',
    },

    // Badges
    badge: {
      primary: 'bg-[#3090FF]/10 backdrop-blur-sm border-[#3090FF]/20',
      text: 'text-[#5FACF9]',
      icon: 'text-[#3090FF]',
    },

    // Forms
    form: {
      input: 'bg-white/5 border-white/10 focus:border-[#3090FF]',
      inputFocus: 'focus:shadow-[0_0_0_3px_rgba(48,144,255,0.1)]',
      label: 'text-white/80',
    },

    // Tables
    table: {
      header: 'bg-white/5 text-white border-white/10',
      row: 'border-white/10',
      rowHover: 'hover:bg-[#3090FF]/5',
    },
  },

  // Animation Colors
  animations: {
    pulse: 'bg-green-400',   // Status indicator
    glow: 'rgba(48, 144, 255, 0.6)', // Brand blue glow effect
    glowSecondary: 'rgba(95, 172, 249, 0.4)', // Light blue glow
  },
};

// Utility functions for color application
export const colorUtils = {
  // Get gradient classes
  getGradient: (type = 'primary') => `bg-gradient-to-r ${colors.gradients[type]}`,
  
  // Get gradient with hover
  getGradientWithHover: () => `${colors.gradients.primary} ${colors.gradients.primaryHover}`,
  
  // Get text gradient
  getTextGradient: () => `bg-gradient-to-r ${colors.gradients.text} bg-clip-text text-transparent`,
  
  // Get icon background
  getIconBg: () => `bg-gradient-to-br ${colors.gradients.icon}`,
  
  // Get button classes
  getButtonClasses: (variant = 'primary') => {
    const base = 'inline-flex items-center space-x-2 px-6 py-3 rounded-lg transition-all duration-200 text-sm font-medium';
    
    switch (variant) {
      case 'primary':
        return `${base} ${colors.components.button.primary} text-white shadow-lg hover:shadow-xl ${colors.components.button.primaryHover}`;
      case 'secondary':
        return `${base} ${colors.components.button.secondary} text-white border ${colors.borders.secondary} ${colors.components.button.secondaryHover} hover:border-white/30`;
      case 'outline':
        return `${base} bg-transparent ${colors.components.button.outline} border ${colors.components.button.outlineHover}`;
      default:
        return base;
    }
  },
  
  // Get card classes
  getCardClasses: () => `${colors.components.card.background} rounded-xl p-6 border ${colors.components.card.border} transition-all duration-300 ${colors.components.card.hover}`,
  
  // Get card with glow
  getCardGlowClasses: () => `${colors.components.card.background} rounded-xl p-6 border ${colors.components.card.border} transition-all duration-300 ${colors.components.card.hover} ${colors.components.card.glow} ${colors.components.card.glowHover}`,
  
  // Get badge classes
  getBadgeClasses: () => `${colors.components.badge.primary} px-3 py-1.5 rounded-lg`,

  // Get navigation item classes
  getNavItemClasses: (isActive = false) => {
    const base = 'flex items-center px-4 py-3 rounded-xl transition-all duration-300 ease-out';
    if (isActive) {
      return `${base} bg-gradient-to-r from-[#3090FF]/20 to-[#232CF4]/10 border-l-3 border-[#3090FF] text-white`;
    }
    return `${base} text-white/70 hover:text-white hover:bg-[#3090FF]/10 hover:translate-x-1`;
  },

  // Get input classes
  getInputClasses: () => `${colors.components.form.input} rounded-xl px-4 py-3 text-white placeholder-white/40 transition-all duration-300 ${colors.components.form.inputFocus}`,

  // Get brand colors for charts/graphs
  getChartColors: () => [
    '#3090FF', // Primary blue
    '#5FACF9', // Light blue
    '#232CF4', // Dark blue
    '#353089', // Purple
    '#10b981', // Success green
    '#ef4444', // Error red
    '#f59e0b', // Warning yellow
  ],

  // Get status color
  getStatusColor: (status) => {
    switch (status) {
      case 'success': return colors.status.success;
      case 'error': return colors.status.error;
      case 'warning': return colors.status.warning;
      case 'info': return colors.status.info;
      default: return colors.primary.blue;
    }
  },

  // Get brand shadow
  getBrandShadow: (intensity = 'medium') => {
    switch (intensity) {
      case 'light': return 'shadow-[0_4px_15px_rgba(48,144,255,0.1)]';
      case 'medium': return 'shadow-[0_4px_15px_rgba(48,144,255,0.3)]';
      case 'strong': return 'shadow-[0_6px_20px_rgba(48,144,255,0.4)]';
      default: return 'shadow-[0_4px_15px_rgba(48,144,255,0.3)]';
    }
  },
};

export default colors;

