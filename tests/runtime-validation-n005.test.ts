/**
 * Runtime Validation Case N-005 — External Dataset Adapter Boundary.
 *
 * The fixture describes one generic external source. No platform client,
 * network, crawler, or production adapter is introduced here.
 */

import { describe, expect, it } from 'vitest';

import {
  DeterministicSemanticJudgment,
  type DeterministicScript,
} from '@/infra/fake/deterministic-semantic-judgment';
import type { RetrievedExternalReference } from '@/domain/external/external-reference';
import {
  EXTERNAL_REFERENCE_DEFINES_THE_USER,
  EXTERNAL_REFERENCE_IS_INDEPENDENT_EVIDENCE,
  EXTERNAL_REFERENCE_IS_PERSONAL_BASELINE,
} from '@/domain/external/external-reference';
import { createMemoryServices } from '@/server/container';

const RETRIEVED_AT = new Date('2026-02-20T09:00:00.000Z');
const SOURCE_TIMESTAMP = '2026-02-18T12:00:00.000Z';

/** Adapter-only input. These fields are never written as Domain fields. */
const externalDatasetSource = {
  sourceType: 'generic-external-dataset',
  sourceId: 'https://external.example/items/n005-001',
  author: 'external-author-001',
  content: '我曾经在面对复杂任务时先整理很久，再决定是否开始。',
  // Adapter metadata only. It is deliberately not treated as a user event time.
  timestamp: SOURCE_TIMESTAMP,
} as const;

/** Explicit test-layer mapping to the existing RetrievedExternalReference type. */
const retrievedReference: RetrievedExternalReference = {
  url: externalDatasetSource.sourceId,
  provider: 'generic-external-dataset',
  kind: 'experience',
  excerpt: externalDatasetSource.content,
  language: 'zh',
  title: null,
  // The system knows when it retrieved the material; the source timestamp is
  // not silently promoted to event_time or a user observation time.
  retrievedAt: RETRIEVED_AT,
};

/**
 * Deterministic candidate generation used only for the explicit Gate 2 check.
 * It creates no Relation itself; RelationEngine must reject the external role.
 */
class ExternalBoundaryJudgment extends DeterministicSemanticJudgment {
  override async generateCandidates(
    request: Parameters<DeterministicSemanticJudgment['generateCandidates']>[0],
  ): ReturnType<DeterministicSemanticJudgment['generateCandidates']> {
    this.calls.generateCandidates += 1;
    const first = request.records[0];

    return {
      candidates: first === undefined
        ? []
        : [{
            recordRefs: [first.recordId],
            comparisonAxis: {
              question: '该来源是否描述了一个可归属于用户的任务启动模式？',
              dimension: 'task_start_behavior',
            },
            relationType: 'personal_pattern',
            evidenceSummary: '外部文本描述了任务开始前的整理行为。',
            assertsTemporalOrdering: false,
          }],
    };
  }
}

describe('Runtime Validation N-005 — External Dataset Adapter boundary', () => {
  it('imports external material as quarantined provenance without user semantic escalation', async () => {
    const judgment = new DeterministicSemanticJudgment();
    const services = createMemoryServices({ judgment });

    const beforePreference = await services.reflection.preference(RETRIEVED_AT);
    const result = await services.externalReferences.import({
      source: retrievedReference,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stored = await services.repositories.records.findById(result.value.recordId);
    expect(stored).not.toBeNull();

    expect(stored?.provenance.origin).toBe('imported');
    expect(stored?.provenance.actor).toBe('platform');
    expect(stored?.provenance.sourceRef).toBe(retrievedReference.url);
    expect(stored?.provenance).not.toHaveProperty('author');
    expect(stored?.epistemicRoles).toEqual(['external_reference']);
    expect(stored?.epistemicRoles).not.toContain('user_expression');
    expect(stored?.rawExpression?.verbatim).toBe(retrievedReference.excerpt);
    expect(stored?.time.semantic).toBe('capture_time');
    expect(stored?.time).not.toHaveProperty('sourceTimestamp');

    expect(stored?.sourceFingerprint).toBeDefined();
    expect(stored?.evidenceUnitId).toBeDefined();
    expect(result.value.plan.origin).toBe('imported');
    expect(result.value.plan.actor).toBe('platform');
    expect(result.value.plan.epistemicRoles).toEqual(['external_reference']);
    expect(result.value.plan.sourceRef).toBe(retrievedReference.url);

    expect(await services.repositories.records.listRecent(10)).toHaveLength(1);
    expect(await services.repositories.records.countDistinctEvidenceUnits([result.value.recordId])).toBe(1);
    expect(await services.repositories.reflectionRecords.listByRecord(result.value.recordId)).toEqual([]);
    expect(await services.reflection.preference(RETRIEVED_AT)).toEqual(beforePreference);
    expect(await services.repositories.claims.listAll(10)).toEqual([]);
    expect(await services.repositories.hypotheses.listAll()).toEqual([]);
    expect(judgment.calls.generateCandidates).toBe(0);
    expect(judgment.calls.generateHypotheses).toBe(0);
  });

  it('keeps the external Record outside personal Relation evidence at the existing Gate 2 boundary', async () => {
    const judgment = new ExternalBoundaryJudgment();
    const services = createMemoryServices({ judgment });

    const imported = await services.externalReferences.import({
      source: retrievedReference,
    });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    const evaluation = await services.relations.evaluate({
      recordRefs: [imported.value.recordId],
      subject: {
        topicTags: [],
        source: retrievedReference.provider,
        relationAxes: ['task_start_behavior'],
        userSelectedRefs: [],
        createdAt: RETRIEVED_AT,
      },
      baselineContext: {
        hasReliablePersonalBaseline: false,
        recordSuppliesInternalBaseline: false,
      },
      now: RETRIEVED_AT,
    });

    expect(evaluation.persisted).toEqual([]);
    expect(evaluation.outcome.rejected).toHaveLength(1);
    expect(evaluation.outcome.rejected[0]?.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gate: 'epistemic_eligibility',
          code: 'ineligible_epistemic_role',
        }),
      ]),
    );
    expect(await services.repositories.claims.listAll(10)).toEqual([]);
    expect(await services.repositories.hypotheses.listAll()).toEqual([]);
    expect(judgment.calls.generateCandidates).toBe(1);
    expect(judgment.calls.judgeComparability).toBe(0);
    expect(judgment.calls.judgeEvidenceDimensions).toBe(0);
    expect(judgment.calls.generateHypotheses).toBe(0);
  });

  it('exposes the external-reference quarantine as non-user invariants', () => {
    expect(EXTERNAL_REFERENCE_DEFINES_THE_USER).toBe(false);
    expect(EXTERNAL_REFERENCE_IS_INDEPENDENT_EVIDENCE).toBe(false);
    expect(EXTERNAL_REFERENCE_IS_PERSONAL_BASELINE).toBe(false);
  });
});
