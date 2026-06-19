import { Platform } from 'react-native';

/**
 * Guardian theme — a clean, official-feeling light palette. Distinct from the
 * watch app's dark gold aesthetic: here the risk colors (red/yellow/green) are
 * the primary design language and the surface stays calm and trustworthy.
 */
export const colors = {
  // Backgrounds
  background: '#F8FAFC',
  backgroundElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5F9',

  // Risk levels (primary language)
  red: '#DC2626',
  redLight: 'rgba(220, 38, 38, 0.10)',
  redBorder: 'rgba(220, 38, 38, 0.35)',

  yellow: '#D97706',
  yellowLight: 'rgba(217, 119, 6, 0.10)',
  yellowBorder: 'rgba(217, 119, 6, 0.35)',

  green: '#16A34A',
  greenLight: 'rgba(22, 163, 74, 0.10)',
  greenBorder: 'rgba(22, 163, 74, 0.35)',

  // Brand accent — deep, official blue
  primary: '#1E40AF',
  primaryDark: '#1E3A8A',
  primaryLight: 'rgba(30, 64, 175, 0.10)',

  // Text
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textOnPrimary: '#FFFFFF',

  // Lines / inputs
  border: '#E2E8F0',
  divider: '#F1F5F9',
  inputBg: '#F8FAFC',

  // Misc
  overlay: 'rgba(15, 23, 42, 0.45)',
  shadow: 'rgba(15, 23, 42, 0.10)',
  card: '#FFFFFF',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

const bodyFont = Platform.OS === 'ios' ? 'System' : 'sans-serif';

// Thai marks have ascenders/descenders — line heights are kept ~1.45-1.55x so
// they render without clipping.
export const typography = {
  display: { fontFamily: bodyFont, fontSize: 32, fontWeight: '800' as const, color: colors.text, lineHeight: 44 },
  h1: { fontFamily: bodyFont, fontSize: 26, fontWeight: '700' as const, color: colors.text, lineHeight: 38 },
  h2: { fontFamily: bodyFont, fontSize: 20, fontWeight: '700' as const, color: colors.text, lineHeight: 30 },
  h3: { fontFamily: bodyFont, fontSize: 17, fontWeight: '600' as const, color: colors.text, lineHeight: 26 },
  body: { fontFamily: bodyFont, fontSize: 15, fontWeight: '400' as const, color: colors.text, lineHeight: 24 },
  bodyBold: { fontFamily: bodyFont, fontSize: 15, fontWeight: '600' as const, color: colors.text, lineHeight: 24 },
  caption: { fontFamily: bodyFont, fontSize: 13, fontWeight: '400' as const, color: colors.textSecondary, lineHeight: 20 },
  small: { fontFamily: bodyFont, fontSize: 11, fontWeight: '500' as const, color: colors.textMuted, lineHeight: 16, letterSpacing: 0.5 },
};

export const shadow = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 5,
  },
};
