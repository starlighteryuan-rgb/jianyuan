/**
 * Phase M1-A invariant: saving a Record must not call the AI provider.
 *
 * WHY THIS IS TESTED RATHER THAN ASSUMED
 * "AI is a candidate/invitation only" and capture persistence must not depend on
 * AI. If a future refactor wired a provider call into the capture path, Records
 * would become dependent on network availability, an API key, and a model's
 * response — and a failing provider could block or delay a save. The mobile
 * build ships with `DisabledAIProvider`, so this test also guards against the
 * provider being replaced by a real one without revisiting the boundary.
 *
 * HOW IT IS ENFORCED
 * Every method of the provider is replaced with a spy that throws, then a
 * Record is captured through the real runtime and adapter. If anything in the
 * capture path touches the provider, the throw fails the test loudly instead of
 * silently degrading.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { openMobileTestRuntime } from './support/mobile-test-runtime';

const temporaryDirectories: string[] = [];

const scratchDatabasePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-mobile-ai-'));
  temporaryDirectories.push(directory);
  return join(directory, 'jianyuan.sqlite');
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/**
 * Replace every provider entry point with a tripwire.
 *
 * `Object.keys` on the instance covers prototype methods, so a newly added
 * provider method is spied on automatically rather than being silently missed.
 */
const tripwireProvider = (provider: object): readonly string[] => {
  const names = new Set<string>();
  let target: object | null = provider;
  while (target !== null && target !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(target)) {
      if (name !== 'constructor') names.add(name);
    }
    target = Object.getPrototypeOf(target);
  }

  const spied: string[] = [];
  for (const name of names) {
    const current = (provider as Record<string, unknown>)[name];
    if (typeof current !== 'function') continue;
    vi.spyOn(provider as never, name as never).mockImplementation((() => {
      throw new Error(`AI provider method "${name}" was called during Record capture`);
    }) as never);
    spied.push(name);
  }
  return spied;
};

describe('Record capture does not call AI (M1-A)', () => {
  it('saves a Record while every provider method is a tripwire', async () => {
    const runtime = await openMobileTestRuntime({ location: scratchDatabasePath() });

    const spied = tripwireProvider(runtime.composition.ai);
    // Sanity: the tripwire must actually be installed, or the test proves nothing.
    expect(spied.length).toBeGreaterThan(0);

    const result = await runtime.runtime.capture('这条记录不应该触发任何 AI 调用。');

    expect(result.ok).toBe(true);
    expect(await runtime.runtime.listRecent()).toHaveLength(1);
    for (const name of spied) {
      expect(runtime.composition.ai[name as never]).not.toHaveBeenCalled?.();
    }

    await runtime.close();
  });

  it('ships with the AI provider disabled, which is a supported product mode', async () => {
    const runtime = await openMobileTestRuntime({ location: scratchDatabasePath() });

    expect(runtime.composition.ai.providerId).toBe('disabled');
    expect(runtime.composition.ai.enabled).toBe(false);

    await runtime.close();
  });

  it('saves with no API key configured and no SecretStore available', async () => {
    // The default test runtime injects an UnavailableSecretStore, which is the
    // unsigned-build worst case. Saving must still work.
    const runtime = await openMobileTestRuntime({ location: scratchDatabasePath() });

    expect(runtime.runtime.status().secretStore.status).toBe('unavailable');

    const result = await runtime.runtime.capture('即使没有钥匙串也应该能记录。');
    expect(result.ok).toBe(true);
    expect(await runtime.runtime.listRecent()).toHaveLength(1);

    await runtime.close();
  });
});
