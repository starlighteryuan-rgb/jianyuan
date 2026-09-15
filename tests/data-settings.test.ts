import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exportData, restoreData, getCoreComposition } = vi.hoisted(() => ({
  exportData: vi.fn(),
  restoreData: vi.fn(),
  getCoreComposition: vi.fn(),
}));

vi.mock('@/server/capture-composition-root', () => ({
  getCoreComposition,
}));

import {
  exportLocalData,
  getDataSettingsSnapshot,
  restoreLocalData,
} from '../src/server/data-settings';

describe('Data Settings product projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exportData.mockReturnValue('{"format":"jianyuan.sqlite.logical-export"}');
    getCoreComposition.mockResolvedValue({
      mode: 'sqlite',
      storage: {
        databasePath: 'C:/data/jianyuan.sqlite',
        schemaVersion: 1,
        encryptionStatus: {
          configured: false,
          controllerId: null,
          deviceLevelVerified: false,
        },
        exportData,
        restoreData,
      },
    });
  });

  it('projects SQLite operational status without extending a storage contract', async () => {
    await expect(getDataSettingsSnapshot()).resolves.toEqual({
      mode: 'sqlite',
      available: true,
      databasePath: 'C:/data/jianyuan.sqlite',
      schemaVersion: 1,
      encryptionConfigured: false,
      encryptionControllerId: null,
      deviceLevelEncryptionVerified: false,
    });
  });

  it('uses existing adapter export and restore capabilities', async () => {
    await expect(exportLocalData()).resolves.toContain(
      'jianyuan.sqlite.logical-export',
    );
    await restoreLocalData('backup');

    expect(exportData).toHaveBeenCalledOnce();
    expect(restoreData).toHaveBeenCalledWith('backup');
  });

  it('reports export unavailable outside the SQLite graph', async () => {
    getCoreComposition.mockResolvedValueOnce({ mode: 'core-memory' });

    await expect(exportLocalData()).rejects.toThrow(
      'SQLite storage is not active.',
    );
  });

  it('keeps Settings readable when no composition can start', async () => {
    getCoreComposition.mockRejectedValueOnce(new Error('offline'));

    await expect(getDataSettingsSnapshot()).resolves.toMatchObject({
      mode: 'unavailable',
      available: false,
      databasePath: null,
    });
  });
});
