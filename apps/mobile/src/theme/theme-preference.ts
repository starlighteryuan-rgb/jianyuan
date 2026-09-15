/**
 * Appearance preference (Presentation layer).
 *
 * Deliberately NOT part of Core. `ReflectionPreference` in packages/core
 * describes how the product reasons about a user's experience (hypothesis
 * visibility, intervention level, explanation density). Which colours paint the
 * screen is not a claim about the user, so it never enters Core, SQLite, or the
 * AI provider contract.
 *
 * The logic mirrors apps/desktop/src/theme.ts exactly, including the rule that
 * an explicit choice always wins over the OS setting, so both platforms resolve
 * the same preference the same way.
 */

import type { ResolvedTheme } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export const THEME_STORAGE_KEY = 'jianyuan.appearance.theme';

/**
 * Pure so it can be unit tested without a device: an explicit choice always
 * wins, otherwise the OS preference decides.
 */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemPrefersDark ? 'dark' : 'light';
}

/** Rejects anything that is not one of the three known values. */
export function parseThemePreference(raw: string | null | undefined): ThemePreference {
  return typeof raw === 'string' && (THEME_PREFERENCES as readonly string[]).includes(raw)
    ? (raw as ThemePreference)
    : 'system';
}

export const THEME_PREFERENCE_LABELS: Readonly<Record<ThemePreference, string>> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
};
