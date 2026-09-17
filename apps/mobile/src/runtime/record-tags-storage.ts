/**
 * Production binding for Record Tags.
 *
 * Kept apart from the pure store so the tag rules stay runnable under Node and
 * only the app entry imports `expo-sqlite/kv-store`.
 */

import AsyncStorage from 'expo-sqlite/kv-store';

import type { RecordTagStorage } from './record-tags-store';

export const createMobileRecordTagStorage = (): RecordTagStorage => ({
  getItemAsync: (key) => AsyncStorage.getItemAsync(key),
  setItemAsync: (key, value) => AsyncStorage.setItemAsync(key, value),
});
