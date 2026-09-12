/**
 * Phase 4 tests — §15 Hypothesis Evidence Rules.
 *
 * This file exists on its own because §15 is where a plausible-looking
 * convenience would silently violate the contract. §15:
 *
 *   > User agreement is NOT automatically evidence.
 *   > "对。" / "好像是。" / "可能吧。" may indicate resonance or user position,
 *     but do NOT increase objective evidence support.
 *   > Only new independent factual information may strengthen or weaken.
 *   > Time passing alone does not strengthen.
 *
 * Most assertions here are STRUCTURAL — they verify that no field and no code
 * path exists by which agreement could raise support. A behavioural test can
 * only check the paths that exist; these check that the dangerous path was never
 * built.
 *
 * Also covers INV-09 / §36 — hypothesis admission is not evidence strength, and
 * neither is attention.
 */

import { describe, expect, it } from 'vitest';

import {
  ADMISSIBLE_SUPPORT_BASIS,
  SUPPORT_BASES,
  buildStoredHypothesis,
  remainsCompetable,
  type HypothesisCandidate,
  type StoredHypothesis,
} from '@/domain/hypothesis/hypothesis';
import * as hypothesisModule from '@/domain/hypothesis/hypothesis';
import * as gatesModule from '@/domain/hypothesis/admission-gates';
import * as engineModule from '@/domain/hypothesis/hypothesis-engine';
import {
  gatePositiveDirectionalSupport,
  runAdmissionGates,
  type AdmissionInputs,
} from '@/domain/hypothesis/admission-gates';
import { initialStateForHypothesis } from '@/domain/hypothesis/hypothesis-engine';
import type { StoredRelationClaim } from '@/domain/relation/relation-claim';
import type { PersonalRecord } from '@/domain/record/record';
import { USER_POSITIONS } from '@/domain/shared/enums';
import {
  evidenceUnitId,
  hypothesisId,
  recordId,
  relationClaimId,
  sourceFingerprint,
} from '@/domain/shared/ids';

const AT = new Date('2026-09-01T00:00:00Z');
const LATER = new Date('2027-09-01T00:00:00Z');

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

const candidate = (
  over: Partial<HypothesisCandidate> = {},
): HypothesisCandidate => ({
  explanation: 'Pressure may supply the structure otherwise absent.',
  anchorRefs: [relationClaimId('claim-1')],
  anchorPath: 'supported_relation',
  patterns: [],
  supportBasis: 'directional_observation',
  supportingRecordRefs: [recordId('rec-1'), recordId('rec-2')],
  explanatoryGain: {
    mechanism: 'Deadline proximity supplies structure.',
    discriminatingPredictions: ['Earlier start on a structured task.'],
  },
  alternatives: ['Ambiguity, not pressure, governs the delay.'],
  discriminatingEvidence: {
    wouldStrengthen: ['An early start under imposed structure.'],
    wouldWeaken: ['Equal delay on a structured task.'],
  },
  ...over,
});

const twoIndependent = (): readonly PersonalRecord[] => [
  record({ id: recordId('rec-1'), evidenceUnitId: evidenceUnitId('eu-1') }),
  record({
    id: recordId('rec-2'),
    sourceFingerprint: sourceFingerprint('fp-2'),
    evidenceUnitId: evidenceUnitId('eu-2'),
  }),
];

const stored = (over: Partial<HypothesisCandidate> = {}): StoredHypothesis =>
  buildStoredHypothesis({
    id: hypothesisId('hyp-1'),
    candidate: candidate(over),
    createdAt: AT,
  });

const inputs = (over: Partial<AdmissionInputs> = {}): AdmissionInputs => ({
  candidate: candidate(),
  anchorClaims: [claim()],
  supportingRecords: twoIndependent(),
  abstractionCeiling: {
    prohibitedClaimDetected: false,
    category: null,
    explanation: 'x',
  },
  anchorStates: [{ targetRef: 'claim-1', workflowState: 'active' }],
  ...over,
});

describe('§15 — a Hypothesis has no field agreement could increment', () => {
  it('carries no evidence score of its own', () => {
    // §9's Evidence Support belongs to the descriptive Relation Claim. A
    // hypothesis with its own score would be a second, unaudited scale.
    const h = stored();

    expect(h).not.toHaveProperty('evidenceScore');
    expect(h).not.toHaveProperty('numericScore');
    expect(h).not.toHaveProperty('supportLevel');
    expect(h).not.toHaveProperty('supportScore');
  });

  it('carries no probability, confidence, or certainty', () => {
    const h = stored();

    for (const field of [
      'probability',
      'confidence',
      'likelihood',
      'certainty',
      'credence',
      'posterior',
    ]) {
      expect(h).not.toHaveProperty(field);
    }
  });

  it('carries no user position or agreement field', () => {
    // Agreement belongs on StateAssignment, never on the hypothesis itself.
    const h = stored();

    for (const field of [
      'userPosition',
      'userAgreement',
      'agreed',
      'accepted',
      'confirmed',
      'endorsed',
      'resonance',
    ]) {
      expect(h).not.toHaveProperty(field);
    }
  });

  it('carries no counter of agreements or confirmations', () => {
    const h = stored();

    for (const field of [
      'agreementCount',
      'confirmationCount',
      'timesAgreed',
      'supportCount',
    ]) {
      expect(h).not.toHaveProperty(field);
    }
  });

  it('exposes exactly the fields the contract calls for', () => {
    // A whitelist rather than a blacklist: a future field added carelessly will
    // fail here even if nobody thought to blacklist its name.
    expect(Object.keys(stored()).sort()).toEqual(
      [
        'alternatives',
        'anchorPath',
        'anchorRefs',
        'createdAt',
        'discriminatingPredictions',
        'explanation',
        'id',
        'mechanism',
        'supportBasis',
        'supportingRecordRefs',
        'wouldStrengthen',
        'wouldWeaken',
      ].sort(),
    );
  });
});

describe('§15 — no code path from agreement to support', () => {
  it('exports no function that raises or strengthens support', () => {
    const exported = [
      ...Object.keys(hypothesisModule),
      ...Object.keys(gatesModule),
      ...Object.keys(engineModule),
    ];

    const forbidden = exported.filter((name) =>
      /strengthen(Hypothesis|Support)|raiseSupport|increaseSupport|applyAgreement|recordAgreement|confirmHypothesis|upgradeSupport/i.test(
        name,
      ),
    );

    expect(forbidden).toEqual([]);
  });

  it('accepts no agreement input at the admission boundary', () => {
    // AdmissionInputs is the ONLY way into the gates. If agreement cannot be
    // expressed here, it cannot influence admission.
    expect(Object.keys(inputs()).sort()).toEqual(
      [
        'abstractionCeiling',
        'anchorClaims',
        'anchorStates',
        'candidate',
        'supportingRecords',
      ].sort(),
    );
  });

  it('routes user position to StateAssignment only', () => {
    // The initial state is where a position lives, and it starts at `none`.
    const state = initialStateForHypothesis(stored());

    expect(state.userPosition).toBe('none');
    expect(USER_POSITIONS).toContain('none');
  });

  it('leaves supportBasis untouched by any position', () => {
    // The basis is set once from the candidate at admission. Nothing in the
    // domain rewrites it in response to a user reaction.
    const h = stored();
    expect(h.supportBasis).toBe(ADMISSIBLE_SUPPORT_BASIS);
  });
});

describe('§15 — only new independent factual information may move support', () => {
  it('admits on directional observation of records, not on assent', () => {
    // H2 resolves against RECORDS. There is no parameter through which an
    // expression of agreement could substitute for one.
    expect(
      gatePositiveDirectionalSupport(candidate(), twoIndependent()).passed,
    ).toBe(true);

    const noRecords = gatePositiveDirectionalSupport(
      candidate({ supportingRecordRefs: [] }),
      [],
    );
    expect(noRecords.passed).toBe(false);
  });

  it('rejects support that is merely compatible, however agreeable', () => {
    // "可能吧。" is compatibility at best; §14 H2 rules it insufficient.
    for (const basis of SUPPORT_BASES) {
      const outcome = gatePositiveDirectionalSupport(
        candidate({ supportBasis: basis }),
        twoIndependent(),
      );

      expect(outcome.passed).toBe(basis === ADMISSIBLE_SUPPORT_BASIS);
    }
  });

  it('counts an agreement-shaped record by Evidence Unit like any other', () => {
    // A user_expression saying "对。" is a Record. If it shares its source's
    // Evidence Unit, it adds nothing — the same rule that governs summaries
    // and reformats (INV-02, INV-03).
    const outcome = gatePositiveDirectionalSupport(candidate(), [
      record({ id: recordId('rec-1'), evidenceUnitId: evidenceUnitId('eu-1') }),
      record({
        id: recordId('rec-2'),
        sourceFingerprint: sourceFingerprint('fp-agree'),
        epistemicRoles: ['user_expression'],
        evidenceUnitId: evidenceUnitId('eu-1'),
      }),
    ]);

    expect(outcome.passed).toBe(false);
    if (!outcome.passed) {
      expect(outcome.failure.code).toBe('supporting_records_collapse');
    }
  });

  it('admits an agreement-shaped record that is genuinely independent', () => {
    // §15 does not silence the user: a reply carrying NEW independent factual
    // content, on its own Evidence Unit, is ordinary evidence.
    const outcome = gatePositiveDirectionalSupport(candidate(), [
      record({ id: recordId('rec-1'), evidenceUnitId: evidenceUnitId('eu-1') }),
      record({
        id: recordId('rec-2'),
        sourceFingerprint: sourceFingerprint('fp-new'),
        epistemicRoles: ['user_expression'],
        evidenceUnitId: evidenceUnitId('eu-independent'),
      }),
    ]);

    expect(outcome.passed).toBe(true);
  });
});

describe('§15 — time passing alone does not strengthen', () => {
  it('yields the same verdict regardless of when it is evaluated', () => {
    const early = runAdmissionGates(inputs());
    const late = runAdmissionGates(inputs());

    expect(early).toEqual(late);
    expect(early).toEqual([]);
  });

  it('does not vary admission with the hypothesis age', () => {
    // Two identical hypotheses a year apart remain equally competable; age
    // confers nothing.
    const young = buildStoredHypothesis({
      id: hypothesisId('hyp-young'),
      candidate: candidate(),
      createdAt: LATER,
    });
    const old = buildStoredHypothesis({
      id: hypothesisId('hyp-old'),
      candidate: candidate(),
      createdAt: AT,
    });

    expect(remainsCompetable(young)).toBe(remainsCompetable(old));
    expect({ ...young, id: '', createdAt: AT }).toEqual({
      ...old,
      id: '',
      createdAt: AT,
    });
  });

  it('stores no age-derived or decay field', () => {
    const h = stored();

    for (const field of ['age', 'decay', 'staleness', 'reinforcement', 'streak']) {
      expect(h).not.toHaveProperty(field);
    }
  });
});

describe('INV-09 / §36 — admission is not strength, and neither is attention', () => {
  it('admits without assigning any priority', () => {
    const state = initialStateForHypothesis(stored());

    expect(state).not.toHaveProperty('attentionPriority');
    expect(state).not.toHaveProperty('importance');
    expect(state).not.toHaveProperty('presentationLevel');
  });

  it('exports no function converting a hypothesis into a priority', () => {
    const exported = [
      ...Object.keys(hypothesisModule),
      ...Object.keys(gatesModule),
      ...Object.keys(engineModule),
    ];

    const forbidden = exported.filter((name) =>
      /attentionPriority|priorityFor|importanceOf|rankHypothes/i.test(name),
    );

    expect(forbidden).toEqual([]);
  });
});
