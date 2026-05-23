// Dark + Amber theme inspired by Coin Snap
export const colors = {
  // Backgrounds
  background: '#0A0805',         // near-black with warm undertone
  backgroundElevated: '#1A1410', // warm dark for elevated areas
  surface: '#1E1814',            // card surface
  surfaceMuted: '#2A2218',       // subtle muted card
  surfaceHover: '#322820',

  // Brand — bright premium gold (Swiss watchmaker style)
  amber: '#ECC87A',              // primary CTA — premium satin-gold
  amberLight: '#F3DBA7',         // lighter gold for highlights
  amberDark: '#C59A45',          // medium gold for shadows
  amberGlow: 'rgba(236, 200, 122, 0.18)',

  // Legacy aliases (some screens still reference these — point to new equivalents)
  gold: '#ECC87A',
  goldLight: '#2A2015',          // dark variant for badge backgrounds
  goldDark: '#C59A45',
  primary: '#ECC87A',
  primaryDark: '#C59A45',

  // Text on dark
  text: '#FFFFFF',
  textSecondary: '#B5AFA5',
  textMuted: '#7A736A',

  // Lines & dividers
  border: '#2D2620',
  divider: '#26201A',

  // Semantic
  success: '#4ADE80',
  successLight: 'rgba(74, 222, 128, 0.15)',
  warning: '#F59E0B',
  warningLight: 'rgba(245, 158, 11, 0.15)',
  danger: '#EF4444',
  dangerLight: 'rgba(239, 68, 68, 0.15)',
  scarlet: '#EF4444',
  scarletLight: 'rgba(239, 68, 68, 0.15)',

  // Misc
  overlay: 'rgba(0,0,0,0.75)',
  shadow: 'rgba(0,0,0,0.4)',

  // Card aliases
  card: '#1E1814',
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
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  full: 999,
};

// Thai vowels have descenders (◌ู ◌ุ ◌ฺ) and ascenders (◌ี ◌ื ◌็ ◌์ ◌ั) that
// need ~1.45-1.55× line-height to render fully. RN's default leading is
// font-dependent and on Android can clip. Set lineHeight explicitly on every
// preset so titles that wrap don't truncate Thai marks.
export const typography = {
  display: { fontSize: 36, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.5, lineHeight: 52 },
  h1: { fontSize: 28, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.3, lineHeight: 40 },
  h2: { fontSize: 22, fontWeight: '700' as const, color: colors.text, lineHeight: 32 },
  h3: { fontSize: 18, fontWeight: '700' as const, color: colors.text, lineHeight: 26 },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text, lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '600' as const, color: colors.text, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '500' as const, color: colors.textSecondary, lineHeight: 19 },
  small: { fontSize: 11, fontWeight: '600' as const, color: colors.textMuted, letterSpacing: 0.6, lineHeight: 16 },
};

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 12,
  },
  amber: {
    shadowColor: '#ECC87A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
};
