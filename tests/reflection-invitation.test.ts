/**
 * Phase 6 tests — the reflection invitation (§21, §13, §33).
 *
 * §21 permits presenting:  evidence → relation → 2–3 competing hypotheses
 * §21 requires always permitting:
 *       "none of these" · "I have my own explanation" · "I don't know yet"
 * §21 forbids:  leading the user toward a conclusion.
 *
 * The exits are the part most easily weakened by a UI convenience, so they are
 * asserted structurally: there must be no code path producing an invitation
 * without all three.
 */

import { describe, expect, it } from 'vitest';

import {
  EXIT_KINDS,
  LEADS_TO_CONCLUSION,
  MAX_PRESENTED_HYPOTHESES,
  buildInvitation,
  deriveStimulusType,
  preservesUserAuthority,
  standardExits,
} from '@/domain/reflection/reflection-invitation';
import * as invitationModule from '@/domain/reflection/reflection-invitation';
import type { StoredHypothesis } from '@/domain/hypothesis/hypothesis';
import type { StoredRelationClaim } from '@/domain/relation/relation-claim';
import { STIMULUS_TYPES } from '@/domain/shared/enums';
import {
  hypothesisId,
  recordId,
  relationClaimId,
} from '@/domain/shared/ids';

const AT = new Date('2026-09-01T00:00:00Z');

const claim = (over: Partial<StoredRelationClaim> = {}): StoredRelationClaim => ({
  id: relationClaimId('claim-1'),
  recordRefs: [recordId('rec-1'), recordId('rec-2')],
  comparisonAxis: {
    question: '任务距离截止时间多远时开始实际执行',
    dimension: 'hours before deadline at which execution began',
  },
  relationType: 'co_occurrence',
  evidenceSummary: '两次都在接近截止时才开始。',
  assertsTemporalOrdering: false,
  assessment: null,
  supportLevel: 'supported',
  createdAt: AT,
  ...over,
});

const hypothesis = (
  over: Partial<StoredHypothesis> = {},
): StoredHypothesis => ({
  id: hypothesisId('hyp-1'),
  explanation: '开始也许被推迟到外部压力提供结构时。',
  anchorRefs: [relationClaimId('claim-1')],
  anchorPath: 'supported_relation',
  supportBasis: 'directional_observation',
  supportingRecordRefs: [recordId('rec-1'), recordId('rec-2')],
  mechanism: '临近截止提供了原本缺失的结构。',
  discriminatingPredictions: ['结构明确的任务应更早开始。'],
  alternatives: ['是任务模糊而非压力决定了延迟。'],
  wouldStrengthen: ['在结构明确的任务上更早开始。'],
  wouldWeaken: ['在结构明确的任务上同样延迟。'],
  createdAt: AT,
  ...over,
});

const build = (
  over: {
    readonly relation?: StoredRelationClaim | null;
    readonly hypotheses?: readonly StoredHypothesis[];
    readonly visibility?: 'hidden' | 'on_request' | 'shown';
    readonly density?: 'brief' | 'full';
  } = {},
) =>
  buildInvitation({
    targetRef: 'claim-1',
    relation: over.relation === undefined ? claim() : over.relation,
    hypotheses: over.hypotheses ?? [hypothesis()],
    visibility: over.visibility ?? 'shown',
    density: over.density ?? 'brief',
  });

describe('§21 — the three exits are unconditional', () => {
  it('names exactly the three contract exits', () => {
    expect([...EXIT_KINDS]).toEqual([
      'none_of_these',
      'own_explanation',
      'dont_know',
    ]);
  });

  it('includes all three in every invitation', () => {
    expect(build().exits.map((e) => e.kind)).toEqual([...EXIT_KINDS]);
  });

  it('includes them even with no relation and no hypotheses', () => {
    const invitation = build({ relation: null, hypotheses: [] });

    expect(preservesUserAuthority(invitation)).toBe(true);
  });

  it('includes them when hypotheses are hidden by preference', () => {
    expect(preservesUserAuthority(build({ visibility: 'hidden' }))).toBe(true);
  });

  it('returns a fresh array so a caller cannot remove one', () => {
    const first = standardExits();
    const second = standardExits();

    expect(first).not.toBe(second);
    expect(first.map((e) => e.kind)).toEqual(second.map((e) => e.kind));
  });

  it('invites text only for "I have my own explanation"', () => {
    // The other two are complete as choices; prompting for justification would
    // press the user to explain a refusal (§20, §21).
    const invites = standardExits().filter((e) => e.invitesText);

    expect(invites.map((e) => e.kind)).toEqual(['own_explanation']);
  });

  it('keeps every exit labelled', () => {
    for (const exit of standardExits()) {
      expect(exit.label.length).toBeGreaterThan(0);
    }
  });
});

describe('§21, §13 — hypotheses are unordered peers', () => {
  it('caps at three', () => {
    expect(MAX_PRESENTED_HYPOTHESES).toBe(3);

    const many = Array.from({ length: 6 }, (_, i) =>
      hypothesis({ id: hypothesisId(`hyp-${i}`), explanation: `解释 ${i}` }),
    );

    expect(build({ hypotheses: many }).hypotheses).toHaveLength(3);
  });

  it('keeps generation order rather than ranking', () => {
    const many = [
      hypothesis({ id: hypothesisId('a'), explanation: '第一' }),
      hypothesis({ id: hypothesisId('b'), explanation: '第二' }),
      hypothesis({ id: hypothesisId('c'), explanation: '第三' }),
      hypothesis({ id: hypothesisId('d'), explanation: '第四' }),
    ];

    expect(
      build({ hypotheses: many }).hypotheses.map((h) => h.explanation),
    ).toEqual(['第一', '第二', '第三']);
  });

  it('marks none as likeliest', () => {
    const presented = build().hypotheses[0];

    for (const field of ['rank', 'likelihood', 'confidence', 'preferred']) {
      expect(presented).not.toHaveProperty(field);
    }
  });

  it('shows what would weaken each explanation', () => {
    // Showing the falsifier is what keeps it a hypothesis, not a verdict.
    const presented = build().hypotheses[0];

    expect(presented?.wouldWeaken.length).toBeGreaterThan(0);
    expect(presented?.alternatives.length).toBeGreaterThan(0);
  });

  it('accepts zero hypotheses', () => {
    expect(build({ hypotheses: [] }).hypotheses).toEqual([]);
  });
});

describe('§21 — no conclusion may be smuggled in', () => {
  it('declares it leads to no conclusion', () => {
    expect(LEADS_TO_CONCLUSION).toBe(false);
  });

  it('carries no recommendation field', () => {
    const invitation = build();

    for (const field of [
      'suggested',
      'mostLikely',
      'recommended',
      'conclusion',
      'answer',
      'verdict',
    ]) {
      expect(invitation).not.toHaveProperty(field);
    }
  });

  it('exposes exactly the intended fields', () => {
    expect(Object.keys(build()).sort()).toEqual(
      [
        'density',
        'exits',
        'hypotheses',
        'relation',
        'responses',
        'stimulusType',
        'targetRef',
      ].sort(),
    );
  });

  it('exports no function producing a recommendation', () => {
    const forbidden = Object.keys(invitationModule).filter((n) =>
      /recommend|suggest|rank|bestExplanation|conclude/i.test(n),
    );

    expect(forbidden).toEqual([]);
  });

  it('offers all four responses', () => {
    expect(build().responses).toEqual([
      'accepted',
      'questioned',
      'rejected',
      'uncertain',
    ]);
  });
});

describe('relation presentation', () => {
  it('shows the axis question and support level', () => {
    // §42 — the user should see how well-supported something is.
    const relation = build().relation;

    expect(relation?.axisQuestion).toContain('截止时间');
    expect(relation?.supportLevel).toBe('supported');
  });

  it('withholds the numeric score and dimension breakdown', () => {
    // A number invites comparison; the categorical level states what is known
    // without implying arithmetic precision.
    const relation = build().relation;

    for (const field of [
      'numericScore',
      'assessment',
      'judgments',
      'dimensionScores',
    ]) {
      expect(relation).not.toHaveProperty(field);
    }
  });

  it('accepts a null relation', () => {
    expect(build({ relation: null }).relation).toBeNull();
  });

  it('shows an unscored claim honestly rather than hiding it', () => {
    const relation = build({
      relation: claim({ supportLevel: null }),
    }).relation;

    expect(relation?.supportLevel).toBeNull();
  });
});

describe('§33 — preferences affect rendering only', () => {
  it('shows hypotheses when visibility is `shown`', () => {
    expect(build({ visibility: 'shown' }).hypotheses).toHaveLength(1);
  });

  it('withholds them when `hidden`', () => {
    expect(build({ visibility: 'hidden' }).hypotheses).toEqual([]);
  });

  it('withholds them when `on_request`, pending a second step', () => {
    expect(build({ visibility: 'on_request' }).hypotheses).toEqual([]);
  });

  it('passes density through untouched', () => {
    expect(build({ density: 'full' }).density).toBe('full');
    expect(build({ density: 'brief' }).density).toBe('brief');
  });

  it('does not change the relation when hypotheses are hidden', () => {
    // A preference changes what is rendered, never what is true.
    expect(build({ visibility: 'hidden' }).relation).toEqual(
      build({ visibility: 'shown' }).relation,
    );
  });
});

describe('§22 — stimulus type is derived from what is shown', () => {
  it('is hypothesis when explanations are present', () => {
    expect(deriveStimulusType(true, true)).toBe('hypothesis');
    expect(build().stimulusType).toBe('hypothesis');
  });

  it('is evidence_relation when only a relation is shown', () => {
    expect(deriveStimulusType(true, false)).toBe('evidence_relation');
    expect(build({ visibility: 'hidden' }).stimulusType).toBe(
      'evidence_relation',
    );
  });

  it('is open_question when neither is shown', () => {
    expect(deriveStimulusType(false, false)).toBe('open_question');
    expect(build({ relation: null, hypotheses: [] }).stimulusType).toBe(
      'open_question',
    );
  });

  it('cannot disagree with the content presented', () => {
    // Derived rather than passed in, so provenance and content stay consistent.
    const hidden = build({ visibility: 'hidden' });

    expect(hidden.hypotheses).toEqual([]);
    expect(hidden.stimulusType).not.toBe('hypothesis');
  });

  it('never yields external_reference in MVP', () => {
    // The value remains in the frozen enum, but no external content reaches
    // this module and no plugin ships.
    const cases = [
      build(),
      build({ relation: null }),
      build({ hypotheses: [] }),
      build({ visibility: 'hidden' }),
      build({ relation: null, hypotheses: [] }),
    ];

    for (const invitation of cases) {
      expect(invitation.stimulusType).not.toBe('external_reference');
    }

    expect([...STIMULUS_TYPES]).toContain('external_reference');
  });
});

describe('purity', () => {
  it('is deterministic', () => {
    expect(build()).toEqual(build());
  });

  it('does not mutate the hypothesis list', () => {
    const many = [hypothesis({ id: hypothesisId('a') }), hypothesis({ id: hypothesisId('b') })];
    const order = many.map((h) => h.id);

    build({ hypotheses: many });
    expect(many.map((h) => h.id)).toEqual(order);
  });
});
