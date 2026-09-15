/**
 * Deterministic Evidence Support arithmetic (ENGINEERING_CONTRACT §9, §31;
 * docs/architecture.md §4 Patch 8).
 *
 * The division of labor this module exists to enforce:
 *
 *   LLM  → per-dimension 0–3 judgment + reason  (semantic)
 *   CODE → weighting, summation, thresholding    (this file)
 *
 * §9 states it directly: "Arithmetic and threshold conversion MUST be
 * deterministic code." No model output reaches the numeric score except as the
 * six integer judgments.
 *
 * Two fail-closed behaviours:
 *
 *   1. If ANY dimension is unscored (`unavailable` / `needs_retry`), there is
 *      NO numeric score and NO support level. A partial score would require
 *      inventing or imputing a missing dimension, and arch §11 Patch 9
 *      explicitly replaced "fill the gap" with "leave it explicitly unscored".
 *
 *   2. A support level can only be produced together with the scores and
 *      reasons that justify it (Patch 8). The return type binds them into one
 *      value, so "a level without its reasons" is unrepresentable rather than
 *      merely discouraged.
 */

import {
  DIMENSION_WEIGHTS,
  EVIDENCE_DIMENSIONS,
  SUPPORT_LEVEL_FLOORS,
  type DimensionJudgments,
  type EvidenceDimension,
  type EvidenceSupportLevel,
} from './evidence-dimensions';
import { type Result, err, ok } from '../shared/result';

/**
 * A complete, auditable evidence assessment.
 *
 * `numericScore` and `supportLevel` are derived; `judgments` is the evidence
 * for the derivation. They travel together by construction (Patch 8).
 */
export interface EvidenceAssessment {
  readonly judgments: DimensionJudgments;
  /** 0–100, integer. */
  readonly numericScore: number;
  readonly supportLevel: EvidenceSupportLevel;
}

export type EvidenceScoringError = {
  readonly kind: 'incomplete_dimension_judgments';
  /** Dimensions that could not be scored, with the reason recorded. */
  readonly unscored: readonly {
    readonly dimension: EvidenceDimension;
    readonly status: 'unavailable' | 'needs_retry';
    readonly reason: string;
  }[];
};

/**
 * Weighted sum in exact integer space.
 *
 * Each dimension contributes `score (0–3) × weight (integer %)`, so the raw
 * total lands in 0–300 with no floating point involved.
 */
const rawWeightedTotal = (judgments: DimensionJudgments): number =>
  EVIDENCE_DIMENSIONS.reduce((total, dimension) => {
    const judgment = judgments[dimension];
    return judgment.status === 'scored'
      ? total + judgment.score * DIMENSION_WEIGHTS[dimension]
      : total;
  }, 0);

/**
 * Normalize the 0–300 raw total onto the contract's 0–100 scale.
 *
 * Rounding is half-up via `Math.round` on a non-negative value, fixed here so
 * the same judgments always yield the same integer. The scale is exact at the
 * extremes: all-zero → 0, all-three → 300/3 = 100.
 */
export const normalizeToHundred = (raw: number): number => Math.round(raw / 3);

/** §9 thresholds. Scans inclusive lower bounds, highest first. */
export const supportLevelFor = (numericScore: number): EvidenceSupportLevel => {
  for (const floor of SUPPORT_LEVEL_FLOORS) {
    if (numericScore >= floor.min) return floor.level;
  }
  // Unreachable: the lowest floor is 0 and scores are non-negative. Present so
  // the function is total rather than relying on a non-null assertion.
  return 'weak';
};

/**
 * Compute the assessment, or refuse.
 *
 * Refusal is not an error state to be smoothed over — it is the contract's
 * prescribed outcome when a dimension judgment is unusable (arch §11).
 */
export const assessEvidence = (
  judgments: DimensionJudgments,
): Result<EvidenceAssessment, EvidenceScoringError> => {
  const unscored = EVIDENCE_DIMENSIONS.flatMap((dimension) => {
    const judgment = judgments[dimension];
    return judgment.status === 'scored'
      ? []
      : [{ dimension, status: judgment.status, reason: judgment.reason }];
  });

  if (unscored.length > 0) {
    return err({ kind: 'incomplete_dimension_judgments', unscored });
  }

  const numericScore = normalizeToHundred(rawWeightedTotal(judgments));

  return ok({
    judgments,
    numericScore,
    supportLevel: supportLevelFor(numericScore),
  });
};

/**
 * §9 / INV-09 / §36 guard rails.
 *
 * Named negations, kept as documentation-in-code. There is intentionally no
 * function in this module that maps a support level onto importance, current
 * relevance, attention priority, hypothesis probability, or truth. Anything
 * needing those must compute them from their own inputs, and Attention
 * Priority structurally excludes `evidence_support_level` altogether
 * (docs/architecture.md §13).
 */
export const EVIDENCE_SUPPORT_IS_NOT = [
  'truth_probability',
  'importance',
  'current_relevance',
  'attention_priority',
  'hypothesis_probability',
  'user_agreement',
] as const;
