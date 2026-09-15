import {
  getCoreComposition,
  type CoreSqliteComposition,
} from './capture-composition-root';

export interface DataSettingsSnapshot {
  readonly mode: 'sqlite' | 'core-memory' | 'legacy' | 'unavailable';
  readonly available: boolean;
  readonly databasePath: string | null;
  readonly schemaVersion: number | null;
  readonly encryptionConfigured: boolean | null;
  readonly encryptionControllerId: string | null;
  readonly deviceLevelEncryptionVerified: boolean | null;
}

const asSqliteComposition = async (): Promise<CoreSqliteComposition | null> => {
  const composition = await getCoreComposition();
  return composition.mode === 'sqlite'
    ? (composition as CoreSqliteComposition)
    : null;
};

/** Product-layer status projection; it does not add to the Storage contract. */
export const getDataSettingsSnapshot = async (): Promise<DataSettingsSnapshot> => {
  let composition: Awaited<ReturnType<typeof getCoreComposition>>;
  try {
    composition = await getCoreComposition();
  } catch {
    return {
      mode: 'unavailable',
      available: false,
      databasePath: null,
      schemaVersion: null,
      encryptionConfigured: null,
      encryptionControllerId: null,
      deviceLevelEncryptionVerified: null,
    };
  }
  if (composition.mode !== 'sqlite') {
    return {
      mode: composition.mode,
      available: false,
      databasePath: null,
      schemaVersion: null,
      encryptionConfigured: null,
      encryptionControllerId: null,
      deviceLevelEncryptionVerified: null,
    };
  }

  const sqlite = composition as CoreSqliteComposition;
  return {
    mode: 'sqlite',
    available: true,
    databasePath: sqlite.storage.databasePath,
    schemaVersion: sqlite.storage.schemaVersion,
    encryptionConfigured: sqlite.storage.encryptionStatus.configured,
    encryptionControllerId:
      sqlite.storage.encryptionStatus.controllerId,
    deviceLevelEncryptionVerified:
      sqlite.storage.encryptionStatus.deviceLevelVerified,
  };
};

export const exportLocalData = async (): Promise<string> => {
  const composition = await asSqliteComposition();
  if (composition === null) {
    throw new Error('SQLite storage is not active.');
  }
  return composition.storage.exportData();
};

export const restoreLocalData = async (serialized: string): Promise<void> => {
  const composition = await asSqliteComposition();
  if (composition === null) {
    throw new Error('SQLite storage is not active.');
  }
  composition.storage.restoreData(serialized);
};
