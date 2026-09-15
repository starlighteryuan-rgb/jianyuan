/**
 * Phase M2.2 regression: Awareness history and response correctness.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MobileRuntime } from '../src/runtime/mobile-runtime';
import { openMobileTestRuntime, type MobileTestRuntime } from './support/mobile-test-runtime';
import { AI_API_KEY_SECRET_NAME, ExpoSecureStoreSecretStore } from '../src/runtime/secret-store';
import type { SecureStoreBinding } from '../src/runtime/secret-store';

const temporaryDirectories: string[] = [];
const openRuntimes: MobileTestRuntime[] = [];

const scratchDatabasePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-mobile-m2-2-'));
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

const completion = (value: unknown): Response =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(value) } }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

const suggestion = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  recordRefs: ['record-1', 'record-2'],
  comparisonAxis: {
    question: '两次记录在什么条件下都出现了同样的开始方式？',
    dimension: '开始前的停顿',
  },
  relationType: 'descriptive_similarity',
  evidenceSummary: '两条记录都描述了开始前先停一下的共同结构。',
  assertsTemporalOrdering: false,
  ...overrides,
});

const providerWith = (options?: {
  readonly suggestions?: readonly Record<string, unknown>[];
}): typeof fetch =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/v1/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'test-model' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (!url.endsWith('/v1/chat/completions')) {
      return new Response('{}', { status: 404 });
    }

    const body = JSON.parse(String(init?.body)) as {
      readonly messages: readonly { readonly content: string }[];
    };
    const userPayload = JSON.parse(body.messages[1]?.content ?? '{}') as {
      readonly selectedRecords?: readonly { readonly recordId?: unknown }[];
    };
    const selectedRecordIds = (userPayload.selectedRecords ?? []).flatMap((record) =>
      typeof record.recordId === 'string' ? [record.recordId] : [],
    );
    const withContextRefs = (overrides: Record<string, unknown> = {}): Record<string, unknown> =>
      suggestion({
        ...overrides,
        recordRefs: selectedRecordIds,
      });
    const system = body.messages[0]?.content ?? '';
    if (system.startsWith('You suggest tentative')) {
      return completion({
        status: 'SURFACE',
        language: 'zh-CN',
        suggestions:
          options?.suggestions?.map((entry) => withContextRefs(entry)) ??
          [withContextRefs()],
      });
    }
    if (system.startsWith('Judge only operational comparability')) {
      return completion({
        operationallySpecific: true,
        sameNature: true,
        onlySharedCategory: false,
        explanation: '两条记录比较的是同一种开始前停顿。',
      });
    }
    if (system.startsWith('Check whether this tentative descriptive relation')) {
      return completion({
        prohibitedClaimDetected: false,
        category: null,
        explanation: '只描述可观察的开始结构。',
      });
    }
    if (system.startsWith('Judge the six evidence dimensions')) {
      return completion({
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
          reason: '两条独立记录支持描述性判断。',
        })),
      });
    }
    return completion({ question: '这两次开始前，你注意到了什么？' });
  }) as typeof fetch;

const openRuntime = async (options: {
  readonly location?: string;
  readonly fetch?: typeof fetch;
  readonly secretStore?: SecureStoreBinding & { readonly entries: Map<string, string> };
} = {}): Promise<MobileTestRuntime> => {
  const runtime = await openMobileTestRuntime({
    location: options.location ?? scratchDatabasePath(),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.secretStore === undefined
      ? {}
      : { secretStore: new ExpoSecureStoreSecretStore(options.secretStore) }),
  });
  openRuntimes.push(runtime);
  return runtime;
};

const configureAI = async (
  runtime: MobileRuntime,
  keychain: SecureStoreBinding & { readonly entries: Map<string, string> },
): Promise<void> => {
  keychain.entries.set(AI_API_KEY_SECRET_NAME, 'sk-m2-2-test');
  await runtime.configureAI({
    providerId: 'openai-compatible',
    baseUrl: 'https://provider.example/v1',
    model: 'test-model',
    apiKey: 'sk-m2-2-test',
  });
};

const captureTwo = async (runtime: MobileRuntime): Promise<void> => {
  const first = await runtime.capture('第一次，我开始前先停了一下。');
  const second = await runtime.capture('第二次，我也在开始前先停了一下。');
  expect(first.ok && second.ok).toBe(true);
};

afterEach(async () => {
  for (const runtime of openRuntimes.splice(0)) {
    try {
      await runtime.close();
    } catch {
      // Already closed by a test body.
    }
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Mobile Awareness quality and persistence (M2.2)', () => {
  it('returns no card for a same-day or close-time-only suggestion', async () => {
    const keychain = workingKeychain();
    const fetcher = providerWith({
      suggestions: [
        suggestion({
          comparisonAxis: { question: '两条记录是否在同一天？', dimension: '时间接近' },
          relationType: 'temporal_proximity',
          evidenceSummary: '两条记录在同一天写下，时间也接近。',
        }),
      ],
    });
    const runtime = await openRuntime({ fetch: fetcher, secretStore: keychain });
    await configureAI(runtime.runtime, keychain);
    await captureTwo(runtime.runtime);

    const records = await runtime.runtime.listRecent();
    const experience = await runtime.runtime.suggestRelations(records[0]!.id);

    expect(experience.status).toBe('no_candidate');
    expect(experience.candidates).toEqual([]);
  });

  it('keeps a compliant Chinese observation and rehydrates it after restart', async () => {
    const keychain = workingKeychain();
    const databasePath = scratchDatabasePath();
    const first = await openRuntime({
      location: databasePath,
      fetch: providerWith(),
      secretStore: keychain,
    });
    await configureAI(first.runtime, keychain);
    await captureTwo(first.runtime);

    const records = await first.runtime.listRecent();
    const experience = await first.runtime.suggestRelations(records[0]!.id);
    expect(experience.status).toBe('candidates');
    if (experience.status !== 'candidates') throw new Error('expected candidate');

    const history = await first.runtime.awarenessHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      candidateId: experience.candidates[0]!.candidateId,
      status: 'new',
    });

    await first.close();

    const restarted = await openRuntime({ location: databasePath });
    const restored = await restarted.runtime.awarenessHistory();
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({
      candidateId: experience.candidates[0]!.candidateId,
      status: 'new',
    });
    expect(restored[0]!.candidate.observation).toContain('开始前先停一下');
  });

  it.each([
    ['connected', '很接近'],
    ['different_understanding', '有一点像'],
    ['not_my_experience', '这不是我的体验'],
  ] as const)(
    'persists the exact response value %s (%s) for its own candidate',
    async (meaning, _label) => {
      const keychain = workingKeychain();
      const runtime = await openRuntime({ fetch: providerWith(), secretStore: keychain });
      await configureAI(runtime.runtime, keychain);
      await captureTwo(runtime.runtime);

      const records = await runtime.runtime.listRecent();
      const experience = await runtime.runtime.suggestRelations(records[0]!.id);
      if (experience.status !== 'candidates') throw new Error('expected candidate');
      const candidate = experience.candidates[0]!;

      const result = await runtime.runtime.submitObservationReflection({
        candidateId: candidate.candidateId,
        meaning,
        ...(meaning === 'not_my_experience'
          ? {}
          : { reflectionText: `我选择的回应是 ${meaning}` }),
      });

      if (meaning === 'not_my_experience') {
        expect(result.status).toBe('discarded');
      } else {
        expect(result.status).toBe('discovery');
      }

      const history = await runtime.runtime.awarenessHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        candidateId: candidate.candidateId,
        meaning,
        status: meaning === 'not_my_experience' ? 'dismissed' : 'responded',
      });
      expect(history[0]!.meaning).toBe(meaning);
    },
  );

  it('does not duplicate a card when the same record is requested again', async () => {
    const keychain = workingKeychain();
    const runtime = await openRuntime({ fetch: providerWith(), secretStore: keychain });
    await configureAI(runtime.runtime, keychain);
    await captureTwo(runtime.runtime);

    const records = await runtime.runtime.listRecent();
    const target = records[0]!.id;
    const first = await runtime.runtime.suggestRelations(target);
    const second = await runtime.runtime.suggestRelations(target);

    expect(first.status).toBe('candidates');
    expect(second.status).toBe('candidates');
    const history = await runtime.runtime.awarenessHistory();
    expect(history).toHaveLength(1);
  });
});
