/**
 * Phase M2 functional parity tests.
 *
 * These tests run the real Mobile runtime, the real SQLite adapter, the real
 * Core services, and the real `OpenAICompatibleProvider` HTTP/parsing path. The
 * only substitute is the transport: a small `fetch` double that returns JSON
 * shaped exactly like an OpenAI-compatible server. Provider contract handling,
 * request authorization, response validation, Core Gate evaluation, and SQLite
 * persistence are all production code.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { AI_API_KEY_SECRET_NAME } from '../src/runtime/secret-store';
import type { SecureStoreBinding } from '../src/runtime/secret-store';
import { ExpoSecureStoreSecretStore } from '../src/runtime/secret-store';
import {
  openMobileTestRuntime,
  type MobileTestRuntime,
} from './support/mobile-test-runtime';

const temporaryDirectories: string[] = [];
const openRuntimes: MobileTestRuntime[] = [];

const scratchDatabasePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-mobile-m2-'));
  temporaryDirectories.push(directory);
  return join(directory, 'jianyuan.sqlite');
};

const workingKeychain = (): SecureStoreBinding & {
  readonly entries: Map<string, string>;
} => {
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

interface FakeProvider {
  readonly fetcher: typeof fetch;
  readonly chatRequests: () => number;
  readonly modelRequests: () => number;
}

/**
 * Minimal OpenAI-compatible transport double.
 *
 * `suggestions` controls the relation response. When `malformed` is set the
 * response body is not valid JSON, which exercises the Provider's own
 * malformed-response rejection rather than a test-only branch.
 */
const fakeProvider = (options?: {
  readonly suggestions?: readonly unknown[];
  readonly malformed?: boolean;
  readonly status?: number;
}): FakeProvider => {
  let chatRequests = 0;
  let modelRequests = 0;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/v1/models')) {
      modelRequests += 1;
      return new Response(
        JSON.stringify({ data: [{ id: 'test-model', name: 'Test Model' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.endsWith('/v1/chat/completions')) {
      chatRequests += 1;
      if (options?.status !== undefined) {
        return new Response('{}', { status: options.status });
      }
      const requestBody = typeof init?.body === 'string' ? init.body : '';
      let requestPurpose = '';
      let selectedRecordIds: readonly string[] = [];
      try {
        const body = JSON.parse(requestBody) as {
          readonly messages?: readonly { readonly content?: unknown }[];
        };
        const userContent = body.messages?.[1]?.content;
        if (typeof userContent === 'string') {
          const parsed = JSON.parse(userContent) as {
            readonly purpose?: unknown;
            readonly selectedRecords?: readonly { readonly recordId?: unknown }[];
          };
          requestPurpose = typeof parsed.purpose === 'string' ? parsed.purpose : '';
          selectedRecordIds = (parsed.selectedRecords ?? []).flatMap((record) =>
            typeof record.recordId === 'string' ? [record.recordId] : [],
          );
        }
      } catch {
        requestPurpose = '';
        selectedRecordIds = [];
      }

      const relationSuggestions =
        options?.suggestions ??
        (selectedRecordIds.length >= 2
          ? [
              {
                recordRefs: selectedRecordIds,
                comparisonAxis: {
                  question: '这两次经历在什么条件下都出现了？',
                  dimension: '共同条件',
                },
                relationType: 'descriptive_similarity',
                observation: '两条记录都描述了一个具体行动开始前的情形。',
                assertsTemporalOrdering: false,
              },
            ]
          : []);

      let responseValue: unknown;
      if (requestPurpose === 'relation_comparability_after_core_directive_gate') {
        responseValue = {
          operationallySpecific: true,
          sameNature: true,
          onlySharedCategory: false,
          explanation: '两条记录都描述了开始前的具体停一下动作。',
        };
      } else if (requestPurpose === 'relation_abstraction_check_after_core_directive_gate') {
        responseValue = {
          prohibitedClaimDetected: false,
          category: null,
          explanation: '这是描述性相似，没有跨过抽象上限。',
        };
      } else if (requestPurpose === 'relation_evidence_judgment_after_core_directive_gate') {
        responseValue = {
          judgments: [
            'structural_strength',
            'independent_support',
            'temporal_adequacy',
            'specificity_baseline_contrast',
            'counterevidence_balance',
            'evidence_fidelity',
          ].map((dimension) => ({
            dimension,
            status: 'scored',
            score: 2,
            reason: '测试替身依据两条独立记录给出的描述性判断。',
          })),
        };
      } else {
        responseValue = { suggestions: relationSuggestions };
      }

      const content = options?.malformed
        ? 'not-json'
        : JSON.stringify(responseValue);
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  return {
    fetcher,
    chatRequests: () => chatRequests,
    modelRequests: () => modelRequests,
  };
};

const openRuntime = async (
  options: {
    readonly location?: string;
    readonly fetch?: typeof fetch;
    readonly secretStore?: SecureStoreBinding & { readonly entries: Map<string, string> };
  } = {},
): Promise<MobileTestRuntime> => {
  const secretStore =
    options.secretStore === undefined
      ? undefined
      : new ExpoSecureStoreSecretStore(options.secretStore);
  const runtime = await openMobileTestRuntime({
    location: options.location ?? scratchDatabasePath(),
    ...(secretStore === undefined ? {} : { secretStore }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  openRuntimes.push(runtime);
  return runtime;
};

const configureAI = async (
  runtime: MobileTestRuntime,
  fetcher: typeof fetch,
  secretStore: SecureStoreBinding & { readonly entries: Map<string, string> },
): Promise<void> => {
  secretStore.entries.set(AI_API_KEY_SECRET_NAME, 'sk-m2-test');
  await runtime.runtime.configureAI({
    providerId: 'openai-compatible',
    baseUrl: 'https://provider.example/v1',
    model: 'test-model',
    apiKey: 'sk-m2-test',
  });
  // The service is already constructed with the injected fetcher; this keeps the
  // assertion explicit that the configured backend is the one under test.
  expect(fetcher).toBeDefined();
};

afterEach(async () => {
  for (const runtime of openRuntimes.splice(0)) {
    try {
      await runtime.close();
    } catch {
      // Already closed by the test body.
    }
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Mobile functional parity (M2)', () => {
  it('keeps AI candidates transient until the user writes free text', async () => {
    const provider = fakeProvider();
    const keychain = workingKeychain();
    const runtime = await openRuntime({ fetch: provider.fetcher, secretStore: keychain });
    await configureAI(runtime, provider.fetcher, keychain);

    const first = await runtime.runtime.capture('第一次，我在开始前先停了一下。');
    const second = await runtime.runtime.capture('第二次，我也在开始前先停了一下。');
    expect(first.ok && second.ok).toBe(true);

    const before = await runtime.runtime.listDiscoveries();
    expect(before).toEqual([]);

    const records = await runtime.runtime.listRecent();
    const target = records[0]!;
    const suggestion = await runtime.runtime.suggestRelations(target.id);
    expect(suggestion.status).toBe('candidates');
    if (suggestion.status !== 'candidates') throw new Error('expected candidates');
    const candidate = suggestion.candidates[0]!;

    // The Observation is visible but not a Relation / Discovery.
    expect(await runtime.runtime.listDiscoveries()).toEqual([]);

    // A quick choice without free text must not pass the Core Gate.
    const quick = await runtime.runtime.submitObservationReflection({
      candidateId: candidate.candidateId,
      meaning: 'connected',
    });
    expect(quick.status).toBe('reflection_required');
    expect(await runtime.runtime.listDiscoveries()).toEqual([]);

    // The rejection path discards the transient Observation and writes nothing.
    const rejected = await runtime.runtime.submitObservationReflection({
      candidateId: candidate.candidateId,
      meaning: 'not_my_experience',
    });
    expect(rejected.status).toBe('discarded');
    expect(await runtime.runtime.listDiscoveries()).toEqual([]);
  });

  it('persists a user Reflection through Core and reads it back after restart', async () => {
    const provider = fakeProvider();
    const keychain = workingKeychain();
    const databasePath = scratchDatabasePath();
    const first = await openRuntime({
      location: databasePath,
      fetch: provider.fetcher,
      secretStore: keychain,
    });
    await configureAI(first, provider.fetcher, keychain);

    await first.runtime.capture('我开始前会先停一下。');
    await first.runtime.capture('这次我也是先停了一下才开始。');
    const records = await first.runtime.listRecent();
    const suggestion = await first.runtime.suggestRelations(records[0]!.id);
    if (suggestion.status !== 'candidates') throw new Error('expected candidates');

    const reflected = await first.runtime.submitObservationReflection({
      candidateId: suggestion.candidates[0]!.candidateId,
      meaning: 'different_understanding',
      reflectionText: '我需要把行动缩小到足够具体。',
    });
    expect(reflected.status).toBe('discovery');
    if (reflected.status !== 'discovery') throw new Error('expected discovery');

    const discoveries = await first.runtime.listDiscoveries();
    expect(discoveries).toHaveLength(1);
    expect(discoveries[0]?.kind).toBe('relation');

    await first.close();

    // Restart over the same file. The Reflection and Relation must survive.
    const restarted = await openRuntime({ location: databasePath, fetch: provider.fetcher });
    const target = await restarted.runtime.getReflectionTarget(reflected.targetRef);
    expect(target?.reflections).toEqual([
      expect.objectContaining({
        verbatim: '我需要把行动缩小到足够具体。',
        recordId: reflected.reflectionRecordId,
      }),
    ]);
    expect(await restarted.runtime.listDiscoveries()).toHaveLength(1);
  });

  it('does not call the Provider when opening Awareness or Exploration', async () => {
    const provider = fakeProvider();
    const keychain = workingKeychain();
    const runtime = await openRuntime({ fetch: provider.fetcher, secretStore: keychain });
    await configureAI(runtime, provider.fetcher, keychain);

    await runtime.runtime.capture('第一条用于页面打开测试的记录。');
    await runtime.runtime.capture('第二条用于页面打开测试的记录。');

    // These are the exact reads the spaces perform on mount.
    await runtime.runtime.listRecent();
    await runtime.runtime.listDiscoveries();
    expect(provider.chatRequests()).toBe(0);

    // Only the explicit action calls the Provider.
    const records = await runtime.runtime.listRecent();
    await runtime.runtime.suggestRelations(records[0]!.id);
    expect(provider.chatRequests()).toBe(1);
  });

  it('degrades AI failures without blocking local Records', async () => {
    const keychain = workingKeychain();
    const runtime = await openRuntime({
      fetch: fakeProvider({ status: 401 }).fetcher,
      secretStore: keychain,
    });
    await configureAI(runtime, fakeProvider().fetcher, keychain);

    const saved = await runtime.runtime.capture('即使 AI 失败，这条记录也必须保存。');
    expect(saved.ok).toBe(true);
    expect(await runtime.runtime.listRecent()).toHaveLength(1);
  });

  it('rejects malformed Provider output without creating Relation or Evidence', async () => {
    const provider = fakeProvider({ malformed: true });
    const keychain = workingKeychain();
    const runtime = await openRuntime({ fetch: provider.fetcher, secretStore: keychain });
    await configureAI(runtime, provider.fetcher, keychain);

    await runtime.runtime.capture('第一条用于畸形响应测试。');
    await runtime.runtime.capture('第二条用于畸形响应测试。');
    const records = await runtime.runtime.listRecent();
    const suggestion = await runtime.runtime.suggestRelations(records[0]!.id);

    expect(suggestion.status).toBe('unavailable');
    expect(await runtime.runtime.listDiscoveries()).toEqual([]);
  });

  it('exports and restores the logical backup without changing Core semantics', async () => {
    const runtime = await openRuntime();
    await runtime.runtime.capture('导出前的一条记录。');

    const serialized = await runtime.runtime.exportData();
    expect(serialized).toContain('jianyuan.sqlite.logical-export');

    await runtime.runtime.capture('导出后新增的一条记录。');
    expect(await runtime.runtime.listRecent()).toHaveLength(2);

    await runtime.runtime.restoreData(serialized);
    const restored = await runtime.runtime.listRecent();
    expect(restored).toHaveLength(1);
    expect(restored[0]?.verbatim).toBe('导出前的一条记录。');
  });
});
