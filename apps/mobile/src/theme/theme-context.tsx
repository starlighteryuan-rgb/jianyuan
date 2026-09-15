/**
 * Theme context.
 *
 * Resolves the stored preference plus the OS setting into a concrete theme and
 * exposes it to the tree. The preference is stored through an injected key/value
 * store so it never touches SQLite or Core.
 *
 * DEFAULT IS SYSTEM. `resolveTheme` makes an explicit choice win and otherwise
 * defers to the OS, which is the behaviour the spec asks for and the same rule
 * the Desktop renderer applies.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

import {
  parseThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from './theme-preference';
import { themeFor, type Theme } from './tokens';

/** Minimal async key/value store, satisfied by expo-sqlite/kv-store or a double. */
export interface ThemeStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

/** Store used when nothing is wired: the preference simply is not persisted. */
export const NOOP_THEME_STORAGE: ThemeStorage = {
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
};

export interface ThemeContextValue {
  readonly theme: Theme;
  readonly preference: ThemePreference;
  readonly setPreference: (preference: ThemePreference) => void;
  readonly ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  readonly children: ReactNode;
  readonly storage?: ThemeStorage;
  /** Overrides the OS scheme; used by tests. */
  readonly systemScheme?: 'light' | 'dark' | null;
}

export const ThemeProvider = ({
  children,
  storage = NOOP_THEME_STORAGE,
  systemScheme,
}: ThemeProviderProps) => {
  const osScheme = useColorScheme();
  const effectiveSystemScheme = systemScheme === undefined ? osScheme : systemScheme;

  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);

  // Read the stored preference once. A storage failure must not stop the app
  // from painting, so it degrades to `system`.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await storage.getItemAsync(THEME_STORAGE_KEY);
        if (!cancelled) setPreferenceState(parseThemePreference(stored));
      } catch {
        if (!cancelled) setPreferenceState('system');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      // Update in memory first so the UI responds immediately; persistence is
      // best-effort and its failure does not roll the choice back.
      setPreferenceState(next);
      void storage.setItemAsync(THEME_STORAGE_KEY, next).catch(() => undefined);
    },
    [storage],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: themeFor(resolveTheme(preference, effectiveSystemScheme === 'dark')),
      preference,
      setPreference,
      ready,
    }),
    [preference, effectiveSystemScheme, setPreference, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return value;
};
