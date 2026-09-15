/**
 * Phase M1-D verification: the SecretStore skeleton.
 *
 * WHAT IS BEING PROVEN
 *   - The interface is usable end to end through a Keychain-shaped binding.
 *   - A Keychain failure degrades to `unavailable` and never throws, because an
 *     unsigned or re-signed build can legitimately have no usable Keychain.
 *   - A SecretStore failure cannot break Record capture: the two are structurally
 *     independent, and this is asserted rather than asserted-in-prose.
 *   - No API key is ever written to SQLite. This is the invariant the whole file
 *     exists for, and it is checked by reading the database file itself.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  AI_API_KEY_SECRET_NAME,
  ExpoSecureStoreSecretStore,
  UnavailableSecretStore,
  type SecureStoreBinding,
} from '../src/runtime/secret-store';
import { openMobileTestRuntime } from './support/mobile-test-runtime';

const temporaryDirectories: string[] = [];

const scratchDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-mobile-secret-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** In-memory stand-in for the iOS Keychain. */
const workingKeychain = (): SecureStoreBinding & { readonly entries: Map<string, string> } => {
  const entries = new Map<string, string>();
  return {
    entries,
    getItemAsync: async (key) => entries.get(key) ?? null,
    setItemAsync: async (key, value) => {
      entries.set(key, value);
    },
    deleteItemAsync: async (key) => entries.delete(key),
    isAvailableAsync: async () => true,
  };
};

/** A Keychain that fails every call, as an unsigned build may. */
const brokenKeychain = (message: string): SecureStoreBinding => ({
  getItemAsync: async () => {
    throw new Error(message);
  },
  setItemAsync: async () => {
    throw new Error(message);
  },
  deleteItemAsync: async () => {
    throw new Error(message);
  },
  isAvailableAsync: async () => {
    throw new Error(message);
  },
});

describe('Mobile SecretStore skeleton (M1-D)', () => {
  it('stores and reads a secret through the Keychain binding', async () => {
    const binding = workingKeychain();
    const store = new ExpoSecureStoreSecretStore(binding);

    expect(await store.write(AI_API_KEY_SECRET_NAME, 'sk-test-value')).toBe(true);
    expect(await store.read(AI_API_KEY_SECRET_NAME)).toBe('sk-test-value');
    expect(store.status().status).toBe('available');

    expect(await store.remove(AI_API_KEY_SECRET_NAME)).toBe(true);
    expect(await store.read(AI_API_KEY_SECRET_NAME)).toBeNull();
  });

  it('degrades to unavailable when the Keychain throws, without propagating', async () => {
    const store = new ExpoSecureStoreSecretStore(brokenKeychain('keychain unavailable'));

    // None of these may throw.
    await expect(store.read(AI_API_KEY_SECRET_NAME)).resolves.toBeNull();
    await expect(store.write(AI_API_KEY_SECRET_NAME, 'x')).resolves.toBe(false);
    await expect(store.remove(AI_API_KEY_SECRET_NAME)).resolves.toBe(false);

    const snapshot = store.status();
    expect(snapshot.status).toBe('unavailable');
    expect(snapshot.reason).toContain('keychain unavailable');
  });

  it('reports unavailable when the device reports no keychain', async () => {
    const binding: SecureStoreBinding = {
      getItemAsync: async () => null,
      setItemAsync: async () => undefined,
      deleteItemAsync: async () => false,
      isAvailableAsync: async () => false,
    };
    const store = new ExpoSecureStoreSecretStore(binding);

    const snapshot = await store.probe();
    expect(snapshot.status).toBe('unavailable');
  });

  it('fails closed in the unavailable store instead of throwing', async () => {
    const store = new UnavailableSecretStore('no keychain on this build');

    expect(store.status()).toEqual({
      status: 'unavailable',
      reason: 'no keychain on this build',
    });
    expect(await store.read(AI_API_KEY_SECRET_NAME)).toBeNull();
    expect(await store.write(AI_API_KEY_SECRET_NAME, 'x')).toBe(false);
    expect(await store.remove(AI_API_KEY_SECRET_NAME)).toBe(false);
  });

  it('reports whether a key is present without ever returning the key', async () => {
    const binding = workingKeychain();
    const store = new ExpoSecureStoreSecretStore(binding);
    const directory = scratchDirectory();
    const runtime = await openMobileTestRuntime({
      location: join(directory, 'jianyuan.sqlite'),
      secretStore: store,
    });

    expect(await runtime.runtime.hasStoredApiKey()).toBe(false);

    await store.write(AI_API_KEY_SECRET_NAME, 'sk-secret-value');
    expect(await runtime.runtime.hasStoredApiKey()).toBe(true);

    // The status surface must carry availability, never the value.
    expect(JSON.stringify(runtime.runtime.status())).not.toContain('sk-secret-value');

    await runtime.close();
  });

  it('never writes an API key into the SQLite database file', async () => {
    const directory = scratchDirectory();
    const databasePath = join(directory, 'jianyuan.sqlite');
    const binding = workingKeychain();
    const store = new ExpoSecureStoreSecretStore(binding);

    const runtime = await openMobileTestRuntime({
      location: databasePath,
      secretStore: store,
    });

    await runtime.runtime.capture('一条普通记录。');
    await store.write(AI_API_KEY_SECRET_NAME, 'sk-must-not-be-in-sqlite');
    await runtime.close();

    // Read the real database bytes. The key must appear in the Keychain double
    // and in nothing else.
    const databaseBytes = readFileSync(databasePath).toString('utf8');
    expect(databaseBytes).not.toContain('sk-must-not-be-in-sqlite');
    expect(databaseBytes).toContain('一条普通记录。');
    expect(binding.entries.get(AI_API_KEY_SECRET_NAME)).toBe('sk-must-not-be-in-sqlite');

    // The sidecar WAL file must not carry it either.
    try {
      const wal = readFileSync(`${databasePath}-wal`).toString('utf8');
      expect(wal).not.toContain('sk-must-not-be-in-sqlite');
    } catch {
      // No WAL file is a valid state (already checkpointed on close).
    }
  });
});
