/**
 * Phase 3 tests — the six Relation Hard Gates.
 *
 * Covers:
 *   ENGINEERING_CONTRACT §8 — all six gates, and their ordering before scoring.
 *   INV-01 / INV-06 — AI hypotheses and external references are not evidence.
 *   INV-02 / INV-03 / §6.1 — no double counting via summaries or repetition.
 *   INV-08 / §12 — a reported interval is not a sequence of observed points.
 *   INV-17 / §26 — analysis permission is distinct from storage permission.
 *   docs/architecture.md §7 (Patch 10) — Gate 6 reads a structured flag, not
 *                          keywords.
 */

import { describe, expect, it } from 'vitest';

import {
  EPISTEMICALLY_INELIGIBLE_ROLES,
  GATES,
  allGatesPass,
  gateAbstractionCeiling,
  gateEpistemicEligibility,
  gateLineageIntegrity,
  gateOperationalComparability,
  gateTemporalLegibility,
  gateUsagePermission,
  isEpistemicallyEligible,
  missingRecordRefs,
  runGates,
} from '@/domain/relation/gates';
import type { GateInputs } from '@/domain/relation/gates';
import type { RelationClaimCandidate } from '@/domain/relation/relation-claim';
import type { EffectivePermissions } from '@/domain/directive/directive-resolution';
import type { PersonalRecord } from '@/domain/record/record';
import type { EpistemicRole } from '@/domain/shared/enums';
import {
  directiveId,
  evidenceUnitId,
  recordId,
  sourceFingerprint,
} from '@/domain/shared/ids';
import type { TimeAssertion } from '@/domain/shared/time-semantics';

const AT = new Date('2026-09-01T00:00:00Z');
const LATER = new Date('2026-09-08T00:00:00Z');

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
  rawExpression: null,
  createdAt: AT,
  ...over,
});

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
  evidenceSummary: 'Both records show execution beginning close to the deadline.',
  assertsTemporalOrdering: false,
  ...over,
});

describe('gate registry', () => {
  it('declares exactly the six contract gates in order', () => {
    expect([...GATES]).toEqual([
      'usage_permission',
      'epistemic_eligibility',
      'operational_comparability',
      'temporal_legibility',
      'lineage_integrity',
      'abstraction_ceiling',
    ]);
  });
});

describe('Gate 1 — Usage Permission (§8, INV-17)', () => {
  it('passes when analysis is permitted', () => {
    expect(gateUsagePermission(permissions()).passed).toBe(true);
  });

  it('fails when a directive forbids analysis', () => {
    const outcome = gateUsagePermission(permissions({ allowAnalysis: false }));

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) {
      expect(outcome.failure.gate).toBe('usage_permission');
      expect(outcome.failure.code).toBe('analysis_not_permitted');
    }
  });

  it('consults analysis specifically, not storage', () => {
    // "只记录，不分析": storage allowed, analysis forbidden. A Relation Claim
    // IS analysis, so this must fail even though storage is permitted.
    const outcome = gateUsagePermission(
      permissions({ allowStorage: true, allowAnalysis: false }),
    );
    expect(outcome.passed).toBe(false);
  });

  it('is unaffected by presentation permissions', () => {
    expect(
      gateUsagePermission(
        permissions({
          allowPassivePresentation: false,
          allowProactivePresentation: false,
        }),
      ).passed,
    ).toBe(true);
  });

  it('names the applied directives in the failure detail', () => {
    const outcome = gateUsagePermission(
      permissions({
        allowAnalysis: false,
        appliedDirectiveIds: [directiveId('d-9')],
      }),
    );

    if (!outcome.passed) expect(outcome.failure.detail).toContain('d-9');
  });
});

describe('Gate 2 — Epistemic Eligibility (§8, INV-01, INV-06)', () => {
  it('declares AI hypotheses, external references, and product events ineligible', () => {
    expect([...EPISTEMICALLY_INELIGIBLE_ROLES]).toEqual([
      'ai_hypothesis',
      'external_reference',
      'product_event',
    ]);
  });

  it.each(['observed_event', 'observed_state', 'user_expression', 'user_reported_pattern'] as const)(
    'accepts a record whose role is %s',
    (role) => {
      expect(isEpistemicallyEligible(record({ epistemicRoles: [role] }))).toBe(true);
    },
  );

  it.each(EPISTEMICALLY_INELIGIBLE_ROLES)('rejects a %s record', (role) => {
    expect(isEpistemicallyEligible(record({ epistemicRoles: [role] }))).toBe(false);
  });

  it('rejects a record carrying ANY ineligible role alongside a benign one', () => {
    // A record labelled both user_expression and ai_hypothesis is still an AI
    // artifact; the benign label must not rescue it (§8 Gate 2 masquerade).
    const mixed: readonly EpistemicRole[] = ['user_expression', 'ai_hypothesis'];
    expect(isEpistemicallyEligible(record({ epistemicRoles: mixed }))).toBe(false);
  });

  it('fails the gate and names the offending role', () => {
    const outcome = gateEpistemicEligibility([
      record(),
      record({ id: recordId('rec-2'), epistemicRoles: ['external_reference'] }),
    ]);

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) {
      expect(outcome.failure.code).toBe('ineligible_epistemic_role');
      expect(outcome.failure.detail).toContain('external_reference');
      expect(outcome.failure.detail).toContain('rec-2');
    }
  });

  it('passes a fully eligible set', () => {
    expect(
      gateEpistemicEligibility([record(), record({ id: recordId('rec-2') })]).passed,
    ).toBe(true);
  });
});

describe('Gate 3 — Operational Comparability (§8)', () => {
  const judgment = (over = {}) => ({
    operationallySpecific: true,
    sameNature: true,
    onlySharedCategory: false,
    explanation: 'x',
    ...over,
  });

  it('passes a specific, same-nature axis', () => {
    expect(gateOperationalComparability(judgment()).passed).toBe(true);
  });

  it('fails when the axis reduces to a shared category', () => {
    // "它们都属于 X" — the named failure mode.
    const outcome = gateOperationalComparability(
      judgment({ onlySharedCategory: true }),
    );

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) expect(outcome.failure.code).toBe('only_shared_category');
  });

  it('fails a non-specific axis', () => {
    const outcome = gateOperationalComparability(
      judgment({ operationallySpecific: false }),
    );

    if (!outcome.passed) {
      expect(outcome.failure.code).toBe('axis_not_operationally_specific');
    }
  });

  it('fails a cross-nature comparison', () => {
    const outcome = gateOperationalComparability(judgment({ sameNature: false }));

    if (!outcome.passed) expect(outcome.failure.code).toBe('axis_not_same_nature');
  });

  it('treats shared-category as decisive even when other fields look fine', () => {
    const outcome = gateOperationalComparability(
      judgment({ onlySharedCategory: true, operationallySpecific: true }),
    );
    expect(outcome.passed).toBe(false);
  });
});

describe('Gate 4 — Temporal Legibility (§8, §5.1, INV-08)', () => {
  const interval: TimeAssertion = {
    semantic: 'user_reported_interval',
    from: null,
    to: null,
    reportedAs: '这半年我从来不主动打电话',
  };

  it('passes when the claim asserts no ordering', () => {
    expect(
      gateTemporalLegibility(candidate({ assertsTemporalOrdering: false }), [
        record({ time: interval }),
      ]).passed,
    ).toBe(true);
  });

  it('fails an ordering claim resting on a reported interval', () => {
    // §12 / INV-08: an interval is a later report about a span, not a sequence
    // of observed points, and may not be split into synthetic events.
    const outcome = gateTemporalLegibility(
      candidate({ assertsTemporalOrdering: true }),
      [record({ time: interval }), record({ id: recordId('rec-2') })],
    );

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) {
      expect(outcome.failure.gate).toBe('temporal_legibility');
      expect(outcome.failure.code).toBe('ordering_over_reported_interval');
    }
  });

  it('permits ordering across observation snapshots (§5.1)', () => {
    // A transition somewhere within the observation interval is legal; only an
    // exact transition time would not be.
    const outcome = gateTemporalLegibility(
      candidate({ assertsTemporalOrdering: true }),
      [
        record({ time: { semantic: 'observation_time', at: AT } }),
        record({
          id: recordId('rec-2'),
          time: { semantic: 'observation_time', at: LATER },
        }),
      ],
    );

    expect(outcome.passed).toBe(true);
  });

  it('fails an ordering claim with only one time point', () => {
    const outcome = gateTemporalLegibility(
      candidate({ assertsTemporalOrdering: true }),
      [record()],
    );

    if (!outcome.passed) {
      expect(outcome.failure.code).toBe('ordering_requires_multiple_points');
    }
  });

  it('judges legality only, never temporal strength', () => {
    // Two adjacent points are temporally WEAK but legally legible. Strength is
    // scored later as Temporal Adequacy (§10.3), not decided here.
    const outcome = gateTemporalLegibility(
      candidate({ assertsTemporalOrdering: true }),
      [
        record({ time: { semantic: 'event_time', at: AT } }),
        record({
          id: recordId('rec-2'),
          time: { semantic: 'event_time', at: new Date(AT.getTime() + 1000) },
        }),
      ],
    );

    expect(outcome.passed).toBe(true);
  });
});

describe('Gate 5 — Lineage Integrity / No Double Counting (§8, §6.1)', () => {
  it('passes a single-record claim', () => {
    // It makes no cross-record independence claim.
    expect(gateLineageIntegrity([record()]).passed).toBe(true);
  });

  it('passes two records from genuinely distinct Evidence Units', () => {
    expect(
      gateLineageIntegrity([
        record({ evidenceUnitId: evidenceUnitId('eu-1') }),
        record({ id: recordId('rec-2'), evidenceUnitId: evidenceUnitId('eu-2') }),
      ]).passed,
    ).toBe(true);
  });

  it('fails when a record is compared with its own summary', () => {
    // INV-02: a summary of an event is not another event. Both share eu-1.
    const outcome = gateLineageIntegrity([
      record({ id: recordId('rec-1'), evidenceUnitId: evidenceUnitId('eu-1') }),
      record({
        id: recordId('rec-2'),
        sourceFingerprint: sourceFingerprint('fp-2'),
        evidenceUnitId: evidenceUnitId('eu-1'),
      }),
    ]);

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) {
      expect(outcome.failure.gate).toBe('lineage_integrity');
      expect(outcome.failure.code).toBe('evidence_units_collapse');
    }
  });

  it('fails a claim built from repeated prompting of one source', () => {
    // INV-03: repeated questioning manufactures no new evidence. Three records,
    // one unit.
    const outcome = gateLineageIntegrity([
      record({ id: recordId('r1'), evidenceUnitId: evidenceUnitId('eu-1') }),
      record({ id: recordId('r2'), evidenceUnitId: evidenceUnitId('eu-1') }),
      record({ id: recordId('r3'), evidenceUnitId: evidenceUnitId('eu-1') }),
    ]);

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) expect(outcome.failure.detail).toContain('1 Evidence Unit');
  });

  it('counts units, not records', () => {
    // §10.2 warns against punishing a two-endpoint relation merely for having
    // two records. Four records over two units is fine at this gate.
    expect(
      gateLineageIntegrity([
        record({ id: recordId('r1'), evidenceUnitId: evidenceUnitId('eu-1') }),
        record({ id: recordId('r2'), evidenceUnitId: evidenceUnitId('eu-1') }),
        record({ id: recordId('r3'), evidenceUnitId: evidenceUnitId('eu-2') }),
        record({ id: recordId('r4'), evidenceUnitId: evidenceUnitId('eu-2') }),
      ]).passed,
    ).toBe(true);
  });
});

describe('Gate 6 — Abstraction Ceiling (§8, Patch 10)', () => {
  it('passes when no prohibited claim is detected', () => {
    expect(
      gateAbstractionCeiling({
        prohibitedClaimDetected: false,
        category: null,
        explanation: 'descriptive only',
      }).passed,
    ).toBe(true);
  });

  it.each([
    'personality',
    'identity',
    'permanent_trait',
    'hidden_motive',
    'certain_causal_explanation',
  ] as const)('hard-fails on a %s escalation', (category) => {
    const outcome = gateAbstractionCeiling({
      prohibitedClaimDetected: true,
      category,
      explanation: 'x',
    });

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) {
      expect(outcome.failure.code).toBe('prohibited_abstraction');
      expect(outcome.failure.detail).toContain(category);
    }
  });

  it('hard-fails on the flag even with a null category', () => {
    // The boolean is decisive regardless of any other field (Patch 10).
    expect(
      gateAbstractionCeiling({
        prohibitedClaimDetected: true,
        category: null,
        explanation: '',
      }).passed,
    ).toBe(false);
  });

  it('does not scan the explanation for forbidden words', () => {
    // Patch 10 dropped keyword matching as the enforcement mechanism. An
    // explanation merely MENTIONING personality must not trip the gate.
    expect(
      gateAbstractionCeiling({
        prohibitedClaimDetected: false,
        category: null,
        explanation:
          'This is descriptive and makes no claim about personality or identity.',
      }).passed,
    ).toBe(true);
  });
});

describe('running all gates together', () => {
  const inputs = (over: Partial<GateInputs> = {}): GateInputs => ({
    candidate: candidate(),
    records: [
      record({ id: recordId('rec-1'), evidenceUnitId: evidenceUnitId('eu-1') }),
      record({ id: recordId('rec-2'), evidenceUnitId: evidenceUnitId('eu-2') }),
    ],
    permissions: permissions(),
    comparability: {
      operationallySpecific: true,
      sameNature: true,
      onlySharedCategory: false,
      explanation: 'x',
    },
    abstractionCeiling: {
      prohibitedClaimDetected: false,
      category: null,
      explanation: 'x',
    },
    ...over,
  });

  it('passes a clean candidate', () => {
    expect(runGates(inputs())).toEqual([]);
    expect(allGatesPass(inputs())).toBe(true);
  });

  it('collects every failure rather than short-circuiting', () => {
    // §42 auditability: a candidate failing both Gate 2 and Gate 5 should say
    // so, not report only the first problem found.
    const failures = runGates(
      inputs({
        records: [
          record({
            id: recordId('rec-1'),
            epistemicRoles: ['ai_hypothesis'],
            evidenceUnitId: evidenceUnitId('eu-1'),
          }),
          record({
            id: recordId('rec-2'),
            epistemicRoles: ['ai_hypothesis'],
            evidenceUnitId: evidenceUnitId('eu-1'),
          }),
        ],
      }),
    );

    expect(failures.map((f) => f.gate)).toEqual([
      'epistemic_eligibility',
      'lineage_integrity',
    ]);
  });

  it('reports all six gates failing at once', () => {
    const failures = runGates(
      inputs({
        candidate: candidate({ assertsTemporalOrdering: true }),
        records: [
          record({
            id: recordId('rec-1'),
            epistemicRoles: ['external_reference'],
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
            epistemicRoles: ['external_reference'],
            evidenceUnitId: evidenceUnitId('eu-1'),
          }),
        ],
        permissions: permissions({ allowAnalysis: false }),
        comparability: {
          operationallySpecific: false,
          sameNature: false,
          onlySharedCategory: true,
          explanation: 'x',
        },
        abstractionCeiling: {
          prohibitedClaimDetected: true,
          category: 'personality',
          explanation: 'x',
        },
      }),
    );

    expect(failures).toHaveLength(6);
    expect(new Set(failures.map((f) => f.gate)).size).toBe(6);
  });
});

describe('unresolved record references', () => {
  it('reports refs absent from the resolved set', () => {
    const missing = missingRecordRefs(candidate(), [record({ id: recordId('rec-1') })]);
    expect(missing).toEqual([recordId('rec-2')]);
  });

  it('reports none when all refs resolve', () => {
    expect(
      missingRecordRefs(candidate(), [
        record({ id: recordId('rec-1') }),
        record({ id: recordId('rec-2') }),
      ]),
    ).toEqual([]);
  });
});
