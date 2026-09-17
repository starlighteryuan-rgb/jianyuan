/**
 * Direction AB theme tokens for Mobile — A identity, B2 capability.
 *
 * A owns the product identity: warm paper Light, restrained copper accent,
 * typography-led hierarchy, weak surfaces, and generous whitespace.
 *
 * B2 only contributes depth capability through a small set of near / far and
 * focus / recede roles. It does not introduce a second visual language.
 *
 * PRESENTATION ONLY
 * Nothing here is a claim about the user, so none of it enters Core, SQLite, or
 * the Provider contract. The preference itself lives in
 * src/theme/theme-preference.ts and is stored outside the database.
 */

export type ResolvedTheme = 'light' | 'dark';

export interface ThemeColors {
  readonly canvas: string;
  readonly surface: string;
  readonly elevated: string;
  readonly sunken: string;

  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly textFaint: string;

  readonly accent: string;
  readonly accentCta: string;
  readonly accentSoft: string;
  readonly onAccent: string;

  readonly borderSubtle: string;
  readonly borderHair: string;
  readonly borderStrong: string;
  readonly divider: string;
  readonly dividerWeak: string;
  readonly connector: string;
  readonly connectorStrong: string;
  readonly focusIndicator: string;

  readonly tagBackground: string;
  readonly tagBorder: string;
  readonly tagText: string;
  readonly tagSelectedBackground: string;

  readonly awarenessFill: string;
  readonly awarenessEdge: string;
  readonly awarenessHalo: string;
  readonly awarenessRipple: string;

  readonly nearSurface: string;
  readonly farSurface: string;

  readonly success: string;
  readonly warning: string;
  readonly danger: string;
}

export interface Theme {
  readonly scheme: ResolvedTheme;
  readonly colors: ThemeColors;
}

/** Shared geometry. Identical in both themes by construction. */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  screen: 22,
  section: 24,
  item: 12,
  inline: 8,
  header: 10,
  bottomSafe: 16,
} as const;

export const RADIUS = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  pill: 999,
} as const;

/**
 * One small type scale for the whole product. User writing stays at 16 px or
 * above; metadata never outranks it.
 */
export const TYPOGRAPHY = {
  appTitle: { fontSize: 21, lineHeight: 28, letterSpacing: 0 },
  navTitle: { fontSize: 17, lineHeight: 24, letterSpacing: 0 },
  section: { fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  eyebrow: { fontSize: 10, lineHeight: 14, letterSpacing: 0.22 },
  meta: { fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  timestamp: { fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  tag: { fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  caption: { fontSize: 11, lineHeight: 16, letterSpacing: 0 },
  body: { fontSize: 16, lineHeight: 26, letterSpacing: 0 },
  record: { fontSize: 16, lineHeight: 26, letterSpacing: 0 },
  reflection: { fontSize: 17, lineHeight: 28, letterSpacing: 0 },
  lead: { fontSize: 17, lineHeight: 26, letterSpacing: 0 },
  action: { fontSize: 15, lineHeight: 20, letterSpacing: 0 },
  empty: { fontSize: 15, lineHeight: 24, letterSpacing: 0 },
  title: { fontSize: 21, lineHeight: 28, letterSpacing: 0 },
  firstPerson: { fontSize: 34, lineHeight: 32, letterSpacing: 0 },
} as const;

/** Near / far geometry is intentionally tiny; tone and contrast do the work. */
export const DEPTH = {
  nearScale: 1,
  midScale: 0.992,
  farScale: 0.982,
  nearTranslateY: 0,
  midTranslateY: 2,
  farTranslateY: 5,
  recedeOpacity: 0.62,
} as const;

export const LIGHT_COLORS: ThemeColors = {
  canvas: '#f2eee5',
  surface: '#faf7f0',
  elevated: '#fffdf8',
  sunken: '#e8e1d4',

  textPrimary: '#1f1c17',
  textSecondary: '#4f4a40',
  textMuted: '#6d675b',
  textFaint: '#948d7e',

  accent: '#7c5c2f',
  accentCta: '#6d4f26',
  accentSoft: 'rgba(124, 92, 47, 0.08)',
  onAccent: '#fbf9f3',

  borderSubtle: '#ddd4c3',
  borderHair: '#e8e1d4',
  borderStrong: '#c6bba6',
  divider: 'rgba(109, 103, 91, 0.22)',
  dividerWeak: 'rgba(109, 103, 91, 0.13)',
  connector: 'rgba(109, 103, 91, 0.34)',
  connectorStrong: 'rgba(124, 92, 47, 0.54)',
  focusIndicator: 'rgba(124, 92, 47, 0.30)',

  tagBackground: 'rgba(124, 92, 47, 0.07)',
  tagBorder: 'rgba(124, 92, 47, 0.20)',
  tagText: '#6a5732',
  tagSelectedBackground: 'rgba(124, 92, 47, 0.12)',

  awarenessFill: 'rgba(124, 92, 47, 0.045)',
  awarenessEdge: 'rgba(124, 92, 47, 0.26)',
  awarenessHalo: 'rgba(124, 92, 47, 0.11)',
  awarenessRipple: 'rgba(124, 92, 47, 0.20)',

  nearSurface: 'rgba(255, 253, 248, 0.86)',
  farSurface: 'rgba(232, 225, 212, 0.46)',

  success: '#3f6b46',
  warning: '#8a6420',
  danger: '#993f31',
};

export const DARK_COLORS: ThemeColors = {
  canvas: '#141312',
  surface: '#1b1917',
  elevated: '#25221d',
  sunken: '#100f0c',

  textPrimary: '#ebe7df',
  textSecondary: '#b4aea5',
  textMuted: '#8e8880',
  textFaint: '#68625b',

  accent: '#bd8a60',
  accentCta: '#a9744e',
  accentSoft: 'rgba(189, 138, 96, 0.13)',
  onAccent: '#16140f',

  borderSubtle: '#2d2925',
  borderHair: '#232019',
  borderStrong: '#3d3832',
  divider: 'rgba(180, 174, 165, 0.20)',
  dividerWeak: 'rgba(180, 174, 165, 0.12)',
  connector: 'rgba(180, 174, 165, 0.30)',
  connectorStrong: 'rgba(189, 138, 96, 0.54)',
  focusIndicator: 'rgba(189, 138, 96, 0.32)',

  tagBackground: 'rgba(189, 138, 96, 0.10)',
  tagBorder: 'rgba(189, 138, 96, 0.22)',
  tagText: '#d8bf94',
  tagSelectedBackground: 'rgba(189, 138, 96, 0.16)',

  awarenessFill: 'rgba(189, 138, 96, 0.05)',
  awarenessEdge: 'rgba(189, 138, 96, 0.30)',
  awarenessHalo: 'rgba(189, 138, 96, 0.13)',
  awarenessRipple: 'rgba(189, 138, 96, 0.24)',

  nearSurface: 'rgba(40, 37, 32, 0.82)',
  farSurface: 'rgba(26, 25, 23, 0.62)',

  success: '#8fbe97',
  warning: '#d6ac6a',
  danger: '#e09a8c',
};

export const LIGHT_THEME: Theme = { scheme: 'light', colors: LIGHT_COLORS };
export const DARK_THEME: Theme = { scheme: 'dark', colors: DARK_COLORS };

export const themeFor = (scheme: ResolvedTheme): Theme =>
  scheme === 'dark' ? DARK_THEME : LIGHT_THEME;
