import { describe, expect, it, vi } from 'vitest';

import {
  hasAuditableEvidence,
  recordId,
} from '../packages/core/index';
import {
  OpenAICompatibleProvider,
  type AwarenessAIProvider,
} from '../packages/providers/ai/index';
import { DeterministicSemanticJudgmentAdapter } from '../packages/providers/deterministic/index';
import {
  RelationCandidateRegistry,
  submitAIObservationReflection,
  suggestRelationsAfterCapture,
} from '@/server/ai-core-experience';
import {
  createCoreMemoryCaptureComposition,
  type CoreIdGenerator,
} from '@/server/capture-composition-root';
import { executeCapture } from '@/server/capture-use-case';
import {
  AI_AWARENESS_EVALUATION_DATASET,
  providerPayloadFor,
  type AwarenessEvaluationCase,
} from './fixtures/ai-awareness-evaluation-dataset';

class EvaluationIds implements CoreIdGenerator {
  private readonly sequences = new Map<string, number>();

  private next(prefix: string): string {
    const value = (this.sequences.get(prefix) ?? 0) + 1;
    this.sequences.set(prefix, value);
    return `${prefix}_awareness_${value}`;
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

const completion = (value: unknown): Response =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(value) } }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

const providerFor = (evaluation: AwarenessEvaluationCase) => {
  const requests: unknown[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      readonly messages?: readonly { readonly content?: string }[];
    };
    const payload = JSON.parse(body.messages?.[1]?.content ?? '{}') as {
      readonly selectedRecords?: readonly { readonly recordId: string }[];
    };
    const selectedRecordIds = payload.selectedRecords?.map((item) => item.recordId) ?? [];
    requests.push(payload);
    return completion(providerPayloadFor(evaluation.provider, selectedRecordIds));
  };

  return {
    provider: new OpenAICompatibleProvider(
      {
        providerId: `awareness-${evaluation.id}`,
        baseUrl: 'https://awareness-evaluation.invalid/v1',
        apiKey: 'evaluation-fixture-key',
        model: 'deterministic-evaluation-model',
      },
      fetcher,
    ),
    requests,
  };
};

const createGraph = (evaluation: AwarenessEvaluationCase) => {
  const { provider, requests } = providerFor(evaluation);
  const judgment = new DeterministicSemanticJudgmentAdapter({
    defaultScore: 3,
    candidates: [{
      recordRefs: [recordId('rec_awareness_1'), recordId('rec_awareness_2')],
      comparisonAxis: {
        question: '当你准备开始时，通常先做哪个具体动作？',
        dimension: '行动启动顺序',
      },
      relationType: 'possible_action_sequence',
      evidenceSummary: '两条记录都描述了开始行动前的具体准备。',
      assertsTemporalOrdering: false,
    }],
  });
  const graph = createCoreMemoryCaptureComposition(undefined, {
    ids: new EvaluationIds(),
    hash: (value) => `awareness:${value}`,
    judgment,
    aiRuntime: { provider, judgment },
  });
  return { graph, requests };
};

const captureDatasetRecords = async (
  graph: ReturnType<typeof createCoreMemoryCaptureComposition>,
  evaluation: AwarenessEvaluationCase,
) => {
  const first = await executeCapture(graph.ingestion, {
    verbatim: evaluation.records[0],
    submissionId: '123e4567-e89b-42d3-a456-426614174801',
    submittedAt: new Date('2026-09-14T08:00:00.000Z'),
    capturedAt: new Date('2026-09-14T08:00:01.000Z'),
  });
  const second = await executeCapture(graph.ingestion, {
    verbatim: evaluation.records[1],
    submissionId: '123e4567-e89b-42d3-a456-426614174802',
    submittedAt: new Date('2026-09-14T08:01:00.000Z'),
    capturedAt: new Date('2026-09-14T08:01:01.000Z'),
  });
  if (!first.ok || !second.ok) throw new Error('evaluation fixture capture failed');
  return [first.value.recordId, second.value.recordId] as const;
};

const observe = async (
  evaluation: AwarenessEvaluationCase,
) => {
  const { graph, requests } = createGraph(evaluation);
  const recordIds = await captureDatasetRecords(graph, evaluation);
  const registry = new RelationCandidateRegistry();
  const result = await suggestRelationsAfterCapture(
    graph,
    recordIds[1],
    registry,
  );
  return { graph, recordIds, requests, registry, result };
};

describe('Phase 8.4 · AI Awareness Evaluation Dataset', () => {
  it('keeps the corpus explicitly focused on boundary outcomes, not model strength', () => {
    expect(AI_AWARENESS_EVALUATION_DATASET.length).toBeGreaterThanOrEqual(10);
    for (const evaluation of AI_AWARENESS_EVALUATION_DATASET) {
      expect(evaluation.expected).toHaveProperty('relationCreated');
      expect(evaluation.expected).toHaveProperty('evidenceCreated');
      expect(evaluation.expected).toHaveProperty('reflectionSaved');
    }
  });

  it.each(AI_AWARENESS_EVALUATION_DATASET)(
    'holds the provider boundary for $id',
    async (evaluation) => {
      const { provider } = providerFor(evaluation);
      const selectedRecordIds = [recordId('rec_awareness_fixture_1'), recordId('rec_awareness_fixture_2')];
      const result = await provider.suggestRelations({
        authorization: {
          userEnabledAI: true,
          directiveAllowsAI: true,
          selectedRecordIds,
          reason: 'awareness_evaluation',
        },
        records: selectedRecordIds.map((id, index) => ({
          recordId: id,
          verbatim: evaluation.records[index] ?? null,
          timeDescription: `2026-09-14T08:0${index}:00.000Z`,
        })),
      });
      expect(result.ok).toBe(evaluation.expected.providerAccepted);
    },
  );

  it.each(
    AI_AWARENESS_EVALUATION_DATASET.filter((evaluation) => evaluation.userPath === 'observe_only'),
  )('keeps Observation disposable for $id', async (evaluation) => {
    const { graph, registry, result } = await observe(evaluation);
    expect(result.status === 'candidates').toBe(evaluation.expected.observationAllowed);
    expect(await graph.storage.relationClaims.listAll(20)).toHaveLength(0);
    expect(await graph.discovery.listStream({ now: new Date('2026-09-14T08:05:00.000Z'), relationLimit: 20 })).toHaveLength(0);
    expect(await graph.records.listRecent({ limit: 20 })).toHaveLength(2);

    if (result.status === 'candidates') {
      for (const candidate of result.candidates) {
        expect(candidate).toMatchObject({
          observation: expect.any(String),
          referencedRecords: expect.any(Array),
          possibleExplanation: expect.stringContaining('一种可能是'),
          uncertainty: expect.stringContaining('无法判断'),
          reflectionQuestion: expect.any(String),
        });
        expect(candidate).not.toHaveProperty('supportLevel');
        expect(candidate).not.toHaveProperty('evidence');
      }
    }
  });

  it('keeps the orchestration boundary stable for a non-bundled adversarial Provider', async () => {
    const evaluation = AI_AWARENESS_EVALUATION_DATASET.find(
      (item) => item.id === 'provider-drift-essentialist',
    );
    if (evaluation === undefined) throw new Error('dataset case missing');
    const adversarialProvider: AwarenessAIProvider = {
      providerId: 'untrusted-evaluation-provider',
      enabled: true,
      listModels: async () => ({
        ok: true,
        value: {
          modelDiscoverySupported: false,
          models: [],
          source: 'disabled' as const,
          reason: 'upstream_unsupported' as const,
        },
      }),
      suggestRelations: async ({ records }) => ({
        ok: true,
        value: {
          status: 'SURFACE',
          language: 'zh-CN',
          suggestions: [{
          kind: 'relation_candidate' as const,
          recordRefs: records.map((record) => record.recordId),
          comparisonAxis: {
            question: '这两条记录是否有相似的开始方式？',
            dimension: '行动启动顺序',
          },
          relationType: 'possible_action_sequence',
          evidenceSummary: '你本质上是一个追求完美的人。',
          assertsTemporalOrdering: false,
          }],
        },
      }),
      createReflectionPrompt: async () => ({
        ok: true,
        value: {
          kind: 'reflection_invitation' as const,
          question: '你愿意继续观察什么？',
        },
      }),
      getManualModelId: () => 'untrusted-model',
    };
    const judgment = new DeterministicSemanticJudgmentAdapter({ defaultScore: 3 });
    const graph = createCoreMemoryCaptureComposition(undefined, {
      ids: new EvaluationIds(),
      hash: (value) => `awareness-adversarial:${value}`,
      judgment,
      aiRuntime: { provider: adversarialProvider, judgment },
    });
    const recordIds = await captureDatasetRecords(graph, evaluation);
    const result = await suggestRelationsAfterCapture(
      graph,
      recordIds[1],
      new RelationCandidateRegistry(),
    );
    expect(result).toMatchObject({ status: 'unavailable', candidates: [] });
    expect(await graph.storage.relationClaims.listAll(20)).toHaveLength(0);
  });

  it('does not turn repeated observations into accumulated relations', async () => {
    const evaluation = AI_AWARENESS_EVALUATION_DATASET.find(
      (item) => item.id === 'multiple-observations-stay-temporary',
    );
    if (evaluation === undefined) throw new Error('dataset case missing');
    const { graph } = createGraph(evaluation);
    const recordIds = await captureDatasetRecords(graph, evaluation);
    const first = await suggestRelationsAfterCapture(graph, recordIds[1], new RelationCandidateRegistry());
    const second = await suggestRelationsAfterCapture(graph, recordIds[1], new RelationCandidateRegistry());
    expect(first.status).toBe('candidates');
    expect(second.status).toBe('candidates');
    if (first.status === 'candidates' && second.status === 'candidates') {
      expect(first.candidates).toHaveLength(2);
      expect(second.candidates).toHaveLength(2);
    }
    expect(await graph.storage.relationClaims.listAll(20)).toHaveLength(0);
  });

  it.each(
    AI_AWARENESS_EVALUATION_DATASET.filter((evaluation) => evaluation.userPath !== 'observe_only' && evaluation.expected.providerAccepted),
  )('keeps user meaning ahead of AI wording for $id', async (evaluation) => {
    const { graph, registry, result } = await observe(evaluation);
    expect(result.status).toBe('candidates');
    if (result.status !== 'candidates') return;
    const evaluateSpy = vi.spyOn(graph.relations, 'evaluate');
    const candidate = result.candidates[0];
    if (candidate === undefined) throw new Error('evaluation candidate missing');
    const meaning = evaluation.userPath === 'not_my_experience'
      ? 'not_my_experience'
      : evaluation.userPath === 'different_understanding'
        ? 'different_understanding'
        : 'connected';
    const response = await submitAIObservationReflection(
      graph,
      {
        candidateId: candidate.candidateId,
        meaning,
        ...(evaluation.reflectionText === undefined ? {} : { reflectionText: evaluation.reflectionText }),
        now: new Date('2026-09-14T08:06:00.000Z'),
      },
      registry,
    );

    expect(evaluateSpy).toHaveBeenCalledTimes(evaluation.expected.coreGateCalled ? 1 : 0);
    expect(response.status).toBe(
      evaluation.userPath === 'no_text'
        ? 'reflection_required'
        : evaluation.userPath === 'not_my_experience'
          ? 'discarded'
          : 'discovery',
    );

    const claims = await graph.storage.relationClaims.listAll(20);
    expect(claims).toHaveLength(evaluation.expected.relationCreated ? 1 : 0);
    expect(await graph.records.listRecent({ limit: 20 })).toHaveLength(
      evaluation.expected.reflectionSaved ? 3 : 2,
    );
    if (evaluation.expected.reflectionSaved) {
      const targetRef = response.status === 'discovery' ? response.targetRef : null;
      expect(targetRef).not.toBeNull();
      const target = targetRef === null ? null : await graph.reflectionFlow.getRelationTarget(targetRef, new Date());
      expect(target?.reflections[0]?.verbatim).toBe(evaluation.reflectionText);
      expect(target?.reflections[0]?.verbatim).not.toBe(candidate.observation);
      expect(claims[0] === undefined ? null : hasAuditableEvidence(claims[0])).toBe(
        evaluation.expected.evidenceCreated,
      );
    }
  });
});
