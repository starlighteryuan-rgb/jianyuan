/**
 * Production Mobile bootstrap.
 *
 * This is the ONE place that touches device APIs: `expo-sqlite` for the sandbox
 * database file, `expo-crypto` for UUIDs, `expo-secure-store` for the Keychain.
 * Everything it produces is handed to the pure composition root, so the wiring
 * below is the only code that cannot run under Node.
 *
 * STARTUP ORDER
 *   1. Open the driver. The file is created empty on first install; no Desktop
 *      database, no test database, and no bundled asset is ever read.
 *   2. Run pragmas and migrations. Idempotent, so it is safe on every launch and
 *      is how a future schema version gets applied.
 *   3. Bind the Keychain, degrading rather than throwing if it is unavailable.
 *   4. Compose Core services over the opened pieces.
 *
 * A failure at steps 1 or 2 means there is no place to persist Records, so it
 * propagates: the app shows its fatal state rather than silently losing writes.
 * A failure at step 3 does not propagate, because AI configuration is not
 * required to save a Record.
 */

import * as Crypto from 'expo-crypto';

import { createMobileComposition, type MobileComposition } from './composition-root';
import { createPlatformServices } from './platform-services';
import { createMobileSecretStore } from './secret-store';
import { MobileRuntime } from './mobile-runtime';
import { openMobileSqlDriver, MOBILE_DATABASE_NAME } from '../storage/expo-sql-driver';
import { createMobileStorage } from '../storage/mobile-sqlite-storage';
import { MobileAIService } from './mobile-ai-service';
import { createMobileAIConfigStorage } from './ai-config-storage';
import {
  createMobileAwarenessAutomationStorage,
  createMobileAwarenessManualStorage,
  createMobileAwarenessPreferenceStorage,
} from './awareness-automation-storage';
import { createMobileAwarenessHistoryStorage } from './awareness-history-storage';

export interface MobileBootstrapResult {
  readonly runtime: MobileRuntime;
  readonly composition: MobileComposition;
}

/**
 * Open the app-sandbox database and compose the runtime.
 *
 * @param databaseName Overridable for tests; production uses the default file
 *   name inside the iOS sandbox `Documents/SQLite` directory.
 */
export const bootstrapMobileRuntime = async (
  databaseName: string = MOBILE_DATABASE_NAME,
): Promise<MobileBootstrapResult> => {
  const driver = await openMobileSqlDriver(databaseName);

  // Creates the schema if absent, no-ops if already migrated.
  const storage = await createMobileStorage(driver);

  const platform = createPlatformServices(() => Crypto.randomUUID());
  const secretStore = await createMobileSecretStore();

  // AI is optional: a missing configuration or Keychain degrades to a disabled
  // provider, which is a supported local-first mode.
  const ai = await MobileAIService.create(
    createMobileAIConfigStorage(),
    secretStore,
  );

  const composition = createMobileComposition({
    driver,
    storage,
    platform,
    secretStore,
    ai,
  });

  const runtime = new MobileRuntime(
    composition,
    createMobileAwarenessHistoryStorage(),
    createMobileAwarenessPreferenceStorage(),
    createMobileAwarenessAutomationStorage(),
    createMobileAwarenessManualStorage(),
  );
  await runtime.hydrateAwarenessAutomation();

  return { runtime, composition };
};
