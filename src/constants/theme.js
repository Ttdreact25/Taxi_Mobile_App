import { Dimensions, Platform, PixelRatio } from 'react-native'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

// Responsive scaling helper
const scale = SCREEN_WIDTH / 375
export const normalize = (size) => {
  const newSize = size * scale
  if (Platform.OS === 'ios') {
    return Math.round(PixelRatio.roundToNearestPixel(newSize))
  }
  return Math.round(PixelRatio.roundToNearestPixel(newSize)) - 1
}

// CityOneTaxi Mobile — Material Design 3 / Uber / Namma Yatri Inspired Light Theme
export const COLORS = {
  // Brand Primary & Accents — Signature Customer Yellow (#FFC700) Unified
  primary:        '#FFC700', // Signature CityOneTaxi Yellow
  primaryLight:   '#FFFBE6', // Soft Yellow Tint
  primaryMid:     '#FDE68A', // Warm Amber
  primaryDark:    '#E5A500', // Deep Yellow
  primaryGlow:    'rgba(255, 199, 0, 0.28)',

  // Taxi Yellow Secondary & Brand Accent
  secondary:      '#FFC700',
  secondaryLight: '#FEF9C3',
  secondaryDark:  '#CA8A04',
  taxiYellow:     '#FFC700',
  taxiGold:       '#FFC700',
  taxiAmber:      '#D97706',
  taxiSoftYellow: '#FFF9E6',

  // Uber Noir Accents
  uberBlack:      '#000000',
  dark:           '#0F172A',
  
  // Semantic Status Colors
  success:        '#10B981', // Emerald
  successLight:   '#ECFDF5',
  successDark:    '#047857',
  successBorder:  '#A7F3D0',

  error:          '#EF4444', // Crimson Red
  errorLight:     '#FEF2F2',
  errorDark:      '#B91C1C',
  errorBorder:    '#FECACA',

  warning:        '#F59E0B', // Amber
  warningLight:   '#FFFBEB',
  warningDark:    '#B45309',
  warningBorder:  '#FDE68A',

  info:           '#0284C7', // Sky Blue
  infoLight:      '#F0F9FF',
  infoDark:       '#0369A1',
  infoBorder:     '#BAE6FD',

  // Surfaces & Backgrounds (Strict Light Theme)
  white:          '#FFFFFF',
  black:          '#000000',
  background:     '#F8FAFC', // Slate 50 ultra clean background
  card:           '#FFFFFF',
  surface:        '#F1F5F9', // Slate 100
  surfaceElevated:'#FFFFFF',
  border:         '#E2E8F0', // Slate 200 hairline border
  borderLight:    '#F1F5F9',
  borderDark:     '#CBD5E1',

  // Typography Tokens
  text:           '#0F172A', // Slate 900
  textPrimary:    '#0F172A',
  textSecondary:  '#475569', // Slate 600
  textMuted:      '#64748B', // Slate 500
  textLight:      '#94A3B8', // Slate 400
  placeholder:    '#94A3B8',

  // Grays Scale
  gray50:         '#F8FAFC',
  gray100:        '#F1F5F9',
  gray200:        '#E2E8F0',
  gray300:        '#CBD5E1',
  gray400:        '#94A3B8',
  gray500:        '#64748B',
  gray600:        '#475569',
  gray700:        '#334155',
  gray800:        '#1E293B',
  gray900:        '#0F172A',
}

export const FONTS = {
  regular:   Platform.OS === 'ios' ? 'System' : 'Roboto',
  medium:    Platform.OS === 'ios' ? 'System' : 'Roboto',
  semibold:  Platform.OS === 'ios' ? 'System' : 'Roboto',
  bold:      Platform.OS === 'ios' ? 'System' : 'Roboto',
  weights: {
    regular:  '400',
    medium:   '500',
    semibold: '600',
    bold:     '700',
    heavy:    '800',
    black:    '900',
  },
  sizes: {
    xxs: 10,
    xs:  11,
    sm:  13,
    md:  14,
    base:15,
    lg:  16,
    xl:  18,
    xxl: 20,
    xxxl:24,
    display: 28,
    hero: 32,
  }
}

export const RADIUS = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  round: 30,
  full: 999,
}

export const SPACING = {
  xxs: 2,
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
  xxxl:32,
}

export const SHADOW = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  xs: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  small: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  medium: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  large: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  bottomSheet: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 12,
  }
}

export const SCREEN = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  isSmallDevice: SCREEN_WIDTH < 360,
  isMediumDevice: SCREEN_WIDTH >= 360 && SCREEN_WIDTH < 412,
  isLargeDevice: SCREEN_WIDTH >= 412 && SCREEN_WIDTH < 600,
  isTablet: SCREEN_WIDTH >= 600,
}
