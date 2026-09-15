/**
 * RelationClaim (ENGINEERING_CONTRACT §7, §7.1, §7.2; docs/architecture.md §4
 * Patch 8).
 *
 * Relation answers:  what evidence-supported STRUCTURE exists between records?
 * Hypothesis answers: WHY might that structure exist?
 *
 * §13 requires these stay separate, so nothing in this module explains,
 * attributes cause, or names a mechanism.
 *
 * Three structural commitments:
 *
 *   1. `relationType` is a STRING, not an enum. §7.1 declares the taxonomy
 *      non-exhaustive: novel claims may be accepted if they pass the gates. An
 *      enum would silently close it, and the contract also forbids inventing a
 *      hidden cause merely because no existing label fits.
 *
 *   2. "No Sufficient Relation" is NEVER a `relationType` value. §7.2 makes it
 *      an evaluation OUTCOME — modelled in relation-engine.ts as a pipeline
 *      result, and it is not a permanent classification.
 *
 *   3. Evidence and its justification are bound together. A stored claim
 *      either carries a full `EvidenceAssessment` (level + numeric + all six
 *      judgments with reasons) or carries none at all (Patch 8).
 */

import type { EvidenceAssessment } from './evidence-score';
import type {
  EvidenceSupportLevel,
  DimensionJudgments,
} from './evidence-dimensions';
import type { RecordId, RelationClaimId } from '../shared/ids';

/**
 * The Comparison Axis (§7, Gate 3).
 *
 * Answers "具体比较什么?" — what exactly is being compared. Gate 3 rejects
 * shared words, themes, or abstract categories, so this is a required
 * structured value rather than a free label.
 */
export interface ComparisonAxis {
  /**
   * The operational question the axis poses, e.g.
   * "任务距离截止时间多远时开始实际执行".
   * Not "都和压力有关" — that is the failure mode Gate 3 exists to catch.
   */
  readonly question: string;
  /** What is measured or observed to answer it. */
  readonly dimension: string;
}

/**
 * A candidate claim, before gates and scoring.
 *
 * Carries no evidence assessment: candidate generation is semantically OPEN
 * (§34 "底层追求开放性"), and admissibility is decided afterwards.
 */
export interface RelationClaimCandidate {
  /** The records the claim is about. Order carries no meaning. */
  readonly recordRefs: readonly RecordId[];
  readonly comparisonAxis: ComparisonAxis;
  /** Open taxonomy (§7.1). */
  readonly relationType: string;
  /** The model's account of the structure it observed. Descriptive only. */
  readonly evidenceSummary: string;

  /**
   * Does this claim assert an ORDERING or TRANSITION across records in time?
   *
   * A structural declaration by the generator, which deterministic code then
   * checks for legality in Gate 4 (§8). It exists so Gate 4 can ask "is this
   * temporal interpretation legally supported by the records' time semantics?"
   * without code having to infer intent from prose.
   *
   * Claims like "not-following → following" set this true, and are then held to
   * §5.1: snapshots may support a transition within an interval, but never an
   * exact transition time (INV-07).
   */
  readonly assertsTemporalOrdering: boolean;
}

/**
 * A persisted claim.
 *
 * `assessment` is null for a claim recorded before scoring completed, or where
 * a dimension was unusable (arch §11). It is never a partial score.
 */
export interface StoredRelationClaim {
  readonly id: RelationClaimId;
  readonly recordRefs: readonly RecordId[];
  readonly comparisonAxis: ComparisonAxis;
  readonly relationType: string;
  readonly evidenceSummary: string;

  /**
   * Whether the claim asserts ordering/transition in time. Persisted because
   * Gate 4 legality depends on it, and a re-evaluation must be able to re-check
   * the same assertion rather than re-infer it (§8, §5.1, INV-07).
   */
  readonly assertsTemporalOrdering: boolean;

  /** Full assessment, or none. Never partial (Patch 8). */
  readonly assessment: EvidenceAssessment | null;

  /**
   * Convenience projection of `assessment.supportLevel`, kept in lockstep by
   * `buildStoredClaim` below and used for level queries. Null whenever
   * `assessment` is null.
   */
  readonly supportLevel: EvidenceSupportLevel | null;

  readonly createdAt: Date;
}

/**
 * Construct a stored claim, keeping `supportLevel` and `assessment` consistent.
 *
 * The only sanctioned way to build one, so the projected level can never drift
 * from the assessment that justifies it.
 */
export const buildStoredClaim = (input: {
  readonly id: RelationClaimId;
  readonly candidate: RelationClaimCandidate;
  readonly assessment: EvidenceAssessment | null;
  readonly createdAt: Date;
}): StoredRelationClaim => ({
  id: input.id,
  recordRefs: input.candidate.recordRefs,
  comparisonAxis: input.candidate.comparisonAxis,
  relationType: input.candidate.relationType,
  evidenceSummary: input.candidate.evidenceSummary,
  assertsTemporalOrdering: input.candidate.assertsTemporalOrdering,
  assessment: input.assessment,
  supportLevel: input.assessment?.supportLevel ?? null,
  createdAt: input.createdAt,
});

/**
 * Patch 8 invariant, executable.
 *
 * A claim may not present a support level without the dimension scores AND
 * reasons behind it. Used by tests and by the persistence adapter as a
 * last-line check before a write.
 */
export const hasAuditableEvidence = (claim: StoredRelationClaim): boolean => {
  if (claim.assessment === null) return claim.supportLevel === null;

  const judgments: DimensionJudgments = claim.assessment.judgments;

  return (
    claim.supportLevel === claim.assessment.supportLevel &&
    Object.values(judgments).every(
      (j) => j.status === 'scored' && j.reason.trim().length > 0,
    )
  );
};

/**
 * §7 — a Relation is DESCRIPTIVE.
 *
 * Deliberately absent from this module: any field or function expressing cause,
 * mechanism, motive, personality, or certainty. Gate 6 (Abstraction Ceiling)
 * forbids a descriptive claim escalating into those, and Hypothesis is where
 * explanation belongs (§13).
 */
export const RELATION_IS_DESCRIPTIVE_NOT_EXPLANATORY = true as const;
