/**
 * Journal UI – neon cyan dark theme (aligned with homepage /dashboard).
 * Use these tokens for className strings and chart colors.
 */

export const colors = {
  primary: {
    blue: '#22d3ee',
    darkBlue: '#0891b2',
    navy: '#050a10',
    white: '#f8fafc',
  },

  secondary: {
    lightBlue: '#67e8f9',
    purple: '#a5f3fc',
    black: '#000000',
  },

  gradients: {
    primary: 'from-cyan-400/20 to-cyan-600/10',
    primaryHover: 'from-cyan-400/25 to-cyan-600/15',
    secondary: 'from-cyan-500/15 to-cyan-700/10',
    text: '', // avoid text gradients – use solid cyan
    icon: 'from-cyan-500/20 to-cyan-700/10',
    logo: 'from-cyan-400 to-cyan-600',
    dark: 'from-[#050a10] to-[#020508]',
  },

  backgrounds: {
    primary: '#050a10',
    secondary: 'bg-cyan-950/40',
    tertiary: 'bg-cyan-500/10',
    overlay: 'bg-black/60',
    card: 'bg-cyan-950/30',
  },

  text: {
    primary: 'text-slate-100',
    secondary: 'text-cyan-100/55',
    tertiary: 'text-cyan-200/45',
    muted: 'text-cyan-200/35',
    brand: 'text-cyan-300',
  },

  borders: {
    primary: 'border-cyan-500/15',
    secondary: 'border-cyan-400/25',
    accent: 'border-cyan-400/35',
    brand: 'border-cyan-400',
  },

  status: {
    success: '#34d399',
    error: '#f87171',
    warning: '#fbbf24',
    info: '#22d3ee',
  },

  components: {
    nav: {
      background: 'bg-[#050a10]/90',
      border: 'border-cyan-500/15',
      link: 'text-cyan-100/55',
      linkHover: 'text-cyan-50',
      linkActive: 'text-cyan-300',
      linkBg: 'bg-cyan-500/10',
      linkBorder: 'border-cyan-400/30',
    },

    button: {
      primary:
        'bg-cyan-500/15 text-cyan-50 border border-cyan-400/45 shadow-glow hover:bg-cyan-500/20 hover:border-cyan-400/60',
      primaryHover: '',
      secondary: 'bg-cyan-950/40 backdrop-blur-sm border-cyan-500/20',
      secondaryHover: 'hover:bg-cyan-500/10',
      outline: 'border-cyan-400/50 text-cyan-300',
      outlineHover: 'hover:bg-cyan-500/15 hover:border-cyan-400 hover:text-cyan-50',
      text: 'text-cyan-50',
    },

    card: {
      background: 'bg-cyan-950/30',
      border: 'border-cyan-400/20',
      hover: 'hover:border-cyan-400/45 hover:shadow-glow',
      glow: 'shadow-[inset_0_1px_0_0_rgba(34,211,238,0.06)]',
      glowHover: 'hover:shadow-[0_0_28px_-8px_rgba(34,211,238,0.2)]',
    },

    icon: {
      background: 'bg-cyan-500/15 border border-cyan-400/25',
      text: 'text-cyan-200',
      accent: 'text-cyan-400',
    },

    badge: {
      primary: 'bg-cyan-500/10 border border-cyan-400/30',
      text: 'text-cyan-200',
      icon: 'text-cyan-400',
    },

    form: {
      input: 'bg-cyan-950/40 border-cyan-500/20 focus:border-cyan-400',
      inputFocus: 'focus:shadow-[0_0_0_3px_rgba(34,211,238,0.12)]',
      label: 'text-cyan-100/70',
    },

    table: {
      header: 'bg-cyan-950/50 text-cyan-400/90 border-cyan-500/15',
      row: 'border-cyan-500/10',
      rowHover: 'hover:bg-cyan-500/[0.06]',
    },
  },

  animations: {
    pulse: 'bg-cyan-400',
    glow: 'rgba(34, 211, 238, 0.35)',
    glowSecondary: 'rgba(103, 232, 249, 0.25)',
  },
};

export const colorUtils = {
  getGradient: (type = 'primary') => `bg-gradient-to-r ${colors.gradients[type] || colors.gradients.primary}`,

  getGradientWithHover: () =>
    `${colors.gradients.primary} ${colors.gradients.primaryHover}`,

  getTextGradient: () => 'text-cyan-200',

  getIconBg: () => colors.components.icon.background,

  getButtonClasses: (variant = 'primary') => {
    const base =
      'inline-flex items-center space-x-2 px-6 py-3 rounded-lg transition-all duration-200 text-sm font-medium';
    switch (variant) {
      case 'primary':
        return `${base} ${colors.components.button.primary}`;
      case 'secondary':
        return `${base} ${colors.components.button.secondary} text-cyan-100 border ${colors.borders.secondary} ${colors.components.button.secondaryHover}`;
      case 'outline':
        return `${base} bg-transparent ${colors.components.button.outline} border ${colors.components.button.outlineHover}`;
      default:
        return base;
    }
  },

  getCardClasses: () =>
    `${colors.components.card.background} rounded-lg p-6 border ${colors.components.card.border} transition-all duration-300 ${colors.components.card.hover}`,

  getCardGlowClasses: () =>
    `${colorUtils.getCardClasses()} ${colors.components.card.glow} ${colors.components.card.glowHover}`,

  getBadgeClasses: () => `${colors.components.badge.primary} px-3 py-1.5 rounded-lg`,

  getNavItemClasses: (isActive = false) => {
    const base =
      'flex items-center px-4 py-3 rounded-lg transition-all duration-300 ease-out';
    if (isActive) {
      return `${base} bg-cyan-500/12 border-l-[3px] border-cyan-400 text-cyan-50`;
    }
    return `${base} text-cyan-100/55 hover:text-cyan-100 hover:bg-cyan-500/10`;
  },

  getInputClasses: () =>
    `${colors.components.form.input} rounded-lg px-4 py-3 text-slate-100 placeholder-cyan-200/30 transition-all duration-300 ${colors.components.form.inputFocus}`,

  getChartColors: () => [
    '#22d3ee',
    '#67e8f9',
    '#0891b2',
    '#a5f3fc',
    '#34d399',
    '#f87171',
    '#fbbf24',
  ],

  getStatusColor: (status) => {
    switch (status) {
      case 'success':
        return colors.status.success;
      case 'error':
        return colors.status.error;
      case 'warning':
        return colors.status.warning;
      case 'info':
        return colors.status.info;
      default:
        return colors.primary.blue;
    }
  },

  getBrandShadow: (intensity = 'medium') => {
    switch (intensity) {
      case 'light':
        return 'shadow-[0_4px_15px_rgba(34,211,238,0.08)]';
      case 'medium':
        return 'shadow-[0_4px_20px_rgba(34,211,238,0.15)]';
      case 'strong':
        return 'shadow-[0_6px_28px_rgba(34,211,238,0.22)]';
      default:
        return 'shadow-[0_4px_20px_rgba(34,211,238,0.15)]';
    }
  },
};

export default colors;
