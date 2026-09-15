/**
 * Production binding for Awareness history.
 *
 * Kept apart from the pure store for the same reason as the AI configuration:
 * this is the only file that imports `expo-sqlite/kv-store`, so the history
 * rules stay runnable under Node.
 */

import AsyncStorage from 'expo-sqlite/kv-store';

import type { AwarenessHistoryStorage } from './awareness-history-store';

/** Stable singleton so one runtime reads one history source. */
export const createMobileAwarenessHistoryStorage =
  (): AwarenessHistoryStorage => ({
    getItemAsync: (key) => AsyncStorage.getItemAsync(key),
    setItemAsync: (key, value) => AsyncStorage.setItemAsync(key, value),
  });
