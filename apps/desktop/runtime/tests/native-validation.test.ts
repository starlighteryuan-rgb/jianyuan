import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DesktopRuntime } from '../desktop-runtime';
import { runNativeValidation } from '../native-validation';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const writeCredentialState = (appDataDir: string, phase: 'prepare' | 'verify') => {
  writeFileSync(
    join(appDataDir, 'native-validation-credential-state.json'),
    JSON.stringify({
      credentialWrite: phase === 'prepare',
      credentialRead: phase === 'prepare',
      credentialRestartRead: phase === 'verify',
      credentialDelete: phase === 'verify',
      credentialMissingAfterDelete: phase === 'verify',
      errors: [],
    }),
    'utf8',
  );
};

describe('Native validation harness', () => {
  it('persists validation entities across a real runtime restart and cleans only them', async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), 'jianyuan-native-validation-'));
    directories.push(appDataDir);

    const first = new DesktopRuntime({ appDataDir });
    expect((await first.capture('user-data-must-survive-validation')).ok).toBe(true);
    writeCredentialState(appDataDir, 'prepare');
    const preparePath = await runNativeValidation(first, 'prepare', appDataDir);
    const prepared = JSON.parse(readFileSync(preparePath, 'utf8')) as {
      readonly recordWritten: boolean;
      readonly reflectionWritten: boolean;
      readonly credentialWrite: boolean;
      readonly credentialRead: boolean;
    };
    expect(prepared.recordWritten).toBe(true);
    expect(prepared.reflectionWritten).toBe(true);
    expect(prepared.credentialWrite).toBe(true);
    expect(prepared.credentialRead).toBe(true);
    expect(existsSync(join(appDataDir, 'native-validation-checkpoint.json'))).toBe(true);
    first.close();

    const restarted = new DesktopRuntime({ appDataDir });
    writeCredentialState(appDataDir, 'verify');
    const verifyPath = await runNativeValidation(restarted, 'verify', appDataDir);
    const verified = JSON.parse(readFileSync(verifyPath, 'utf8')) as {
      readonly recordRecoveredAfterRestart: boolean;
      readonly reflectionRecoveredAfterRestart: boolean;
      readonly credentialRestartRead: boolean;
      readonly credentialDelete: boolean;
      readonly credentialMissingAfterDelete: boolean;
      readonly cleanupCompleted: boolean;
      readonly errors: readonly string[];
    };
    expect(verified.recordRecoveredAfterRestart).toBe(true);
    expect(verified.reflectionRecoveredAfterRestart).toBe(true);
    expect(verified.credentialRestartRead).toBe(true);
    expect(verified.credentialDelete).toBe(true);
    expect(verified.credentialMissingAfterDelete).toBe(true);
    expect(verified.cleanupCompleted).toBe(true);
    expect(verified.errors).toEqual([]);
    expect(existsSync(join(appDataDir, 'native-validation-checkpoint.json'))).toBe(false);
    expect(await restarted.listRecords()).toEqual([
      expect.objectContaining({ verbatim: 'user-data-must-survive-validation' }),
    ]);
    restarted.close();
  });

  it('returns an explicit failure when verify starts without a checkpoint', async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), 'jianyuan-native-validation-missing-'));
    directories.push(appDataDir);

    const runtime = new DesktopRuntime({ appDataDir });
    const resultPath = await runNativeValidation(runtime, 'verify', appDataDir);
    const result = JSON.parse(readFileSync(resultPath, 'utf8')) as {
      readonly cleanupCompleted: boolean;
      readonly errors: readonly string[];
    };

    expect(result.cleanupCompleted).toBe(false);
    expect(result.errors).toEqual(['native_validation_checkpoint_missing']);
    runtime.close();
  });
});
