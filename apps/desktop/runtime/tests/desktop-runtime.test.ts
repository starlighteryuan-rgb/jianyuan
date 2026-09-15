import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { EVIDENCE_DIMENSIONS } from '../../../../packages/core/index';
import { DesktopRuntime } from '../desktop-runtime';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const fakeOpenAI = () => {
  let modelRequests = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/models')) {
      modelRequests += 1;
      return new Response(
        JSON.stringify({ data: [{ id: 'desktop-spike-model', owned_by: 'fake' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    const request = JSON.parse(String(init?.body)) as {
      readonly messages: readonly { readonly role: string; readonly content: string }[];
    };
    const system = request.messages[0]?.content ?? '';
    const user = JSON.parse(request.messages[1]?.content ?? '{}') as {
      readonly selectedRecords?: readonly { readonly recordId: string }[];
    };
    let content: unknown;
    if (system.startsWith('You suggest tentative')) {
      content = {
        suggestions: [
          {
            recordRefs: user.selectedRecords?.map((record) => record.recordId) ?? [],
            comparisonAxis: {
              question: '两次记录是否都从具体行动开始？',
              dimension: '行动启动顺序',
            },
            relationType: 'action_sequence',
            evidenceSummary: '两条记录都描述了一个具体开始动作。',
            assertsTemporalOrdering: false,
          },
        ],
      };
    } else if (system.startsWith('Judge only operational comparability')) {
      content = {
        operationallySpecific: true,
        sameNature: true,
        onlySharedCategory: false,
        explanation: '两条记录比较同一种行动启动方式。',
      };
    } else if (system.startsWith('Check whether this tentative descriptive relation')) {
      content = {
        prohibitedClaimDetected: false,
        category: null,
        explanation: '只描述行动结构，没有推断身份或人格。',
      };
    } else if (system.startsWith('Judge the six evidence dimensions')) {
      content = {
        judgments: EVIDENCE_DIMENSIONS.map((dimension) => ({
          dimension,
          status: 'scored',
          score: 2,
          reason: 'Desktop fake verifies Provider V1 integration only.',
        })),
      };
    } else if (system.startsWith('Create one brief reflection invitation')) {
      content = { question: '这两次开始行动时，你注意到了什么共同点？' };
    } else {
      content = {
        prohibitedClaimDetected: false,
        category: null,
        explanation: 'No prohibited abstraction in the fake response.',
      };
    }

    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  return { fetcher, modelRequests: () => modelRequests };
};

describe('Desktop Runtime Spike', () => {
  it('reuses Provider V1 discovery/cache and persists the Core graph across restart', async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), 'jianyuan-desktop-spike-'));
    directories.push(appDataDir);
    const fake = fakeOpenAI();
    const first = new DesktopRuntime({
      appDataDir,
      apiKey: 'fake-key-not-a-real-provider-secret',
      fetcher: fake.fetcher,
    });

    first.configureAI({
      providerId: 'openai-compatible',
      baseUrl: 'https://fake-provider-a.invalid',
      model: 'desktop-spike-model',
    });
    expect((await first.discoverModels(true)).discoverySource).toBe('upstream');
    expect((await first.discoverModels(false)).discoverySource).toBe('cache');
    expect(fake.modelRequests()).toBe(1);
    first.selectModel('manual-model-fallback');
    expect(first.composition.ai.getManualModelId()).toBe('manual-model-fallback');
    expect((await first.discoverModels(false)).discoverySource).toBe('cache');
    expect(fake.modelRequests()).toBe(1);

    first.configureAI({
      providerId: 'openai-compatible',
      baseUrl: 'https://fake-provider-b.invalid',
      model: 'manual-model-fallback',
    });
    expect(first.composition.ai.getManualModelId()).toBe('manual-model-fallback');
    expect((await first.testAIConnection()).status).toBe('connected');
    expect(fake.modelRequests()).toBe(2);

    expect((await first.capture('我先写下一个最小动作。')).ok).toBe(true);
    expect((await first.capture('第二次我也先做了最小动作。')).ok).toBe(true);
    const initialRecords = await first.listRecords();
    expect(initialRecords).toHaveLength(2);

    const suggestions = await first.suggestRelations(
      initialRecords.map((record) => record.id),
    );
    expect(suggestions).toHaveLength(1);
    expect((await first.submitObservationReflection({
      suggestion: suggestions[0]!,
      meaning: 'connected',
    })).status).toBe('reflection_required');
    expect((await first.submitObservationReflection({
      suggestion: suggestions[0]!,
      meaning: 'not_my_experience',
    })).status).toBe('discarded');
    const freshSuggestions = await first.suggestRelations(
      initialRecords.map((record) => record.id),
    );
    expect(freshSuggestions).toHaveLength(1);
    const reflected = await first.submitObservationReflection({
      suggestion: freshSuggestions[0]!,
      meaning: 'different_understanding',
      reflectionText: '我需要先把行动缩小到足够具体。',
    });
    expect(reflected.status).toBe('discovery');
    if (reflected.status !== 'discovery') throw new Error('no discovery');
    const targetRef = reflected.targetRef;
    expect(targetRef).toBeTruthy();
    expect(await first.listDiscoveries()).toEqual([
      expect.objectContaining({
        kind: 'relation',
        subject: expect.objectContaining({ id: targetRef }),
      }),
    ]);
    expect(first.listAIInsightAudit()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'openai-compatible',
          inputRecordIds: expect.arrayContaining(initialRecords.map((record) => record.id)),
        }),
      ]),
    );
    expect(JSON.stringify(first.listAIInsightAudit())).not.toContain('fake-key-not-a-real-provider-secret');
    expect(reflected.reflectionRecordId).toBeTruthy();
    expect(first.status().databasePath).toBe(join(appDataDir, 'jianyuan.sqlite'));
    expect(first.status().encryption.deviceLevelVerified).toBe(false);
    first.close();

    const restarted = new DesktopRuntime({
      appDataDir,
      fetcher: fake.fetcher,
    });
    expect(restarted.status().ai.status).toBe('unconfigured');
    expect(await restarted.listRecords()).toHaveLength(3);
    expect(await restarted.listRecords('缩小')).toEqual([
      expect.objectContaining({ id: reflected.reflectionRecordId }),
    ]);
    expect(
      (await restarted.getReflectionTarget(targetRef))?.reflections,
    ).toEqual([
      expect.objectContaining({
        verbatim: '我需要先把行动缩小到足够具体。',
        recordId: reflected.reflectionRecordId,
      }),
    ]);
    await expect(
      restarted.suggestRelations(initialRecords.map((record) => record.id)),
    ).rejects.toThrow();
    expect((await restarted.capture('AI 暂时不可用时仍可 Capture。')).ok).toBe(true);
    const exported = restarted.exportData();
    restarted.restoreData(exported);
    expect(await restarted.listRecords()).toHaveLength(4);
    restarted.close();
  });

  it('rejects adversarial Provider drift before Desktop presentation', async () => {
    const appDataDir = mkdtempSync(join(tmpdir(), 'jianyuan-desktop-drift-'));
    directories.push(appDataDir);
    const runtime = new DesktopRuntime({ appDataDir });
    expect((await runtime.capture('一条用于边界测试的记录。')).ok).toBe(true);
    expect((await runtime.capture('另一条用于边界测试的记录。')).ok).toBe(true);
    const records = await runtime.listRecords();
    const unsafe = vi.spyOn(runtime.composition.ai, 'suggestRelations').mockResolvedValue({
      ok: true,
      value: [{
        kind: 'relation_candidate',
        recordRefs: records.map((record) => record.id),
        comparisonAxis: {
          question: '这些记录是否有相似的开始方式？',
          dimension: '行动启动顺序',
        },
        relationType: 'possible_action_sequence',
        evidenceSummary: '你本质上是一个追求完美的人。',
        assertsTemporalOrdering: false,
      }],
    });

    await expect(runtime.suggestRelations(records.map((record) => record.id)))
      .rejects.toThrow('cannot be safely shown');
    expect(runtime.listAIInsightAudit()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcome: 'error', errorType: 'malformed_response' }),
      ]),
    );
    unsafe.mockRestore();
    runtime.close();
  });
});
