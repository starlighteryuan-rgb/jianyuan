/**
 * Production binding for Mobile-local user content visibility.
 *
 * The pure rules stay testable under Node; only this file imports the
 * expo-sqlite key/value channel.
 */

import AsyncStorage from 'expo-sqlite/kv-store';

import type { UserContentVisibilityStorage } from './user-content-visibility-store';

export const createMobileUserContentVisibilityStorage =
  (): UserContentVisibilityStorage => ({
    getItemAsync: (key) => AsyncStorage.getItemAsync(key),
    setItemAsync: (key, value) => AsyncStorage.setItemAsync(key, value),
  });
