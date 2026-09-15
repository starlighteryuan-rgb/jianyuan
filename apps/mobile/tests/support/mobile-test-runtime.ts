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
}

export const openMobileTestRuntime = async (
  options: OpenMobileRuntimeOptions,
): Promise<MobileTestRuntime> => {
  const driver = openNodeSqlDriver(options.location);
  const storage = await createMobileStorage(driver);
  const composition = createMobileComposition({
    driver,
    storage,
    platform: createPlatformServices(counterUuids()),
    secretStore: options.secretStore ?? new UnavailableSecretStore('test default'),
  });

  return {
    runtime: new MobileRuntime(composition),
    composition,
    storage,
    close: () => storage.close(),
  };
};
