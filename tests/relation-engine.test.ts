/**
 * Phase 3 tests — the five-stage Relation Engine pipeline.
 *
 * Exercises the real engine against a deterministic judgment double, so every
 * stage and short-circuit is verifiable with no model, no key, no database.
 *
 * Covers:
 *   ENGINEERING_CONTRACT §34 — stage order; 宽观察，严证据，少呈现.
 *   ENGINEERING_CONTRACT §8  — gates run BEFORE scoring; Gate 1 precedes analysis.
 *   ENGINEERING_CONTRACT §7.1 — open relation taxonomy.
 *   ENGINEERING_CONTRACT §7.2 — "No Sufficient Relation" is an OUTCOME.
 *   ENGINEERING_CONTRACT §10.3 — Temporal Adequacy scored only after Gate 4.
 *   ENGINEERING_CONTRACT §10.4 / INV-15 — the baseline ceiling is applied by CODE.
 *   ENGINEERING_CONTRACT §13 — Relation stays descriptive, never explanatory.
 *   docs/architecture.md §11 Patch 9 — unscorable candidates are retained, not defaulted.
 */

import { describe, expect, it } from 'vitest';

import {
  RelationEngine,
  assembleJudgments,
  initialStateForClaim,
  toRecordView,
  type RelationClaimIdGenerator,
} from '@/domain/relation/relation-engine';
import { DeterministicSemanticJudgment } from '@/infra/fake/deterministic-semantic-judgment';
import type { DeterministicScript } from '@/infra/fake/deterministic-semantic-judgment';
import {
  hasAuditableEvidence,
  type RelationClaimCandidate,
} from '@/domain/relation/relation-claim';
import { EVIDENCE_DIMENSIONS } from '@/domain/relation/evidence-dimensions';
import type { EffectivePermissions } from '@/domain/directive/directive-resolution';
import type { PersonalRecord } from '@/domain/record/record';
import {
  evidenceUnitId,
  recordId,
  sourceFingerprint,
} from '@/domain/shared/ids';

const AT = new Date('2026-09-01T00:00:00Z');
const LATER = new Date('2026-09-08T00:00:00Z');
const NOW = new Date('2026-09-12T00:00:00Z');

const record = (over: Partial<PersonalRecord> = {}): PersonalRecord => ({
  id: recordId('rec-1'),
  sourceFingerprint: sourceFingerprint('fp-1'),
  evidenceUnitId: evidenceUnitId('eu-1'),
  epistemicRoles: ['observed_event'],
  provenance: {
    origin: 'directly_observed',
    actor: 'user',
    sourceRef: 'src-1',
    capturedAt: AT,
  },
  time: { semantic: 'observation_time', at: AT },
  rawExpression: { verbatim: '我可能只是害怕开始', language: 'zh' },
  createdAt: AT,
  ...over,
});

/** Two records on genuinely distinct Evidence Units — a clean Gate 5 pass. */
const twoIndependent = (): readonly PersonalRecord[] => [
  record({ id: recordId('rec-1'), evidenceUnitId: evidenceUnitId('eu-1') }),
  record({
    id: recordId('rec-2'),
    sourceFingerprint: sourceFingerprint('fp-2'),
    evidenceUnitId: evidenceUnitId('eu-2'),
    time: { semantic: 'observation_time', at: LATER },
  }),
];

const permissions = (
  over: Partial<EffectivePermissions> = {},
): EffectivePermissions => ({
  allowAnalysis: true,
  allowStorage: true,
  allowPassivePresentation: true,
  allowProactivePresentation: false,
  appliedDirectiveIds: [],
  ...over,
});

const candidate = (
  over: Partial<RelationClaimCandidate> = {},
): RelationClaimCandidate => ({
  recordRefs: [recordId('rec-1'), recordId('rec-2')],
  comparisonAxis: {
    question: '任务距离截止时间多远时开始实际执行',
    dimension: 'hours before deadline at which execution began',
  },
  relationType: 'co_occurrence',
  evidenceSummary: 'Execution began close to the deadline in both records.',
  assertsTemporalOrdering: false,
  ...over,
});

class Ids implements RelationClaimIdGenerator {
  private n = 0;
  nextRelationClaimId(): string {
    this.n += 1;
    return `claim-${this.n}`;
  }
}

const run = async (
  script: DeterministicScript,
  over: {
    readonly records?: readonly PersonalRecord[];
    readonly permissions?: EffectivePermissions;
    readonly hasReliablePersonalBaseline?: boolean;
    readonly recordSuppliesInternalBaseline?: boolean;
  } = {},
) => {
  const judgment = new DeterministicSemanticJudgment(script);
  const engine = new RelationEngine(judgment);

  const outcome = await engine.evaluate({
    records: over.records ?? twoIndependent(),
    permissions: over.permissions ?? permissions(),
    baselineContext: {
      hasReliablePersonalBaseline: over.hasReliablePersonalBaseline ?? true,
      recordSuppliesInternalBaseline:
        over.recordSuppliesInternalBaseline ?? false,
    },
    now: NOW,
    ids: new Ids(),
  });

  return { outcome, judgment };
};

describe('§34 Stage 1 — Candidate Generation is open', () => {
  it('admits a clean candidate', async () => {
    const { outcome } = await run({ candidates: [candidate()] });

    expect(outcome.admitted).toHaveLength(1);
    expect(outcome.rejected).toEqual([]);
    expect(outcome.noSufficientRelation).toBe(false);
  });

  it('accepts zero candidates as a legitimate answer', async () => {
    const { outcome } = await run({ candidates: [] });

    expect(outcome.admitted).toEqual([]);
    expect(outcome.noSufficientRelation).toBe(true);
  });

  it('evaluates N candidates independently (§7: 0..N claims)', async () => {
    const { outcome } = await run({
      candidates: [
        candidate({ relationType: 'co_occurrence' }),
        candidate({ relationType: 'contrast' }),
        candidate({ relationType: 'condition_dependency' }),
      ],
    });

    expect(outcome.admitted).toHaveLength(3);
  });

  it('§7.1 — admits a novel relation type not in any enum', async () => {
    // The taxonomy is non-exhaustive: a novel claim passing the gates is
    // admissible, and nothing here closes the set.
    const { outcome } = await run({
      candidates: [candidate({ relationType: 'anticipatory_avoidance_pattern' })],
    });

    expect(outcome.admitted[0]?.relationType).toBe(
      'anticipatory_avoidance_pattern',
    );
  });
});

describe('§8 Gate 1 — analysis permission precedes analysis itself', () => {
  it('produces no claims when analysis is forbidden', async () => {
    const { outcome } = await run(
      { candidates: [candidate()] },
      { permissions: permissions({ allowAnalysis: false }) },
    );

    expect(outcome.admitted).toEqual([]);
    expect(outcome.noSufficientRelation).toBe(true);
  });

  it('never calls the model when analysis is forbidden', async () => {
    // If analysis is forbidden, performing it to decide whether it was allowed
    // would be incoherent (§26, INV-17).
    const { judgment } = await run(
      { candidates: [candidate()] },
      { permissions: permissions({ allowAnalysis: false }) },
    );

    expect(judgment.calls.generateCandidates).toBe(0);
    expect(judgment.calls.judgeComparability).toBe(0);
    expect(judgment.calls.judgeEvidenceDimensions).toBe(0);
  });

  it('still runs when only presentation is restricted', async () => {
    const { outcome } = await run(
      { candidates: [candidate()] },
      {
        permissions: permissions({
          allowPassivePresentation: false,
          allowProactivePresentation: false,
        }),
      },
    );

    expect(outcome.admitted).toHaveLength(1);
  });
});

describe('§34 Stage 2 — Admissibility runs before the model is consulted', () => {
  it('rejects an ineligible-role candidate without asking the model', async () => {
    const { outcome, judgment } = await run(
      { candidates: [candidate()] },
      {
        records: [
          record({
            id: recordId('rec-1'),
            epistemicRoles: ['ai_hypothesis'],
            evidenceUnitId: evidenceUnitId('eu-1'),
          }),
          record({
            id: recordId('rec-2'),
            epistemicRoles: ['external_reference'],
            evidenceUnitId: evidenceUnitId('eu-2'),
          }),
        ],
      },
    );

    expect(outcome.admitted).toEqual([]);
    expect(outcome.rejected[0]?.failures[0]?.gate).toBe('epistemic_eligibility');
    // Generation happened, but validation and scoring never did.
    expect(judgment.calls.generateCandidates).toBe(1);
    expect(judgment.calls.judgeComparability).toBe(0);
    expect(judgment.calls.judgeEvidenceDimensions).toBe(0);
  });

  it('rejects a lineage-collapsed candidate without scoring it', async () => {
    // INV-02/INV-03: comparing a source with its own derivative.
    const { outcome, judgment } = await run(
      { candidates: [candidate()] },
      {
        records: [
          record({ id: recordId('rec-1'), evidenceUnitId: evidenceUnitId('eu-1') }),
          record({
            id: recordId('rec-2'),
            sourceFingerprint: sourceFingerprint('fp-2'),
            evidenceUnitId: evidenceUnitId('eu-1'),
          }),
        ],
      },
    );

    expect(outcome.rejected[0]?.failures[0]?.gate).toBe('lineage_integrity');
    expect(judgment.calls.judgeEvidenceDimensions).toBe(0);
  });

  it('rejects a candidate referencing unresolved records', async () => {
    const { outcome } = await run(
      { candidates: [candidate({ recordRefs: [recordId('rec-1'), recordId('ghost')] })] },
      { records: [record({ id: recordId('rec-1') })] },
    );

    expect(outcome.admitted).toEqual([]);
    expect(outcome.rejected[0]?.failures[0]?.code).toBe('unresolved_record_ref');
  });
});

describe('§34 Stage 3 — Claim Validation', () => {
  it('rejects a shared-category axis', async () => {
    const { outcome, judgment } = await run({
      candidates: [candidate()],
      comparability: { onlySharedCategory: true },
    });

    expect(outcome.rejected[0]?.failures[0]?.code).toBe('only_shared_category');
    // Validation ran; scoring did not.
    expect(judgment.calls.judgeComparability).toBe(1);
    expect(judgment.calls.judgeEvidenceDimensions).toBe(0);
  });

  it('hard-fails a prohibited abstraction', async () => {
    const { outcome } = await run({
      candidates: [candidate()],
      abstraction: { prohibitedClaimDetected: true, category: 'personality' },
    });

    expect(outcome.admitted).toEqual([]);
    expect(outcome.rejected[0]?.failures[0]?.gate).toBe('abstraction_ceiling');
  });

  it('rejects an ordering claim over a reported interval', async () => {
    const { outcome } = await run(
      { candidates: [candidate({ assertsTemporalOrdering: true })] },
      {
        records: [
          record({
            id: recordId('rec-1'),
            evidenceUnitId: evidenceUnitId('eu-1'),
            time: {
              semantic: 'user_reported_interval',
              from: null,
              to: null,
              reportedAs: '这半年',
            },
          }),
          record({
            id: recordId('rec-2'),
            evidenceUnitId: evidenceUnitId('eu-2'),
          }),
        ],
      },
    );

    expect(outcome.rejected[0]?.failures[0]?.code).toBe(
      'ordering_over_reported_interval',
    );
  });

  it('scores Temporal Adequacy only after Gate 4 passes (§10.3)', async () => {
    // The illegal-ordering candidate above never reaches scoring at all, so
    // Temporal Adequacy cannot be scored on an illegible temporal basis.
    const { judgment } = await run(
      { candidates: [candidate({ assertsTemporalOrdering: true })] },
      { records: [record({ id: recordId('rec-1') })] },
    );

    expect(judgment.calls.judgeEvidenceDimensions).toBe(0);
  });
});

describe('§34 Stage 4 — Evidence Scoring', () => {
  it('attaches a complete auditable assessment', async () => {
    const { outcome } = await run({
      candidates: [candidate()],
      defaultScore: 3,
    });

    const claim = outcome.admitted[0];
    expect(claim?.assessment?.numericScore).toBe(100);
    expect(claim?.assessment?.supportLevel).toBe('strong');
    expect(claim?.supportLevel).toBe('strong');
    if (claim) expect(hasAuditableEvidence(claim)).toBe(true);
  });

  it('stores a reason for every dimension (Patch 8)', async () => {
    const { outcome } = await run({ candidates: [candidate()] });
    const judgments = outcome.admitted[0]?.assessment?.judgments;

    for (const d of EVIDENCE_DIMENSIONS) {
      const j = judgments?.[d];
      expect(j?.status).toBe('scored');
      expect((j?.reason ?? '').length).toBeGreaterThan(0);
    }
  });

  it('retains a candidate that passed every gate but cannot be scored', async () => {
    const { outcome } = await run({
      candidates: [candidate()],
      unavailable: [
        { dimension: 'temporal_adequacy', reason: 'no usable temporal data' },
      ],
    });

    // Neither admitted nor rejected: explicitly unscored (arch §11 Patch 9).
    expect(outcome.admitted).toEqual([]);
    expect(outcome.rejected).toEqual([]);
    expect(outcome.unscored).toHaveLength(1);
    expect(outcome.unscored[0]?.cause.unscored[0]?.dimension).toBe(
      'temporal_adequacy',
    );
  });

  it('treats an omitted dimension as needs_retry, not a default score', async () => {
    const { outcome } = await run({
      candidates: [candidate()],
      omit: ['counterevidence_balance'],
    });

    expect(outcome.unscored).toHaveLength(1);
    expect(outcome.unscored[0]?.cause.unscored[0]?.status).toBe('needs_retry');
  });

  it('reports noSufficientRelation when nothing could be scored', async () => {
    const { outcome } = await run({
      candidates: [candidate()],
      unavailable: [{ dimension: 'structural_strength', reason: 'x' }],
    });

    expect(outcome.noSufficientRelation).toBe(true);
  });
});

describe('§10.4 / INV-15 — the baseline ceiling is enforced by code', () => {
  it('clamps Specificity to 1 when no baseline exists', async () => {
    // The double reports 3 regardless; the DOMAIN must clamp it.
    const { outcome } = await run(
      {
        candidates: [candidate()],
        scores: { specificity_baseline_contrast: 3 },
      },
      {
        hasReliablePersonalBaseline: false,
        recordSuppliesInternalBaseline: false,
      },
    );

    const j = outcome.admitted[0]?.assessment?.judgments
      .specificity_baseline_contrast;

    expect(j?.status).toBe('scored');
    if (j?.status === 'scored') expect(j.score).toBe(1);
  });

  it('records the clamp in the reason, for auditability (§42)', async () => {
    const { outcome } = await run(
      {
        candidates: [candidate()],
        scores: { specificity_baseline_contrast: 3 },
      },
      {
        hasReliablePersonalBaseline: false,
        recordSuppliesInternalBaseline: false,
      },
    );

    const j = outcome.admitted[0]?.assessment?.judgments
      .specificity_baseline_contrast;

    expect(j?.reason).toContain('clamped');
    expect(j?.reason).toContain('INV-15');
  });

  it('does not clamp when the record supplies an internal baseline', async () => {
    // "我平时很少点这家，但那几周连续点了" (§10.4).
    const { outcome } = await run(
      {
        candidates: [candidate()],
        scores: { specificity_baseline_contrast: 3 },
      },
      {
        hasReliablePersonalBaseline: false,
        recordSuppliesInternalBaseline: true,
      },
    );

    const j = outcome.admitted[0]?.assessment?.judgments
      .specificity_baseline_contrast;

    if (j?.status === 'scored') expect(j.score).toBe(3);
  });

  it('lowers the final score when the clamp applies', async () => {
    const withBaseline = await run(
      { candidates: [candidate()], defaultScore: 3 },
      { hasReliablePersonalBaseline: true },
    );
    const withoutBaseline = await run(
      { candidates: [candidate()], defaultScore: 3 },
      {
        hasReliablePersonalBaseline: false,
        recordSuppliesInternalBaseline: false,
      },
    );

    // 100 vs 100 - (2 x 20)/3 rounded: the clamp costs real score.
    expect(withBaseline.outcome.admitted[0]?.assessment?.numericScore).toBe(100);
    expect(
      withoutBaseline.outcome.admitted[0]?.assessment?.numericScore,
    ).toBeLessThan(100);
  });

  it('clamps an out-of-range score as needs_retry, not silently', () => {
    // Scale validation precedes clamping, so a bad score surfaces as a defect.
    const judgments = assembleJudgments(
      EVIDENCE_DIMENSIONS.map((dimension) => ({
        dimension,
        status: 'scored' as const,
        score: dimension === 'specificity_baseline_contrast' ? 7 : 2,
        reason: 'r',
      })),
      {
        hasReliablePersonalBaseline: false,
        recordSuppliesInternalBaseline: false,
      },
    );

    expect(judgments.specificity_baseline_contrast.status).toBe('needs_retry');
  });
});

describe('§7.2 — "No Sufficient Relation" is an outcome, not a relation type', () => {
  it('never stores it as a relationType', async () => {
    const { outcome } = await run({ candidates: [] });

    expect(outcome.noSufficientRelation).toBe(true);
    expect(outcome.admitted).toEqual([]);
    // No claim exists to carry such a type.
    expect(
      outcome.admitted.map((c) => c.relationType),
    ).not.toContain('no_sufficient_relation');
  });

  it('carries an evaluation timestamp, so it is not a permanent verdict', async () => {
    const { outcome } = await run({ candidates: [] });
    expect(outcome.evaluatedAt).toEqual(NOW);
  });

  it('is false as soon as one claim is admitted', async () => {
    const { outcome } = await run({
      candidates: [candidate(), candidate({ relationType: 'contrast' })],
      comparability: {},
    });

    expect(outcome.noSufficientRelation).toBe(false);
  });
});

describe('record views handed to the model', () => {
  it('withholds evidence-unit and fingerprint identity (INV-16)', () => {
    const view = toRecordView(record());

    expect(view).not.toHaveProperty('evidenceUnitId');
    expect(view).not.toHaveProperty('sourceFingerprint');
  });

  it('preserves verbatim wording and time semantics', () => {
    const view = toRecordView(record());

    expect(view.verbatim).toBe('我可能只是害怕开始');
    expect(view.timeSemantic).toBe('observation_time');
  });

  it('describes a reported interval by the user wording', () => {
    const view = toRecordView(
      record({
        time: {
          semantic: 'user_reported_interval',
          from: null,
          to: null,
          reportedAs: '这半年',
        },
      }),
    );

    expect(view.timeDescription).toContain('这半年');
  });
});

describe('§13 — Relation stays descriptive', () => {
  it('produces no explanatory field on an admitted claim', async () => {
    const { outcome } = await run({ candidates: [candidate()] });
    const claim = outcome.admitted[0];

    expect(claim).not.toHaveProperty('cause');
    expect(claim).not.toHaveProperty('mechanism');
    expect(claim).not.toHaveProperty('motive');
    expect(claim).not.toHaveProperty('explanation');
    expect(claim).not.toHaveProperty('confidence');
  });
});

describe('§34 Stage 5 — State Transition', () => {
  it('starts an admitted claim in the neutral state', async () => {
    const { outcome } = await run({ candidates: [candidate()] });
    const claim = outcome.admitted[0];

    if (claim) {
      const state = initialStateForClaim(claim);
      expect(state.targetType).toBe('relation_claim');
      expect(state.targetRef).toBe(claim.id);
      expect(state.userPosition).toBe('none');
      expect(state.workflowState).toBe('active');
    }
  });

  it('assigns no presentation level or attention priority (INV-09)', async () => {
    const { outcome } = await run({
      candidates: [candidate()],
      defaultScore: 3,
    });
    const claim = outcome.admitted[0];

    if (claim) {
      const state = initialStateForClaim(claim);
      // Strong evidence must not imply high attention (§17, §18, INV-09).
      expect(state).not.toHaveProperty('attentionPriority');
      expect(state).not.toHaveProperty('presentationLevel');
    }
  });
});

describe('mixed batches', () => {
  it('partitions admitted, rejected, and unscored in one pass', async () => {
    const { outcome } = await run({
      candidates: [
        candidate({ relationType: 'good' }),
        candidate({ relationType: 'bad', recordRefs: [recordId('ghost')] }),
      ],
    });

    expect(outcome.admitted.map((c) => c.relationType)).toEqual(['good']);
    expect(outcome.rejected).toHaveLength(1);
    expect(outcome.noSufficientRelation).toBe(false);
  });

  it('mints one id per admitted claim', async () => {
    const { outcome } = await run({
      candidates: [candidate(), candidate({ relationType: 'contrast' })],
    });

    expect(outcome.admitted.map((c) => c.id)).toEqual(['claim-1', 'claim-2']);
  });
});
