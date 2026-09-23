// CityDropTaxi Mobile — Luxury Enterprise Design Tokens
export const COLORS = {
  // Brand Accents
  primary:       '#6366F1', // Indigo / Vibrant Tech Purple
  primaryLight:  '#EEF2FF',
  primaryDark:   '#4338CA',
  primaryGlow:   'rgba(99, 102, 241, 0.25)',

  secondary:     '#F59E0B', // Amber / Gold
  secondaryLight:'#FEF3C7',
  secondaryDark: '#B45309',

  accent:        '#EC4899', // Modern Pink / Magenta accent
  accentLight:   '#FDF2F8',

  // Semantic Status Colors
  success:       '#10B981', // Emerald
  successLight:  '#ECFDF5',
  successDark:   '#047857',

  error:         '#EF4444', // Crimson
  errorLight:    '#FEF2F2',
  errorDark:     '#B91C1C',

  info:          '#0EA5E9', // Sky Blue
  infoLight:     '#F0F9FF',
  infoDark:      '#0369A1',

  warning:       '#F59E0B',
  warningLight:  '#FFFBEB',

  // Surfaces & Backgrounds
  white:         '#FFFFFF',
  black:         '#000000',
  background:    '#F8FAFC', // Slate 50
  card:          '#FFFFFF',
  surface:       '#F1F5F9',
  border:        '#E2E8F0',
  borderLight:   '#F1F5F9',
  borderDark:    '#CBD5E1',

  // Typography Tokens
  text:          '#0F172A', // Deep Slate
  textPrimary:   '#0F172A',
  textSecondary: '#475569',
  textMuted:     '#64748B',
  textLight:     '#94A3B8',
  dark:          '#0F172A',

  // Slate Neutral Grays
  gray50:        '#F8FAFC',
  gray100:       '#F1F5F9',
  gray200:       '#E2E8F0',
  gray300:       '#CBD5E1',
  gray400:       '#94A3B8',
  gray500:       '#64748B',
  gray600:       '#475569',
  gray700:       '#334155',
  gray800:       '#1E293B',
  gray900:       '#0F172A',
}

export const FONTS = {
  regular:    'System',
  medium:     'System',
  semibold:   'System',
  bold:       'System',
  sizes: {
    xs: 11,
    sm: 13,
    md: 14,
    base: 15,
    lg: 16,
    xl: 18,
    xxl: 20,
    xxxl: 24,
    display: 28,
    hero: 32,
  }
}

export const RADIUS = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 28,
  full: 999,
}

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
}

export const SHADOW = {
  xs: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 6,
  },
  lg: {
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 10,
  },
  glow: {
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  }
}
