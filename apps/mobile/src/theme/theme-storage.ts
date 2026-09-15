/**
 * Presentation-layer theme persistence for the Mobile app.
 *
 * WHY A SEPARATE DATABASE
 * The appearance preference is not a claim about the user, so it must not enter
 * Core or the user's Record database (`jianyuan.sqlite`). `expo-sqlite/kv-store`
 * keeps its own `ExpoSQLiteStorage` file in the same app sandbox, which gives
 * the preference durable storage without polluting the Core schema.
 *
 * WHY THIS FILE EXISTS AT ALL
 * `src/theme/theme-context.tsx` is pure and testable under Node. Importing the
 * native key/value store there would drag `expo-sqlite` into every test that
 * renders the shell. Keeping the binding here means only the production app
 * entry touches the native module.
 */

import AsyncStorage from 'expo-sqlite/kv-store';

import type { ThemeStorage } from './theme-context';

/** Stable singleton so the provider's storage effect runs only once. */
export const MOBILE_THEME_STORAGE: ThemeStorage = {
  getItemAsync: (key) => AsyncStorage.getItemAsync(key),
  setItemAsync: (key, value) => AsyncStorage.setItemAsync(key, value),
};
