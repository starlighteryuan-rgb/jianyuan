import { describe, expect, it } from 'vitest';

import { createMemoryServices } from '@/server/container';
import {
  asCaptureComposition,
  type CoreIdGenerator,
  createCoreMemoryCaptureComposition,
  resolveCaptureCompositionMode,
} from '@/server/capture-composition-root';
import { executeCapture } from '@/server/capture-use-case';
import { createLegacyRecordQueries } from '@/server/legacy-record-query-adapter';
import {
  recordId,
  type RelationClaimCandidate,
} from '../packages/core/index';
import { DeterministicSemanticJudgmentAdapter } from '../packages/providers/deterministic/index';

const COMMAND = {
  verbatim: '我可能只是还没准备好。',
  submissionId: '123e4567-e89b-42d3-a456-426614174000',
  submittedAt: new Date('2026-09-13T00:00:00.000Z'),
  capturedAt: new Date('2026-09-13T00:00:01.000Z'),
};

class DeterministicIds implements CoreIdGenerator {
  private sequences = new Map<string, number>();

  private next(prefix: string): string {
    const value = (this.sequences.get(prefix) ?? 0) + 1;
    this.sequences.set(prefix, value);
    return `${prefix}_${value}`;
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

describe('Capture composition root migration', () => {
  it('runs the same Capture use case with the legacy and Core Memory adapters', async () => {
    const legacyServices = createMemoryServices();
    const legacy = asCaptureComposition(
      'legacy',
      legacyServices.ingestion,
      createLegacyRecordQueries(legacyServices.repositories),
    );
    const memory = createCoreMemoryCaptureComposition();

    const legacyCreated = await executeCapture(legacy.ingestion, COMMAND);
    const memoryCreated = await executeCapture(memory.ingestion, COMMAND);
    const legacyRetried = await executeCapture(legacy.ingestion, COMMAND);
    const memoryRetried = await executeCapture(memory.ingestion, COMMAND);

    expect(legacyCreated.ok).toBe(true);
    expect(memoryCreated.ok).toBe(true);
    expect(legacyRetried.ok && legacyRetried.value.deduplicated).toBe(true);
    expect(memoryRetried.ok && memoryRetried.value.deduplicated).toBe(true);

    if (!legacyCreated.ok || !memoryCreated.ok) {
      throw new Error('Capture did not complete');
    }

    const legacyRecord = await legacy.records.getById(
      legacyCreated.value.recordId,
    );
    const memoryRecord = await memory.records.getById(
      memoryCreated.value.recordId,
    );
    const memoryRecent = await memory.records.listRecent({ limit: 10 });
    const reflectionContext = await memory.records.getReflectionContext(
      memoryCreated.value.recordId,
    );

    expect(legacyRecord?.verbatim).toBe(COMMAND.verbatim);
    expect(memoryRecord?.verbatim).toBe(COMMAND.verbatim);
    expect(memoryRecent.map((record) => record.id)).toContain(
      memoryCreated.value.recordId,
    );
    expect(reflectionContext).toEqual({
      record: memoryRecord,
      meaningHistory: [],
    });
    expect(memoryCreated.value.rolesAdded).toEqual(
      legacyCreated.value.rolesAdded,
    );
  });

  it('defaults to SQLite and retains explicit Memory and legacy selection', () => {
    expect(resolveCaptureCompositionMode(undefined)).toBe('sqlite');
    expect(resolveCaptureCompositionMode('sqlite')).toBe('sqlite');
    expect(resolveCaptureCompositionMode('memory')).toBe('core-memory');
    expect(resolveCaptureCompositionMode('core-memory')).toBe('core-memory');
    expect(resolveCaptureCompositionMode('legacy')).toBe('legacy');
  });

  it('runs Record -> Relation -> Discovery -> Reflection on one Core Memory graph', async () => {
    const candidate: RelationClaimCandidate = {
      recordRefs: [recordId('rec_1'), recordId('rec_2')],
      comparisonAxis: {
        question: '两次记录是否都从一个具体动作开始？',
        dimension: '行动启动顺序',
      },
      relationType: 'action_sequence',
      evidenceSummary: '两条原话都描述了从一个具体动作开始。',
      assertsTemporalOrdering: false,
    };
    const composition = createCoreMemoryCaptureComposition(undefined, {
      ids: new DeterministicIds(),
      hash: (value) => `phase-3.5:${value}`,
      judgment: new DeterministicSemanticJudgmentAdapter({
        candidates: [candidate],
      }),
    });

    const first = await executeCapture(composition.ingestion, {
      ...COMMAND,
      submissionId: '123e4567-e89b-42d3-a456-426614174001',
      verbatim: '我先把任务拆成一个具体动作。',
    });
    const second = await executeCapture(composition.ingestion, {
      ...COMMAND,
      submissionId: '123e4567-e89b-42d3-a456-426614174002',
      verbatim: '今天也是先写下第一步才开始。',
      submittedAt: new Date('2026-09-13T00:01:00.000Z'),
      capturedAt: new Date('2026-09-13T00:01:01.000Z'),
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('Capture did not complete');

    expect((await composition.records.getById(first.value.recordId))?.verbatim)
      .toBe('我先把任务拆成一个具体动作。');

    const relation = await composition.relations.evaluate({
      recordRefs: [recordId(first.value.recordId), recordId(second.value.recordId)],
      subject: {
        topicTags: [],
        source: 'phase-3.5',
        relationAxes: ['行动启动顺序'],
        userSelectedRefs: [first.value.recordId, second.value.recordId],
        createdAt: new Date('2026-09-13T00:02:00.000Z'),
      },
      baselineContext: {
        hasReliablePersonalBaseline: true,
        recordSuppliesInternalBaseline: false,
      },
      now: new Date('2026-09-13T00:02:00.000Z'),
    });
    expect(relation.persisted).toHaveLength(1);

    const stream = await composition.discovery.listStream({
      now: new Date('2026-09-13T00:03:00.000Z'),
      relationLimit: 10,
    });
    expect(stream).toHaveLength(1);
    expect(stream[0]?.kind).toBe('relation');

    const targetRef = relation.persisted[0]?.id;
    if (targetRef === undefined) throw new Error('Relation was not persisted');
    expect(
      (await composition.reflectionFlow.getRelationTarget(
        targetRef,
        new Date('2026-09-13T00:04:00.000Z'),
      ))?.relation.id,
    ).toBe(targetRef);

    const reflected = await composition.reflectionFlow.respondToRelation({
      targetRef,
      feedback: {
        response: null,
        freeText: '我想继续观察这个开始方式。',
        leaveForNow: false,
        userInitiatedContinuation: false,
      },
      now: new Date('2026-09-13T00:05:00.000Z'),
    });
    expect(reflected?.recordId).not.toBeNull();
    if (reflected?.recordId === null || reflected === null) {
      throw new Error('Reflection was not captured');
    }

    const reflectionContext = await composition.records.getReflectionContext(
      reflected.recordId,
    );
    expect(reflectionContext?.record.verbatim).toBe(
      '我想继续观察这个开始方式。',
    );
    expect(reflectionContext?.meaningHistory).toHaveLength(1);

    const reflectedTarget = await composition.reflectionFlow.getRelationTarget(
      targetRef,
      new Date('2026-09-13T00:06:00.000Z'),
    );
    expect(reflectedTarget?.userPosition).toBe('none');
    expect(reflectedTarget?.reflections).toEqual([
      expect.objectContaining({
        recordId: reflected.recordId,
        verbatim: '我想继续观察这个开始方式。',
        meaningCommitment: 'tentative',
        currentEffect: 'current',
      }),
    ]);
  });
});
