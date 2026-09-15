/**
 * Production binding for the non-secret AI configuration store.
 *
 * Kept apart from `ai-config-store.ts` for the same reason the theme binding is
 * separate from its context: the pure module is exercised under Node, while
 * this file is the only place that imports `expo-sqlite/kv-store`.
 *
 * The value stored here is provider id, Base URL and model. The API key never
 * passes through this file.
 */

import AsyncStorage from 'expo-sqlite/kv-store';

import type { AIConfigStorage } from './ai-config-store';

/** Stable singleton so the AI service reads one configuration source. */
export const createMobileAIConfigStorage = (): AIConfigStorage => ({
  getItemAsync: (key) => AsyncStorage.getItemAsync(key),
  setItemAsync: (key, value) => AsyncStorage.setItemAsync(key, value),
});
