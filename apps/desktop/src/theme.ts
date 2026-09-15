/**
 * Appearance preference (Presentation layer).
 *
 * Deliberately NOT part of Core domain: `ReflectionPreference` in packages/core
 * describes how the product reasons about a user's experience (hypothesis
 * visibility, intervention level, explanation density). Which colours paint the
 * window is not a claim about the user, so it never enters Core, SQLite or the
 * AI provider contract. It lives here, in localStorage.
 */

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export const THEME_STORAGE_KEY = 'jianyuan.appearance.theme';

/**
 * Pure so it can be unit tested without a DOM: an explicit choice always wins,
 * otherwise the OS preference decides.
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

export function readStoredThemePreference(storage: Pick<Storage, 'getItem'>): ThemePreference {
  try {
    return parseThemePreference(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Private mode or a blocked storage API must not stop the app from painting.
    return 'system';
  }
}

export function writeStoredThemePreference(
  storage: Pick<Storage, 'setItem'>,
  preference: ThemePreference,
): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Persisting is best-effort; the session still honours the choice.
  }
}

/**
 * Applies `data-theme` to the document element.
 *
 * `system` intentionally writes NO attribute: tokens.css resolves it through
 * `@media (prefers-color-scheme: dark)` combined with `:root:not([data-theme="light"])`,
 * so following the OS needs no JS to stay correct after a system change.
 */
export function applyThemeAttribute(
  root: Pick<HTMLElement, 'setAttribute' | 'removeAttribute'>,
  preference: ThemePreference,
): void {
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
}
