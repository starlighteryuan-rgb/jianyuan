import type { DatabaseSync } from 'node:sqlite';

/**
 * SQLite-specific extension seam for a future SQLCipher or runtime-keystore
 * implementation. The key stays owned by the extension and is never returned
 * to Core, Presentation, logs, exports, or this adapter's status object.
 */
export interface SqliteEncryptionController {
  readonly id: string;
  configure(database: DatabaseSync): void;
}

export interface SqliteEncryptionStatus {
  readonly configured: boolean;
  readonly controllerId: string | null;
  readonly deviceLevelVerified: false;
}
