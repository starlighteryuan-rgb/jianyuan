/**
 * Phase 3 tests — deterministic Evidence Support arithmetic.
 *
 * Covers:
 *   ENGINEERING_CONTRACT §9  — weights, 0-3 scale, thresholds, "arithmetic and
 *                              threshold conversion MUST be deterministic code".
 *   ENGINEERING_CONTRACT §10 — dimension anchors.
 *   docs/architecture.md §4 Patch 8  — a level always traces to scores+reasons.
 *   docs/architecture.md §11 Patch 9 — an unusable judgment is left explicitly
 *                              unscored, never imputed or user-edited.
 *   INV-09 / §36 — evidence support is not attention priority.
 */

import { describe, expect, it } from 'vitest';

import {
  DIMENSION_ANCHORS,
  DIMENSION_SCALE,
  DIMENSION_WEIGHTS,
  EVIDENCE_DIMENSIONS,
  EVIDENCE_SUPPORT_LEVELS,
  TOTAL_WEIGHT,
  type DimensionJudgments,
  type DimensionScore,
  type EvidenceDimension,
  isDimensionScore,
  specificityCeiling,
} from '@/domain/relation/evidence-dimensions';
import {
  EVIDENCE_SUPPORT_IS_NOT,
  assessEvidence,
  normalizeToHundred,
  supportLevelFor,
} from '@/domain/relation/evidence-score';
import { isErr, unwrap } from '@/domain/shared/result';

/** Build a complete judgment set from a per-dimension score map. */
const judge = (
  scores: Readonly<Record<EvidenceDimension, DimensionScore>>,
): DimensionJudgments =>
  Object.fromEntries(
    EVIDENCE_DIMENSIONS.map((d) => [
      d,
      { status: 'scored' as const, score: scores[d], reason: `reason ${d}` },
    ]),
  ) as DimensionJudgments;

/** Every dimension at one uniform score. */
const uniform = (score: DimensionScore): DimensionJudgments =>
  judge(
    Object.fromEntries(
      EVIDENCE_DIMENSIONS.map((d) => [d, score]),
    ) as Record<EvidenceDimension, DimensionScore>,
  );

describe('§9 — frozen weights', () => {
  it('sums to exactly 100', () => {
    expect(TOTAL_WEIGHT).toBe(100);
  });

  it('matches the contract weights exactly', () => {
    expect(DIMENSION_WEIGHTS).toEqual({
      structural_strength: 20,
      independent_support: 20,
      temporal_adequacy: 15,
      specificity_baseline_contrast: 20,
      counterevidence_balance: 15,
      evidence_fidelity: 10,
    });
  });

  it('declares exactly the six contract dimensions', () => {
    expect([...EVIDENCE_DIMENSIONS]).toEqual([
      'structural_strength',
      'independent_support',
      'temporal_adequacy',
      'specificity_baseline_contrast',
      'counterevidence_balance',
      'evidence_fidelity',
    ]);
  });

  it('uses integer weights, so the arithmetic cannot drift', () => {
    for (const d of EVIDENCE_DIMENSIONS) {
      expect(Number.isInteger(DIMENSION_WEIGHTS[d])).toBe(true);
    }
  });
});

describe('§9 — the 0-3 scale', () => {
  it('admits exactly 0, 1, 2, 3', () => {
    expect([...DIMENSION_SCALE]).toEqual([0, 1, 2, 3]);
  });

  it.each([0, 1, 2, 3])('accepts %i', (n) => {
    expect(isDimensionScore(n)).toBe(true);
  });

  it.each([-1, 4, 1.5, 100])('rejects %s', (n) => {
    expect(isDimensionScore(n)).toBe(false);
  });

  it('carries anchor text for every dimension at every score', () => {
    for (const d of EVIDENCE_DIMENSIONS) {
      for (const s of DIMENSION_SCALE) {
        expect(DIMENSION_ANCHORS[d][s].length).toBeGreaterThan(0);
      }
    }
  });
});

describe('§9 — deterministic scoring endpoints', () => {
  it('scores all-zero as 0 / weak', () => {
    const a = unwrap(assessEvidence(uniform(0)));
    expect(a.numericScore).toBe(0);
    expect(a.supportLevel).toBe('weak');
  });

  it('scores all-three as exactly 100 / strong', () => {
    // 3 x 100 total weight = 300 raw, normalized to 100. The scale is exact at
    // the top, which is what makes the thresholds meaningful.
    const a = unwrap(assessEvidence(uniform(3)));
    expect(a.numericScore).toBe(100);
    expect(a.supportLevel).toBe('strong');
  });

  it('scores all-two as 67 / observed', () => {
    const a = unwrap(assessEvidence(uniform(2)));
    expect(a.numericScore).toBe(67);
    expect(a.supportLevel).toBe('observed');
  });

  it('scores all-one as 33 / weak', () => {
    const a = unwrap(assessEvidence(uniform(1)));
    expect(a.numericScore).toBe(33);
    expect(a.supportLevel).toBe('weak');
  });

  it('is deterministic across repeated calls', () => {
    const j = uniform(2);
    const first = unwrap(assessEvidence(j)).numericScore;
    const second = unwrap(assessEvidence(j)).numericScore;
    expect(first).toBe(second);
  });

  it('weights dimensions unequally, per the contract', () => {
    // Structural (20%) should move the score more than Fidelity (10%).
    const base = uniform(0);
    const structural = unwrap(
      assessEvidence({
        ...base,
        structural_strength: { status: 'scored', score: 3, reason: 'r' },
      }),
    ).numericScore;
    const fidelity = unwrap(
      assessEvidence({
        ...base,
        evidence_fidelity: { status: 'scored', score: 3, reason: 'r' },
      }),
    ).numericScore;

    expect(structural).toBeGreaterThan(fidelity);
    expect(structural).toBe(20);
    expect(fidelity).toBe(10);
  });
});

describe('§9 — support level thresholds (0-44 / 45-69 / 70-84 / 85-100)', () => {
  it.each([
    [0, 'weak'],
    [44, 'weak'],
    [45, 'observed'],
    [69, 'observed'],
    [70, 'supported'],
    [84, 'supported'],
    [85, 'strong'],
    [100, 'strong'],
  ] as const)('maps %i to %s', (score, level) => {
    expect(supportLevelFor(score)).toBe(level);
  });

  it('declares exactly the four contract levels', () => {
    expect([...EVIDENCE_SUPPORT_LEVELS]).toEqual([
      'weak',
      'observed',
      'supported',
      'strong',
    ]);
  });

  it('crosses into observed at the 45 boundary via real judgments', () => {
    // raw 130 -> 43 (weak); raw 135 -> 45 (observed).
    const belowRaw = judge({
      structural_strength: 3,
      independent_support: 3,
      temporal_adequacy: 0,
      specificity_baseline_contrast: 0,
      counterevidence_balance: 0,
      evidence_fidelity: 1,
    });
    const atRaw = judge({
      structural_strength: 3,
      independent_support: 3,
      temporal_adequacy: 1,
      specificity_baseline_contrast: 0,
      counterevidence_balance: 0,
      evidence_fidelity: 0,
    });

    expect(unwrap(assessEvidence(belowRaw)).numericScore).toBe(43);
    expect(unwrap(assessEvidence(belowRaw)).supportLevel).toBe('weak');
    expect(unwrap(assessEvidence(atRaw)).numericScore).toBe(45);
    expect(unwrap(assessEvidence(atRaw)).supportLevel).toBe('observed');
  });

  it('crosses into supported at the 70 boundary via real judgments', () => {
    const at = judge({
      structural_strength: 3,
      independent_support: 3,
      temporal_adequacy: 3,
      specificity_baseline_contrast: 1,
      counterevidence_balance: 1,
      evidence_fidelity: 1,
    });

    expect(unwrap(assessEvidence(at)).numericScore).toBe(70);
    expect(unwrap(assessEvidence(at)).supportLevel).toBe('supported');
  });

  it('crosses into strong at the 85 boundary via real judgments', () => {
    const below = judge({
      structural_strength: 3,
      independent_support: 3,
      temporal_adequacy: 3,
      specificity_baseline_contrast: 3,
      counterevidence_balance: 1,
      evidence_fidelity: 1,
    });
    const at = judge({
      structural_strength: 3,
      independent_support: 3,
      temporal_adequacy: 3,
      specificity_baseline_contrast: 3,
      counterevidence_balance: 2,
      evidence_fidelity: 0,
    });

    expect(unwrap(assessEvidence(below)).numericScore).toBe(83);
    expect(unwrap(assessEvidence(below)).supportLevel).toBe('supported');
    expect(unwrap(assessEvidence(at)).numericScore).toBe(85);
    expect(unwrap(assessEvidence(at)).supportLevel).toBe('strong');
  });

  it('normalizes 0-300 raw onto 0-100', () => {
    expect(normalizeToHundred(0)).toBe(0);
    expect(normalizeToHundred(300)).toBe(100);
    expect(normalizeToHundred(150)).toBe(50);
  });
});

describe('Patch 9 — an unusable judgment yields no score at all', () => {
  it.each(['unavailable', 'needs_retry'] as const)(
    'refuses to score when a dimension is %s',
    (status) => {
      const result = assessEvidence({
        ...uniform(3),
        temporal_adequacy: { status, reason: 'model declined' },
      });

      // No partial score, no imputed default. Refusal is the contract's
      // prescribed outcome, not an error to smooth over.
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.kind).toBe('incomplete_dimension_judgments');
        expect(result.error.unscored).toHaveLength(1);
        expect(result.error.unscored[0]?.dimension).toBe('temporal_adequacy');
        expect(result.error.unscored[0]?.status).toBe(status);
      }
    },
  );

  it('reports every unscored dimension, with reasons preserved', () => {
    const result = assessEvidence({
      ...uniform(2),
      temporal_adequacy: { status: 'unavailable', reason: 'no temporal data' },
      evidence_fidelity: { status: 'needs_retry', reason: 'malformed output' },
    });

    if (isErr(result)) {
      expect(result.error.unscored).toHaveLength(2);
      expect(result.error.unscored.map((u) => u.reason)).toEqual([
        'no temporal data',
        'malformed output',
      ]);
    }
  });

  it('does not fall back to a lower level when scoring is impossible', () => {
    // Specifically NOT 'weak': an unscored claim is not a weakly supported one.
    const result = assessEvidence({
      ...uniform(3),
      structural_strength: { status: 'unavailable', reason: 'r' },
    });

    expect(isErr(result)).toBe(true);
  });
});

describe('Patch 8 — a level always travels with its justification', () => {
  it('returns judgments alongside the derived level', () => {
    const a = unwrap(assessEvidence(uniform(2)));

    expect(Object.keys(a.judgments).sort()).toEqual([...EVIDENCE_DIMENSIONS].sort());
    for (const d of EVIDENCE_DIMENSIONS) {
      const j = a.judgments[d];
      expect(j.status).toBe('scored');
      expect(j.reason.length).toBeGreaterThan(0);
    }
  });

  it('binds numeric score, level, and judgments into one value', () => {
    const a = unwrap(assessEvidence(uniform(3)));

    expect(a).toHaveProperty('numericScore');
    expect(a).toHaveProperty('supportLevel');
    expect(a).toHaveProperty('judgments');
    expect(a.supportLevel).toBe(supportLevelFor(a.numericScore));
  });
});

describe('§10.4 / INV-15 — the specificity ceiling', () => {
  it('caps at 1 with no baseline of either kind', () => {
    expect(
      specificityCeiling({
        hasReliablePersonalBaseline: false,
        recordSuppliesInternalBaseline: false,
      }),
    ).toBe(1);
  });

  it('lifts the cap when the record supplies an internal baseline', () => {
    // "我平时很少点这家，但那几周连续点了" (§10.4 example).
    expect(
      specificityCeiling({
        hasReliablePersonalBaseline: false,
        recordSuppliesInternalBaseline: true,
      }),
    ).toBe(3);
  });

  it('lifts the cap with a reliable Personal Baseline', () => {
    expect(
      specificityCeiling({
        hasReliablePersonalBaseline: true,
        recordSuppliesInternalBaseline: false,
      }),
    ).toBe(3);
  });
});

describe('§9 / INV-09 / §36 — what this score is not', () => {
  it('names the six things evidence support does not represent', () => {
    expect([...EVIDENCE_SUPPORT_IS_NOT]).toEqual([
      'truth_probability',
      'importance',
      'current_relevance',
      'attention_priority',
      'hypothesis_probability',
      'user_agreement',
    ]);
  });

  it('exposes no function converting a level into priority or truth', () => {
    // INV-09: strong evidence support does not imply high attention priority.
    const a = unwrap(assessEvidence(uniform(3)));

    expect(a).not.toHaveProperty('attentionPriority');
    expect(a).not.toHaveProperty('importance');
    expect(a).not.toHaveProperty('truthProbability');
    expect(a).not.toHaveProperty('presentationLevel');
  });
});
