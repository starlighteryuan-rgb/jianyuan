import { useCallback, useEffect, useState } from 'react';

import {
  applyThemeAttribute,
  readStoredThemePreference,
  resolveTheme,
  writeStoredThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from './theme';

/**
 * Appearance state for the desktop shell.
 *
 * Owns three things and nothing else: the persisted preference, the `data-theme`
 * attribute, and the resolved theme for UI that needs to say which one is active.
 *
 * A system change is picked up through the media query listener, so "跟随系统"
 * keeps working without a restart.
 */
export function useThemePreference(): {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
  readonly setPreference: (next: ThemePreference) => void;
} {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readStoredThemePreference(window.localStorage),
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    applyThemeAttribute(document.documentElement, preference);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    writeStoredThemePreference(window.localStorage, next);
    setPreferenceState(next);
  }, []);

  return {
    preference,
    resolved: resolveTheme(preference, systemPrefersDark),
    setPreference,
  };
}
