/**
 * Production bindings for Awareness automation state.
 *
 * Kept apart from the pure stores so the orchestration rules remain runnable
 * under Node and only the app entry imports expo-sqlite/kv-store.
 */

import AsyncStorage from 'expo-sqlite/kv-store';

import type { AwarenessAutomationStorage } from './awareness-automation-store';
import type { AwarenessManualStorage } from './awareness-manual-store';
import type { AwarenessPreferenceStorage } from './awareness-preference-store';

export const createMobileAwarenessPreferenceStorage =
  (): AwarenessPreferenceStorage => ({
    getItemAsync: (key) => AsyncStorage.getItemAsync(key),
    setItemAsync: (key, value) => AsyncStorage.setItemAsync(key, value),
  });

export const createMobileAwarenessAutomationStorage =
  (): AwarenessAutomationStorage => ({
    getItemAsync: (key) => AsyncStorage.getItemAsync(key),
    setItemAsync: (key, value) => AsyncStorage.setItemAsync(key, value),
  });

export const createMobileAwarenessManualStorage =
  (): AwarenessManualStorage => ({
    getItemAsync: (key) => AsyncStorage.getItemAsync(key),
    setItemAsync: (key, value) => AsyncStorage.setItemAsync(key, value),
  });
