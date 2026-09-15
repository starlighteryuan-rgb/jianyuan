import { describe, expect, it, vi } from 'vitest';

import {
  recordId,
  type RelationClaimCandidate,
} from '../packages/core/index';
import { DisabledAIProvider, OpenAICompatibleProvider } from '../packages/providers/ai/index';
import { DeterministicSemanticJudgmentAdapter } from '../packages/providers/deterministic/index';
import {
  createAIReflectionInvitation,
  RelationCandidateRegistry,
  suggestRelationsAfterCapture,
} from '@/server/ai-core-experience';
import {
  createCoreMemoryCaptureComposition,
  type CoreIdGenerator,
} from '@/server/capture-composition-root';
import { executeCapture } from '@/server/capture-use-case';

class ExperienceIds implements CoreIdGenerator {
  private readonly sequences = new Map<string, number>();
  private next(prefix: string): string {
    const value = (this.sequences.get(prefix) ?? 0) + 1;
    this.sequences.set(prefix, value);
    return `${prefix}_experience_${value}`;
  }
  nextRecordId = () => this.next('rec');
  nextEvidenceUnitId = () => this.next('eu');
  nextLineageEdgeId = () => this.next('edge');
  nextDirectiveId = () => this.next('dir');
  nextRelationClaimId = () => this.next('rc');
  nextHypothesisId = () => this.next('hyp');
  nextDiscoveryId = () => this.next('disc');
  nextStateAssignmentId = () => this.next('state');
  nextReflectionEpisodeId = () => this.next('ep');
  nextUserReflectionRecordId = () => this.next('urr');
}

const capture = async (
  graph: ReturnType<typeof createCoreMemoryCaptureComposition>,
  verbatim: string,
  submissionId: string,
  at: string,
) =>
  executeCapture(graph.ingestion, {
    verbatim,
    submissionId,
    submittedAt: new Date(at),
    capturedAt: new Date(at),
  });

describe('AI-native product orchestration boundaries', () => {
  it('keeps user Reflection available when AI is disabled', async () => {
    const candidate: RelationClaimCandidate = {
      recordRefs: [recordId('rec_experience_1'), recordId('rec_experience_2')],
      comparisonAxis: {
        question: '两次是否都从一个小动作开始？',
        dimension: '行动启动顺序',
      },
      relationType: 'possible_action_sequence',
      evidenceSummary: '两条记录都描述了一个起始动作。',
      assertsTemporalOrdering: false,
    };
    const provider = new DisabledAIProvider();
    const graph = createCoreMemoryCaptureComposition(undefined, {
      ids: new ExperienceIds(),
      hash: (value) => `disabled:${value}`,
      judgment: new DeterministicSemanticJudgmentAdapter({
        candidates: [candidate],
        defaultScore: 3,
      }),
      aiRuntime: { provider, judgment: provider },
    });
    const first = await capture(
      graph,
      '我先写下了第一步。',
      '123e4567-e89b-42d3-a456-426614174301',
      '2026-09-14T03:00:00.000Z',
    );
    const second = await capture(
      graph,
      '这次我也先做了一个最小动作。',
      '123e4567-e89b-42d3-a456-426614174302',
      '2026-09-14T03:01:00.000Z',
    );
    if (!first.ok || !second.ok) throw new Error('capture failed');

    const relation = await graph.relations.evaluate({
      recordRefs: [recordId(first.value.recordId), recordId(second.value.recordId)],
      subject: {
        topicTags: [],
        source: 'capture_ui',
        relationAxes: ['行动启动顺序'],
        userSelectedRefs: [first.value.recordId, second.value.recordId],
        createdAt: new Date('2026-09-14T03:02:00.000Z'),
      },
      baselineContext: {
        hasReliablePersonalBaseline: true,
        recordSuppliesInternalBaseline: false,
      },
      now: new Date('2026-09-14T03:02:00.000Z'),
    });
    const targetRef = relation.persisted[0]?.id;
    if (targetRef === undefined) throw new Error('relation not persisted');

    expect(await createAIReflectionInvitation(graph, targetRef)).toMatchObject({
      status: 'disabled',
      question: null,
    });

    const reflected = await graph.reflectionFlow.respondToRelation({
      targetRef,
      feedback: {
        response: null,
        freeText: '即使 AI 不可用，这仍然是我自己的回看。',
        leaveForNow: false,
        userInitiatedContinuation: false,
      },
      now: new Date('2026-09-14T03:03:00.000Z'),
    });
    expect(reflected?.recordId).not.toBeNull();
    expect(await graph.records.listRecent({ limit: 10 })).toHaveLength(3);
  });

  it('does not send relation context when a Directive denies analysis', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));
    const provider = new OpenAICompatibleProvider(
      {
        providerId: 'directive-test',
        baseUrl: 'https://ai.example.test/v1',
        apiKey: 'never-log-this-key',
        model: 'test-model',
      },
      fetcher as unknown as typeof fetch,
    );
    const judgment = new DeterministicSemanticJudgmentAdapter();
    const graph = createCoreMemoryCaptureComposition(undefined, {
      ids: new ExperienceIds(),
      hash: (value) => `directive:${value}`,
      judgment,
      aiRuntime: { provider, judgment },
    });
    await capture(
      graph,
      '第一条不应被发送。',
      '123e4567-e89b-42d3-a456-426614174303',
      '2026-09-14T04:00:00.000Z',
    );
    const second = await capture(
      graph,
      '第二条也不应被发送。',
      '123e4567-e89b-42d3-a456-426614174304',
      '2026-09-14T04:01:00.000Z',
    );
    if (!second.ok) throw new Error('capture failed');

    const directive = await graph.directives.create({
      allowAnalysis: false,
      allowStorage: true,
      allowPassivePresentation: true,
      allowProactivePresentation: false,
      appliesToFutureSimilar: false,
      scope: null,
      now: new Date('2026-09-14T04:02:00.000Z'),
    });
    expect(directive.ok).toBe(true);

    const result = await suggestRelationsAfterCapture(
      graph,
      second.value.recordId,
    );
    expect(result).toMatchObject({ status: 'not_permitted', candidates: [] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('bounds context and excludes a specifically forbidden historical Record', async () => {
    const requests: unknown[] = [];
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  status: 'NO_OBSERVATION',
                  language: 'zh-CN',
                  suggestions: [],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    const provider = new OpenAICompatibleProvider(
      {
        providerId: 'context-test',
        baseUrl: 'https://ai.example.test/v1',
        apiKey: 'context-test-key',
        model: 'context-model',
      },
      fetcher as unknown as typeof fetch,
    );
    const graph = createCoreMemoryCaptureComposition(undefined, {
      ids: new ExperienceIds(),
      hash: (value) => `context:${value}`,
      judgment: new DeterministicSemanticJudgmentAdapter(),
      aiRuntime: { provider, judgment: provider },
    });
    const first = await capture(
      graph,
      'x'.repeat(3_000),
      '123e4567-e89b-42d3-a456-426614174305',
      '2026-09-14T05:00:00.000Z',
    );
    const second = await capture(
      graph,
      '允许进入上下文的历史记录。',
      '123e4567-e89b-42d3-a456-426614174306',
      '2026-09-14T05:01:00.000Z',
    );
    const third = await capture(
      graph,
      '当前记录。',
      '123e4567-e89b-42d3-a456-426614174307',
      '2026-09-14T05:02:00.000Z',
    );
    if (!first.ok || !second.ok || !third.ok) throw new Error('capture failed');

    const directive = await graph.directives.create({
      allowAnalysis: false,
      allowStorage: true,
      allowPassivePresentation: true,
      allowProactivePresentation: false,
      appliesToFutureSimilar: true,
      scope: { kind: 'user_selected', value: first.value.recordId },
      now: new Date('2026-09-14T05:03:00.000Z'),
    });
    expect(directive.ok).toBe(true);

    await suggestRelationsAfterCapture(graph, third.value.recordId, new RelationCandidateRegistry());
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = requests[0] as { readonly messages: readonly { readonly content: string }[] };
    const payload = JSON.parse(body.messages[1]!.content) as {
      readonly selectedRecords: readonly { readonly recordId: string; readonly verbatim: string | null }[];
    };
    expect(payload.selectedRecords.map((record) => record.recordId)).toEqual([
      third.value.recordId,
      second.value.recordId,
    ]);
    expect(payload.selectedRecords).toHaveLength(2);
    expect(payload.selectedRecords.every((record) => (record.verbatim?.length ?? 0) <= 2_000)).toBe(true);
  });

  it('coalesces concurrent explicit requests for one Record', async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  status: 'NO_OBSERVATION',
                  language: 'zh-CN',
                  suggestions: [],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    const provider = new OpenAICompatibleProvider(
      {
        providerId: 'guard-test',
        baseUrl: 'https://ai.example.test/v1',
        apiKey: 'guard-test-key',
        model: 'guard-model',
      },
      fetcher as unknown as typeof fetch,
    );
    const graph = createCoreMemoryCaptureComposition(undefined, {
      ids: new ExperienceIds(),
      hash: (value) => `guard:${value}`,
      judgment: new DeterministicSemanticJudgmentAdapter(),
      aiRuntime: { provider, judgment: provider },
    });
    const first = await capture(
      graph,
      '第一条。',
      '123e4567-e89b-42d3-a456-426614174308',
      '2026-09-14T06:00:00.000Z',
    );
    const second = await capture(
      graph,
      '第二条。',
      '123e4567-e89b-42d3-a456-426614174309',
      '2026-09-14T06:01:00.000Z',
    );
    if (!first.ok || !second.ok) throw new Error('capture failed');
    const registry = new RelationCandidateRegistry();
    const results = await Promise.all([
      suggestRelationsAfterCapture(graph, second.value.recordId, registry),
      suggestRelationsAfterCapture(graph, second.value.recordId, registry),
    ]);
    expect(calls).toBe(1);
    expect(results[0]).toMatchObject({
      status: 'no_candidate',
      candidates: [],
    });
    expect(results[1]).toMatchObject({
      status: 'no_candidate',
      candidates: [],
    });
  });
});
