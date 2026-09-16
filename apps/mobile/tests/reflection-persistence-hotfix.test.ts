/**
 * M2 hotfix: Awareness -> User Reflection -> Understanding persistence.
 *
 * The bug was orchestration order: Mobile only wrote the user's free text after
 * the Relation Gate admitted a Relation. A rejected Gate therefore discarded the
 * user's words. These tests pin the corrected order:
 *
 *   free text -> Core Reflection persistence -> optional Relation Gate
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { AI_API_KEY_SECRET_NAME } from '../src/runtime/secret-store';
import {
  ExpoSecureStoreSecretStore,
  type SecureStoreBinding,
} from '../src/runtime/secret-store';
import {
  openMobileTestRuntime,
  type MobileTestRuntime,
} from './support/mobile-test-runtime';

const temporaryDirectories: string[] = [];
const openRuntimes: MobileTestRuntime[] = [];

const scratchDatabasePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-mobile-reflection-hotfix-'));
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
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

const providerWith = (options?: {
  readonly admitRelation?: boolean;
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
    const system = body.messages[0]?.content ?? '';
    const userPayload = JSON.parse(body.messages[1]?.content ?? '{}') as {
      readonly selectedRecords?: readonly { readonly recordId?: unknown }[];
    };
    const selectedRecordIds = (userPayload.selectedRecords ?? []).flatMap((record) =>
      typeof record.recordId === 'string' ? [record.recordId] : [],
    );

    if (system.startsWith('You suggest a tentative')) {
      return completion({
        status: 'SURFACE',
        language: 'zh-CN',
        suggestions:
          selectedRecordIds.length < 2
            ? []
            : [
                {
                  recordRefs: selectedRecordIds,
                  comparisonAxis: {
                    question: '这两次经历在什么条件下出现了同样的行动？',
                    dimension: '行动条件',
                  },
                  relationType: 'descriptive_similarity',
                  observation: '两条记录都描述了一个开始前的具体动作。',
                  assertsTemporalOrdering: false,
                },
              ],
      });
    }

    if (system.startsWith('Judge only operational comparability')) {
      return completion({
        operationallySpecific: true,
        sameNature: true,
        onlySharedCategory: false,
        explanation: '两条记录描述的是同一类具体动作。',
      });
    }

    if (system.startsWith('Check whether this tentative descriptive relation')) {
      return completion({
        prohibitedClaimDetected: false,
        category: null,
        explanation: '描述保持在可观察的动作层面。',
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
          ...(options?.admitRelation === false
            ? {
                status: 'unavailable' as const,
                reason: '测试要求 Core Gate 不形成长期联系。',
              }
            : {
                status: 'scored' as const,
                score: 2,
                reason: '两条独立记录支持这个描述性判断。',
              }),
        })),
      });
    }

    return completion({
      status: 'NO_OBSERVATION',
      language: 'zh-CN',
      suggestions: [],
    });
  }) as typeof fetch;

const openRuntime = async (options: {
  readonly location?: string;
  readonly fetch?: typeof fetch;
  readonly secretStore?: SecureStoreBinding & { readonly entries: Map<string, string> };
} = {}): Promise<MobileTestRuntime> => {
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
  keychain: SecureStoreBinding & { readonly entries: Map<string, string> },
): Promise<void> => {
  keychain.entries.set(AI_API_KEY_SECRET_NAME, 'sk-m2-hotfix-test');
  await runtime.runtime.configureAI({
    providerId: 'openai-compatible',
    baseUrl: 'https://provider.example/v1',
    model: 'test-model',
    apiKey: 'sk-m2-hotfix-test',
  });
};

const captureTwo = async (runtime: MobileTestRuntime): Promise<void> => {
  const first = await runtime.runtime.capture('第一次，我在开始前先停了一下。');
  const second = await runtime.runtime.capture('第二次，我也在开始前先停了一下。');
  expect(first.ok && second.ok).toBe(true);
};

const candidateFor = async (runtime: MobileTestRuntime) => {
  const records = await runtime.runtime.listRecent();
  const experience = await runtime.runtime.suggestRelations(records[0]!.id);
  if (experience.status !== 'candidates') throw new Error('expected a candidate');
  return experience.candidates[0]!;
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

describe('Mobile Awareness -> Reflection -> Understanding hotfix', () => {
  it.each([
    ['connected', '很接近', '我确实经常在快成功的时候开始怀疑自己。'],
    ['different_understanding', '有一点像', '我觉得不是失败本身，而是临近结束时会紧张。'],
  ] as const)(
    'persists %s (%s) free text and exposes it to Understanding',
    async (meaning, _label, reflectionText) => {
      const keychain = workingKeychain();
      const runtime = await openRuntime({ fetch: providerWith(), secretStore: keychain });
      await configureAI(runtime, keychain);
      await captureTwo(runtime);

      const candidate = await candidateFor(runtime);
      const result = await runtime.runtime.submitObservationReflection({
        candidateId: candidate.candidateId,
        meaning,
        reflectionText,
      });

      expect(result.status).toBe('discovery');
      if (result.status !== 'discovery') throw new Error('expected discovery');

      const target = await runtime.runtime.getReflectionTarget(result.targetRef);
      expect(target?.reflections).toEqual([
        expect.objectContaining({ verbatim: reflectionText }),
      ]);

      const understanding = await runtime.runtime.listUnderstandingReflections();
      expect(understanding).toEqual([
        expect.objectContaining({
          targetRef: result.targetRef,
          verbatim: reflectionText,
          relatedToRelation: true,
        }),
      ]);
    },
  );

  it('keeps the Reflection when the Core Gate admits no Relation', async () => {
    const keychain = workingKeychain();
    const runtime = await openRuntime({
      fetch: providerWith({ admitRelation: false }),
      secretStore: keychain,
    });
    await configureAI(runtime, keychain);
    await captureTwo(runtime);

    const candidate = await candidateFor(runtime);
    const reflectionText = '我先不把它当成一条长期联系，但这段话确实是我想说的。';
    const result = await runtime.runtime.submitObservationReflection({
      candidateId: candidate.candidateId,
      meaning: 'different_understanding',
      reflectionText,
    });

    expect(result.status).toBe('reflection_saved');
    expect(await runtime.runtime.listDiscoveries()).toEqual([]);

    const understanding = await runtime.runtime.listUnderstandingReflections();
    expect(understanding).toEqual([
      expect.objectContaining({
        verbatim: reflectionText,
        relatedToRelation: false,
      }),
    ]);
  });

  it('keeps the Reflection after the runtime is reopened', async () => {
    const keychain = workingKeychain();
    const databasePath = scratchDatabasePath();
    const first = await openRuntime({
      location: databasePath,
      fetch: providerWith({ admitRelation: false }),
      secretStore: keychain,
    });
    await configureAI(first, keychain);
    await captureTwo(first);

    const candidate = await candidateFor(first);
    const reflectionText = '重启之后，我仍然希望看到自己的这段话。';
    const result = await first.runtime.submitObservationReflection({
      candidateId: candidate.candidateId,
      meaning: 'connected',
      reflectionText,
    });
    expect(result.status).toBe('reflection_saved');

    await first.close();

    const restarted = await openRuntime({ location: databasePath });
    const understanding = await restarted.runtime.listUnderstandingReflections();
    expect(understanding).toEqual([
      expect.objectContaining({
        verbatim: reflectionText,
        relatedToRelation: false,
      }),
    ]);
  });

  it('uses the same persistence path for Automatic Awareness items', async () => {
    const keychain = workingKeychain();
    const runtime = await openRuntime({
      fetch: providerWith({ admitRelation: false }),
      secretStore: keychain,
    });
    await configureAI(runtime, keychain);
    await runtime.runtime.setAutomaticAwarenessEnabled(true);
    await captureTwo(runtime);
    await runtime.runtime.runScheduledAutomaticAwareness();

    const [item] = await runtime.runtime.awarenessHistory();
    if (item === undefined) throw new Error('expected an automatic awareness item');

    const reflectionText = '自动觉察也需要走同一套保存路径。';
    const result = await runtime.runtime.submitObservationReflection({
      candidateId: item.candidateId,
      meaning: 'connected',
      reflectionText,
    });

    expect(result.status).toBe('reflection_saved');
    expect(await runtime.runtime.listUnderstandingReflections()).toEqual([
      expect.objectContaining({ verbatim: reflectionText }),
    ]);
  });

  it('does not duplicate a Reflection when confirm is submitted twice', async () => {
    const keychain = workingKeychain();
    const runtime = await openRuntime({
      fetch: providerWith({ admitRelation: false }),
      secretStore: keychain,
    });
    await configureAI(runtime, keychain);
    await captureTwo(runtime);

    const candidate = await candidateFor(runtime);
    const reflectionText = '这段话只能保存一次。';
    const first = runtime.runtime.submitObservationReflection({
      candidateId: candidate.candidateId,
      meaning: 'connected',
      reflectionText,
    });
    const second = runtime.runtime.submitObservationReflection({
      candidateId: candidate.candidateId,
      meaning: 'connected',
      reflectionText,
    });
    const [left, right] = await Promise.all([first, second]);
    const results = [left, right];

    expect(results.map((result) => result.status).sort()).toEqual([
      'expired',
      'reflection_saved',
    ]);
    expect(await runtime.runtime.listUnderstandingReflections()).toEqual([
      expect.objectContaining({ verbatim: reflectionText }),
    ]);
  });
});
