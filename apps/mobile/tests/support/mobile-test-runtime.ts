/**
 * Build a Mobile composition over a real SQLite file for tests.
 *
 * Uses the production composition root and the production storage adapter; only
 * the driver binding differs (node:sqlite instead of expo-sqlite) and only the
 * UUID source is replaced with a counter so ids are deterministic.
 */

import { createMobileComposition, type MobileComposition } from '../../src/runtime/composition-root';
import { MobileRuntime } from '../../src/runtime/mobile-runtime';
import { createPlatformServices } from '../../src/runtime/platform-services';
import { UnavailableSecretStore, type MobileSecretStore } from '../../src/runtime/secret-store';
import { createMobileStorage, type MobileSqliteStorageAdapter } from '../../src/storage/mobile-sqlite-storage';
import { openNodeSqlDriver } from './node-sql-driver';
import { MobileAIService } from '../../src/runtime/mobile-ai-service';
import type { AIConfigStorage } from '../../src/runtime/ai-config-store';
import type { AwarenessHistoryStorage } from '../../src/runtime/awareness-history-store';
import type { AwarenessAutomationStorage } from '../../src/runtime/awareness-automation-store';
import type { AwarenessPreferenceStorage } from '../../src/runtime/awareness-preference-store';
import type { AwarenessManualStorage } from '../../src/runtime/awareness-manual-store';

/**
 * In-memory, per-runtime AI config store for tests. Kept separate from the
 * production `expo-sqlite/kv-store` binding so the Node test graph never
 * imports a native module.
 */
export const createTestAIConfigStorage = (): AIConfigStorage => {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      values.set(key, value);
    },
  };
};

/**
 * In-memory Awareness history storage.
 *
 * Production uses `expo-sqlite/kv-store`, which survives a process restart.
 * Reusing the same double by database location gives the Node tests the same
 * restart behaviour without importing a native module.
 */
const testAwarenessHistoryByLocation = new Map<string, AwarenessHistoryStorage>();
const testAwarenessPreferenceByLocation = new Map<string, AwarenessPreferenceStorage>();
const testAwarenessAutomationByLocation = new Map<string, AwarenessAutomationStorage>();
const testAwarenessManualByLocation = new Map<string, AwarenessManualStorage>();

const createTestKeyValueStorage = (): AwarenessPreferenceStorage => {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      values.set(key, value);
    },
  };
};

const preferenceFor = (location: string): AwarenessPreferenceStorage => {
  if (location === ':memory:') return createTestKeyValueStorage();
  const existing = testAwarenessPreferenceByLocation.get(location);
  if (existing !== undefined) return existing;
  const created = createTestKeyValueStorage();
  testAwarenessPreferenceByLocation.set(location, created);
  return created;
};

const automationFor = (location: string): AwarenessAutomationStorage => {
  if (location === ':memory:') return createTestKeyValueStorage();
  const existing = testAwarenessAutomationByLocation.get(location);
  if (existing !== undefined) return existing;
  const created = createTestKeyValueStorage();
  testAwarenessAutomationByLocation.set(location, created);
  return created;
};

export const createTestAwarenessHistoryStorage = (): AwarenessHistoryStorage => {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      values.set(key, value);
    },
  };
};

const manualFor = (location: string): AwarenessManualStorage => {
  if (location === ':memory:') return createTestKeyValueStorage();
  const existing = testAwarenessManualByLocation.get(location);
  if (existing !== undefined) return existing;
  const created = createTestKeyValueStorage();
  testAwarenessManualByLocation.set(location, created);
  return created;
};

const awarenessHistoryFor = (location: string): AwarenessHistoryStorage => {
  if (location === ':memory:') return createTestAwarenessHistoryStorage();
  const existing = testAwarenessHistoryByLocation.get(location);
  if (existing !== undefined) return existing;
  const created = createTestAwarenessHistoryStorage();
  testAwarenessHistoryByLocation.set(location, created);
  return created;
};

export interface MobileTestRuntime {
  readonly runtime: MobileRuntime;
  readonly composition: MobileComposition;
  readonly storage: MobileSqliteStorageAdapter;
  close(): Promise<void>;
}

/** Deterministic, collision-free ids; the shape matches production. */
const counterUuids = (): (() => string) => {
  let sequence = 0;
  return () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
};

export interface OpenMobileRuntimeOptions {
  /** Database file path, or ':memory:'. */
  readonly location: string;
  /** Inject a secret store double; defaults to the unavailable store. */
  readonly secretStore?: MobileSecretStore;
  /** Optional AI config persistence; defaults to a fresh in-memory store. */
  readonly aiConfigStorage?: AIConfigStorage;
  /** Optional fetch double for Provider tests. */
  readonly fetch?: typeof fetch;
  /** Optional Awareness history persistence; defaults to per-location memory. */
  readonly awarenessHistoryStorage?: AwarenessHistoryStorage;
  /** Optional automatic Awareness policy persistence. */
  readonly awarenessPreferenceStorage?: AwarenessPreferenceStorage;
  /** Optional automatic job persistence. */
  readonly awarenessAutomationStorage?: AwarenessAutomationStorage;
  /** Optional manual Awareness coverage persistence. */
  readonly awarenessManualStorage?: AwarenessManualStorage;
}

export const openMobileTestRuntime = async (
  options: OpenMobileRuntimeOptions,
): Promise<MobileTestRuntime> => {
  const driver = openNodeSqlDriver(options.location);
  const storage = await createMobileStorage(driver);
  const secretStore =
    options.secretStore ?? new UnavailableSecretStore('test default');
  const ai = await MobileAIService.create(
    options.aiConfigStorage ?? createTestAIConfigStorage(),
    secretStore,
    options.fetch ?? fetch,
  );
  const composition = createMobileComposition({
    driver,
    storage,
    platform: createPlatformServices(counterUuids()),
    secretStore: options.secretStore ?? new UnavailableSecretStore('test default'),
    ai,
  });

  const runtime = new MobileRuntime(
    composition,
    options.awarenessHistoryStorage ?? awarenessHistoryFor(options.location),
    options.awarenessPreferenceStorage ?? preferenceFor(options.location),
    options.awarenessAutomationStorage ?? automationFor(options.location),
    options.awarenessManualStorage ?? manualFor(options.location),
  );

  return {
    runtime,
    composition,
    storage,
    close: async () => {
      await runtime.close();
      await storage.close();
    },
  };
};
