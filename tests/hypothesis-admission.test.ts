/**
 * Phase 4 tests — Hypothesis Admission Gates H1–H6 and the §16.2 suspension
 * constraint.
 *
 * Covers:
 *   §14 H1 — anchor: a `supported`+ Relation, or >=2 mutually independent
 *            Observed Patterns. Independence is keyed on evidence_unit_id
 *            identity, NEVER on pattern label (user-confirmed strict reading).
 *   §14 H2 — Compatibility is not Support; absence of contradiction is not
 *            evidence of support.
 *   §14 H3 — explanatory gain: mechanism + >=1 discriminating prediction.
 *   §14 H4 — competing explanations remain possible.
 *   §14 H5 — the system can name what would strengthen AND weaken.
 *   §14 H6 — no personality / identity / permanent attribute / essential
 *            nature / certain causality.
 *   §16.2  — a suspended Relation yields no new Hypothesis generation.
 *   INV-01 / INV-06 / INV-02 / INV-03 — support may not rest on AI output,
 *            external references, or one source counted twice.
 */

import { describe, expect, it } from 'vitest';

import {
  ADMISSION_GATES,
  MIN_EVIDENCE_UNITS_PER_PATTERN,
  MIN_INDEPENDENT_PATTERNS,
  PATH_A_SUFFICIENT_LEVELS,
  type AdmissionInputs,
  gateAlternativeAwareness,
  gateAnchor,
  gateDiscriminatingEvidence,
  gateExplanatoryGain,
  gateHypothesisAbstractionCeiling,
  gateNotSuspended,
  gatePositiveDirectionalSupport,
  isAdmissible,
  patternsAreMutuallyIndependent,
  runAdmissionGates,
} from '@/domain/hypothesis/admission-gates';
import {
  ADMISSIBLE_SUPPORT_BASIS,
  SUPPORT_BASES,
  type HypothesisCandidate,
  type ObservedPattern,
} from '@/domain/hypothesis/hypothesis';
import type { StoredRelationClaim } from '@/domain/relation/relation-claim';
import type { PersonalRecord } from '@/domain/record/record';
import {
  evidenceUnitId,
  recordId,
  relationClaimId,
  sourceFingerprint,
} from '@/domain/shared/ids';

const AT = new Date('2026-09-01T00:00:00Z');

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

/**
 * Gate-level fixture. Only `supportLevel` is read by H1, so the assessment is
 * left null here; the full Patch 8 coupling is covered in the Phase 3 suites.
 */
const claim = (over: Partial<StoredRelationClaim> = {}): StoredRelationClaim => ({
  id: relationClaimId('claim-1'),
  recordRefs: [recordId('rec-1')],
  comparisonAxis: { question: 'q', dimension: 'd' },
  relationType: 'co_occurrence',
  evidenceSummary: 's',
  assertsTemporalOrdering: false,
  assessment: null,
  supportLevel: 'supported',
  createdAt: AT,
  ...over,
});

const pattern = (over: Partial<ObservedPattern> = {}): ObservedPattern => ({
  claimId: relationClaimId('claim-1'),
  label: 'delays starting until close to deadline',
  evidenceUnitIds: ['eu-1', 'eu-2'],
  ...over,
});

const candidate = (
  over: Partial<HypothesisCandidate> = {},
): HypothesisCandidate => ({
  explanation: 'Starting may be delayed until external pressure supplies structure.',
  anchorRefs: [relationClaimId('claim-1')],
  anchorPath: 'supported_relation',
  patterns: [],
  supportBasis: 'directional_observation',
  supportingRecordRefs: [recordId('rec-1'), recordId('rec-2')],
  explanatoryGain: {
    mechanism: 'Deadline proximity supplies the structure otherwise absent.',
    discriminatingPredictions: [
      'Given an externally structured task, execution should begin earlier.',
    ],
  },
  alternatives: [
    'Task ambiguity, not pressure, governs the delay.',
    'Competing obligations displaced the work.',
  ],
  discriminatingEvidence: {
    wouldStrengthen: ['An early start on a task with imposed structure.'],
    wouldWeaken: ['Equal delay on a fully structured task.'],
  },
  ...over,
});

/** Two supporting records on distinct Evidence Units — clean H2 material. */
const twoIndependent = (): readonly PersonalRecord[] => [
  record({ id: recordId('rec-1'), evidenceUnitId: evidenceUnitId('eu-1') }),
  record({
    id: recordId('rec-2'),
    sourceFingerprint: sourceFingerprint('fp-2'),
    evidenceUnitId: evidenceUnitId('eu-2'),
  }),
];

describe('gate registry', () => {
  it('declares exactly the six contract gates', () => {
    expect([...ADMISSION_GATES]).toEqual([
      'anchor',
      'positive_directional_support',
      'explanatory_gain',
      'alternative_awareness',
      'discriminating_evidence',
      'abstraction_ceiling',
    ]);
  });
});

describe('H1 path A — a Supported Relation anchor', () => {
  it('admits only `supported` and `strong`', () => {
    expect([...PATH_A_SUFFICIENT_LEVELS]).toEqual(['supported', 'strong']);
  });

  it.each(['supported', 'strong'] as const)('passes at %s', (level) => {
    expect(gateAnchor(candidate(), [claim({ supportLevel: level })]).passed).toBe(
      true,
    );
  });

  it.each(['weak', 'observed'] as const)('fails at %s', (level) => {
    const outcome = gateAnchor(candidate(), [claim({ supportLevel: level })]);

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) {
      expect(outcome.failure.gate).toBe('anchor');
      expect(outcome.failure.code).toBe('no_supported_relation');
    }
  });

  it('fails on an unscored claim', () => {
    // An unscored claim is not a weakly supported one; it anchors nothing.
    const outcome = gateAnchor(candidate(), [
      claim({ supportLevel: null, assessment: null }),
    ]);

    expect(outcome.passed).toBe(false);
  });

  it('fails when no anchor claim resolves', () => {
    expect(gateAnchor(candidate(), []).passed).toBe(false);
  });

  it('passes when at least one of several anchors qualifies', () => {
    expect(
      gateAnchor(candidate(), [
        claim({ id: relationClaimId('c1'), supportLevel: 'weak' }),
        claim({ id: relationClaimId('c2'), supportLevel: 'strong' }),
      ]).passed,
    ).toBe(true);
  });
});

describe('H1 path B — mutually independent Observed Patterns (strict)', () => {
  const pathB = (patterns: readonly ObservedPattern[]) =>
    gateAnchor(
      candidate({ anchorPath: 'independent_patterns', patterns }),
      [],
    );

  it('requires at least two patterns', () => {
    expect(MIN_INDEPENDENT_PATTERNS).toBe(2);

    const outcome = pathB([pattern()]);
    expect(outcome.passed).toBe(false);
    if (!outcome.passed) expect(outcome.failure.code).toBe('insufficient_patterns');
  });

  it('requires each pattern to rest on repeated evidence', () => {
    // Strict reading: a Pattern implies repetition, so one Evidence Unit is not
    // a pattern.
    expect(MIN_EVIDENCE_UNITS_PER_PATTERN).toBe(2);

    const outcome = pathB([
      pattern({ claimId: relationClaimId('c1'), evidenceUnitIds: ['eu-1'] }),
      pattern({ claimId: relationClaimId('c2'), evidenceUnitIds: ['eu-2', 'eu-3'] }),
    ]);

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) expect(outcome.failure.code).toBe('pattern_not_repeated');
  });

  it('passes two patterns on fully disjoint Evidence Units', () => {
    expect(
      pathB([
        pattern({ claimId: relationClaimId('c1'), evidenceUnitIds: ['eu-1', 'eu-2'] }),
        pattern({ claimId: relationClaimId('c2'), evidenceUnitIds: ['eu-3', 'eu-4'] }),
      ]).passed,
    ).toBe(true);
  });

  it('fails when two patterns share ANY Evidence Unit', () => {
    const outcome = pathB([
      pattern({ claimId: relationClaimId('c1'), evidenceUnitIds: ['eu-1', 'eu-2'] }),
      pattern({ claimId: relationClaimId('c2'), evidenceUnitIds: ['eu-2', 'eu-3'] }),
    ]);

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) {
      expect(outcome.failure.code).toBe('patterns_not_independent');
      expect(outcome.failure.detail).toContain('eu-2');
    }
  });

  it('decides independence by evidence unit, NOT by pattern label', () => {
    // The core of the strict reading: two differently-named patterns drawn from
    // one source are one piece of evidence wearing two hats. Distinct labels and
    // distinct claim ids must not rescue them.
    const outcome = pathB([
      pattern({
        claimId: relationClaimId('c1'),
        label: 'avoids starting under ambiguity',
        evidenceUnitIds: ['eu-1', 'eu-2'],
      }),
      pattern({
        claimId: relationClaimId('c2'),
        label: 'defers work until deadline pressure',
        evidenceUnitIds: ['eu-1', 'eu-2'],
      }),
    ]);

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) {
      expect(outcome.failure.code).toBe('patterns_not_independent');
    }
  });

  it('is not rescued by a larger union across overlapping patterns', () => {
    // Union size 3 > 1, but the patterns still overlap on eu-1. Pairwise
    // disjointness is required, not merely a union bigger than one.
    expect(
      patternsAreMutuallyIndependent([
        pattern({ evidenceUnitIds: ['eu-1', 'eu-2'] }),
        pattern({ evidenceUnitIds: ['eu-1', 'eu-3'] }),
      ]),
    ).toBe(false);
  });

  it('tolerates a pattern citing the same unit twice internally', () => {
    // Within-pattern duplication is not cross-pattern overlap, though it does
    // reduce that pattern's distinct-unit count.
    const outcome = pathB([
      pattern({ claimId: relationClaimId('c1'), evidenceUnitIds: ['eu-1', 'eu-1', 'eu-2'] }),
      pattern({ claimId: relationClaimId('c2'), evidenceUnitIds: ['eu-3', 'eu-4'] }),
    ]);

    expect(outcome.passed).toBe(true);
  });

  it('fails a pattern whose duplication leaves it under the threshold', () => {
    const outcome = pathB([
      pattern({ claimId: relationClaimId('c1'), evidenceUnitIds: ['eu-1', 'eu-1'] }),
      pattern({ claimId: relationClaimId('c2'), evidenceUnitIds: ['eu-2', 'eu-3'] }),
    ]);

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) expect(outcome.failure.code).toBe('pattern_not_repeated');
  });

  it('checks independence pairwise across three patterns', () => {
    expect(
      patternsAreMutuallyIndependent([
        pattern({ evidenceUnitIds: ['eu-1', 'eu-2'] }),
        pattern({ evidenceUnitIds: ['eu-3', 'eu-4'] }),
        pattern({ evidenceUnitIds: ['eu-4', 'eu-5'] }),
      ]),
    ).toBe(false);
  });

  it('does not consult relation claim support level on path B', () => {
    // Path B stands on pattern independence, not on a `supported` level.
    expect(
      pathB([
        pattern({ claimId: relationClaimId('c1'), evidenceUnitIds: ['eu-1', 'eu-2'] }),
        pattern({ claimId: relationClaimId('c2'), evidenceUnitIds: ['eu-3', 'eu-4'] }),
      ]).passed,
    ).toBe(true);
  });
});

describe('H2 — Positive Directional Support', () => {
  it('declares exactly the four contract bases', () => {
    expect([...SUPPORT_BASES]).toEqual([
      'directional_observation',
      'compatibility_only',
      'absence_of_contradiction',
      'insufficient',
    ]);
  });

  it('admits only directional_observation', () => {
    expect(ADMISSIBLE_SUPPORT_BASIS).toBe('directional_observation');
    expect(
      gatePositiveDirectionalSupport(candidate(), twoIndependent()).passed,
    ).toBe(true);
  });

  it('rejects compatibility_only — compatibility is not support', () => {
    const outcome = gatePositiveDirectionalSupport(
      candidate({ supportBasis: 'compatibility_only' }),
      twoIndependent(),
    );

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) {
      expect(outcome.failure.gate).toBe('positive_directional_support');
      expect(outcome.failure.code).toBe('support_basis_compatibility_only');
    }
  });

  it('rejects absence_of_contradiction — not evidence of support', () => {
    const outcome = gatePositiveDirectionalSupport(
      candidate({ supportBasis: 'absence_of_contradiction' }),
      twoIndependent(),
    );

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) {
      expect(outcome.failure.code).toBe('support_basis_absence_of_contradiction');
    }
  });

  it('rejects insufficient', () => {
    expect(
      gatePositiveDirectionalSupport(
        candidate({ supportBasis: 'insufficient' }),
        twoIndependent(),
      ).passed,
    ).toBe(false);
  });

  it('requires support to name at least one record', () => {
    const outcome = gatePositiveDirectionalSupport(
      candidate({ supportingRecordRefs: [] }),
      [],
    );

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) expect(outcome.failure.code).toBe('no_supporting_records');
  });

  it('fails when a named supporting record cannot be resolved', () => {
    const outcome = gatePositiveDirectionalSupport(candidate(), [
      record({ id: recordId('rec-1') }),
    ]);

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) {
      expect(outcome.failure.code).toBe('unresolved_supporting_record');
      expect(outcome.failure.detail).toContain('rec-2');
    }
  });

  it.each(['ai_hypothesis', 'external_reference', 'product_event'] as const)(
    'rejects %s as directional support',
    (role) => {
      const outcome = gatePositiveDirectionalSupport(
        candidate({ supportingRecordRefs: [recordId('rec-1')] }),
        [record({ id: recordId('rec-1'), epistemicRoles: [role] })],
      );

      expect(outcome.passed).toBe(false);
      if (!outcome.passed) {
        expect(outcome.failure.code).toBe('ineligible_supporting_record');
      }
    },
  );

  it('rejects support collapsing to one Evidence Unit', () => {
    // INV-02/INV-03: repetition of one source is not additional support.
    const outcome = gatePositiveDirectionalSupport(candidate(), [
      record({ id: recordId('rec-1'), evidenceUnitId: evidenceUnitId('eu-1') }),
      record({
        id: recordId('rec-2'),
        sourceFingerprint: sourceFingerprint('fp-2'),
        evidenceUnitId: evidenceUnitId('eu-1'),
      }),
    ]);

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) {
      expect(outcome.failure.code).toBe('supporting_records_collapse');
    }
  });

  it('accepts a single supporting record', () => {
    // One record makes no cross-record independence claim.
    expect(
      gatePositiveDirectionalSupport(
        candidate({ supportingRecordRefs: [recordId('rec-1')] }),
        [record({ id: recordId('rec-1') })],
      ).passed,
    ).toBe(true);
  });
});

describe('H3 — Explanatory Gain', () => {
  it('passes with a mechanism and a discriminating prediction', () => {
    expect(gateExplanatoryGain(candidate()).passed).toBe(true);
  });

  it('fails with no mechanism', () => {
    const outcome = gateExplanatoryGain(
      candidate({
        explanatoryGain: { mechanism: '', discriminatingPredictions: ['p'] },
      }),
    );

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) expect(outcome.failure.code).toBe('no_mechanism');
  });

  it('fails on whitespace-only mechanism', () => {
    expect(
      gateExplanatoryGain(
        candidate({
          explanatoryGain: { mechanism: '   ', discriminatingPredictions: ['p'] },
        }),
      ).passed,
    ).toBe(false);
  });

  it('fails with no discriminating prediction', () => {
    // A prediction shared by every candidate discriminates nothing.
    const outcome = gateExplanatoryGain(
      candidate({
        explanatoryGain: { mechanism: 'm', discriminatingPredictions: [] },
      }),
    );

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) {
      expect(outcome.failure.code).toBe('no_discriminating_prediction');
    }
  });
});

describe('H4 — Alternative Awareness', () => {
  it('passes when rivals remain', () => {
    expect(gateAlternativeAwareness(candidate()).passed).toBe(true);
  });

  it('fails when the hypothesis is the only account offered', () => {
    const outcome = gateAlternativeAwareness(candidate({ alternatives: [] }));

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) expect(outcome.failure.code).toBe('no_alternatives');
  });

  it('accepts a single alternative', () => {
    expect(
      gateAlternativeAwareness(candidate({ alternatives: ['other'] })).passed,
    ).toBe(true);
  });
});

describe('H5 — Discriminating Evidence', () => {
  it('passes when both directions are named', () => {
    expect(gateDiscriminatingEvidence(candidate()).passed).toBe(true);
  });

  it('fails with nothing that would strengthen', () => {
    const outcome = gateDiscriminatingEvidence(
      candidate({
        discriminatingEvidence: { wouldStrengthen: [], wouldWeaken: ['w'] },
      }),
    );

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) {
      expect(outcome.failure.code).toBe('no_strengthening_evidence');
    }
  });

  it('fails with nothing that would weaken — unfalsifiable', () => {
    const outcome = gateDiscriminatingEvidence(
      candidate({
        discriminatingEvidence: { wouldStrengthen: ['s'], wouldWeaken: [] },
      }),
    );

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) {
      expect(outcome.failure.code).toBe('no_weakening_evidence');
      expect(outcome.failure.detail).toContain('unfalsifiable');
    }
  });
});

describe('H6 — Abstraction Ceiling', () => {
  it('passes a descriptive explanation', () => {
    expect(
      gateHypothesisAbstractionCeiling({
        prohibitedClaimDetected: false,
        category: null,
        explanation: 'conditional, not essential',
      }).passed,
    ).toBe(true);
  });

  it.each([
    'personality',
    'identity',
    'permanent_trait',
    'hidden_motive',
    'certain_causal_explanation',
  ] as const)('hard-fails a %s escalation', (category) => {
    const outcome = gateHypothesisAbstractionCeiling({
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

  it('does not scan the explanation for forbidden words', () => {
    // Patch 10: enforcement is the structured flag, not keyword matching.
    expect(
      gateHypothesisAbstractionCeiling({
        prohibitedClaimDetected: false,
        category: null,
        explanation: 'This makes no claim about personality or permanent traits.',
      }).passed,
    ).toBe(true);
  });
});

describe('§16.2 — suspension blocks new hypothesis generation', () => {
  it('passes when no anchor is suspended', () => {
    expect(
      gateNotSuspended([{ targetRef: 'claim-1', workflowState: 'active' }]).passed,
    ).toBe(true);
  });

  it('fails when an anchor is suspended', () => {
    const outcome = gateNotSuspended([
      { targetRef: 'claim-1', workflowState: 'suspended' },
    ]);

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) {
      expect(outcome.failure.gate).toBe('suspension');
      expect(outcome.failure.code).toBe('anchor_suspended');
    }
  });

  it('states that the evidence survives suspension', () => {
    // §16.1 keeps `strong` + `disagrees` + `suspended` a valid combination:
    // suspension halts progression, it does not erase evidence.
    const outcome = gateNotSuspended([
      { targetRef: 'claim-1', workflowState: 'suspended' },
    ]);

    if (!outcome.passed) {
      expect(outcome.failure.detail).toContain('evidence remains');
    }
  });

  it('passes on an empty anchor-state list', () => {
    expect(gateNotSuspended([]).passed).toBe(true);
  });
});

describe('running all gates together', () => {
  const inputs = (over: Partial<AdmissionInputs> = {}): AdmissionInputs => ({
    candidate: candidate(),
    anchorClaims: [claim({ supportLevel: 'supported' })],
    supportingRecords: twoIndependent(),
    abstractionCeiling: {
      prohibitedClaimDetected: false,
      category: null,
      explanation: 'x',
    },
    anchorStates: [{ targetRef: 'claim-1', workflowState: 'active' }],
    ...over,
  });

  it('admits a clean candidate', () => {
    expect(runAdmissionGates(inputs())).toEqual([]);
    expect(isAdmissible(inputs())).toBe(true);
  });

  it('collects every failure rather than short-circuiting', () => {
    // §42 auditability: a candidate failing H2 and H5 reports both.
    const failures = runAdmissionGates(
      inputs({
        candidate: candidate({
          supportBasis: 'compatibility_only',
          discriminatingEvidence: { wouldStrengthen: ['s'], wouldWeaken: [] },
        }),
      }),
    );

    expect(failures.map((f) => f.gate)).toEqual([
      'positive_directional_support',
      'discriminating_evidence',
    ]);
  });

  it('reports all seven checks failing at once', () => {
    const failures = runAdmissionGates(
      inputs({
        candidate: candidate({
          anchorPath: 'independent_patterns',
          patterns: [],
          supportBasis: 'insufficient',
          supportingRecordRefs: [],
          explanatoryGain: { mechanism: '', discriminatingPredictions: [] },
          alternatives: [],
          discriminatingEvidence: { wouldStrengthen: [], wouldWeaken: [] },
        }),
        anchorClaims: [],
        supportingRecords: [],
        abstractionCeiling: {
          prohibitedClaimDetected: true,
          category: 'personality',
          explanation: 'x',
        },
        anchorStates: [{ targetRef: 'claim-1', workflowState: 'suspended' }],
      }),
    );

    // Six numbered gates plus the suspension check.
    expect(failures).toHaveLength(7);
    expect(new Set(failures.map((f) => f.gate)).size).toBe(7);
  });
});
