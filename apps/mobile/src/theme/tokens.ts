/**
 * Pair A theme tokens for Mobile — Dark · Deep Amber / Light · Warm Paper.
 *
 * WHAT THIS IS
 * The same two value sets the Desktop renderer uses (apps/desktop/src/tokens.css),
 * expressed as React Native objects. Layout, spacing, radius, and type scale are
 * shared across both themes, so Light and Dark can never drift apart in geometry
 * — only colour changes.
 *
 * PRESENTATION ONLY
 * Nothing here is a claim about the user, so none of it enters Core, SQLite, or
 * the Provider contract. The preference itself lives in src/theme/theme-preference.ts
 * and is stored outside the database.
 *
 * M1 SCOPE
 * Semantic tokens only: canvas, surface, sunken, text, muted text, border,
 * accent, and status colours. No motion, no ripple, no wave language.
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
  readonly accent: string;
  readonly accentCta: string;
  readonly accentSoft: string;
  readonly onAccent: string;
  readonly borderSubtle: string;
  readonly borderHair: string;
  readonly borderStrong: string;
  readonly success: string;
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
} as const;

export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
} as const;

export const TYPOGRAPHY = {
  eyebrow: { fontSize: 11, letterSpacing: 0 },
  meta: { fontSize: 12, letterSpacing: 0 },
  body: { fontSize: 15, letterSpacing: 0 },
  lead: { fontSize: 16, letterSpacing: 0 },
  title: { fontSize: 20, letterSpacing: 0 },
} as const;

export const LIGHT_COLORS: ThemeColors = {
  canvas: '#f5f1e8',
  surface: '#fdfbf5',
  elevated: '#fffcf6',
  sunken: '#efe9dc',
  textPrimary: '#26231e',
  textSecondary: '#5f5a50',
  textMuted: '#6f685d',
  accent: '#8a683a',
  accentCta: '#7d5e33',
  accentSoft: 'rgba(139, 105, 58, 0.08)',
  onAccent: '#fffcf6',
  borderSubtle: '#e2dacb',
  borderHair: '#eae3d5',
  borderStrong: '#cfc5b0',
  success: '#3f6b46',
  danger: '#9c4033',
};

export const DARK_COLORS: ThemeColors = {
  canvas: '#161512',
  surface: '#1e1c18',
  elevated: '#25221d',
  sunken: '#121110',
  textPrimary: '#e9e6e0',
  textSecondary: '#a8a49b',
  textMuted: '#87837c',
  accent: '#d4a464',
  accentCta: '#b98b4f',
  accentSoft: 'rgba(212, 164, 100, 0.10)',
  onAccent: '#1a1712',
  borderSubtle: '#2c2822',
  borderHair: '#232019',
  borderStrong: '#3d382f',
  success: '#8fbf95',
  danger: '#e09a8c',
};

export const LIGHT_THEME: Theme = { scheme: 'light', colors: LIGHT_COLORS };
export const DARK_THEME: Theme = { scheme: 'dark', colors: DARK_COLORS };

export const themeFor = (scheme: ResolvedTheme): Theme =>
  scheme === 'dark' ? DARK_THEME : LIGHT_THEME;
