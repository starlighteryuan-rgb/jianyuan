/**
 * SemanticJudgmentPort — the single boundary across which model judgment enters
 * the system (ENGINEERING_CONTRACT §31; docs/architecture.md §1, §7).
 *
 * The division this interface exists to make structural:
 *
 *   LLM  → semantic judgment  (what structure is here? how strong on 0–3? why?)
 *   CODE → legality and arithmetic  (may this be used? does it total 72?)
 *
 * Design rules followed throughout:
 *
 *   1. Every method returns STRUCTURED fields, never prose for code to parse.
 *      docs/architecture.md §7 (Patch 10) dropped keyword matching as an
 *      enforcement mechanism precisely because it made deterministic code
 *      perform semantic interpretation.
 *
 *   2. `explanation` fields exist for AUDIT ONLY. No caller may branch on their
 *      contents. Where a decision is needed, the model supplies a dedicated
 *      enum or boolean field alongside.
 *
 *   3. The port cannot grant permission. It has no access to directives,
 *      evidence-unit identity, or lineage, so it is structurally incapable of
 *      deciding Gate 1, Gate 2, or Gate 5 — those are code's to enforce.
 *
 * Phase 3 declares the relation-stage methods. Hypothesis-stage judgment
 * (H2 positive directional support) is added in Phase 4 behind this same
 * interface.
 */

import type {
  DimensionScore,
  EvidenceDimension,
} from '../relation/evidence-dimensions';
import type {
  ComparisonAxis,
  RelationClaimCandidate,
} from '../relation/relation-claim';
import type { HypothesisCandidate } from '../hypothesis/hypothesis';
import type { EpistemicRole } from '../shared/enums';
import type { RecordId } from '../shared/ids';

/**
 * The read-only view of a Record handed to the model.
 *
 * Deliberately excludes `evidenceUnitId` and `sourceFingerprint`: independence
 * identity is code's concern (INV-16), and exposing it would invite the model
 * to reason about double counting instead of describing what it sees.
 */
export interface RecordView {
  readonly recordId: RecordId;
  readonly epistemicRoles: readonly EpistemicRole[];
  /** Preserved user wording, modal language intact (§4.2). */
  readonly verbatim: string | null;
  /** Human-readable time description, tagged with its semantic (§5). */
  readonly timeDescription: string;
  readonly timeSemantic: string;
}

/* ── Candidate generation (§34: semantically open) ─────────────────────── */

export interface CandidateGenerationRequest {
  readonly records: readonly RecordView[];
}

export interface CandidateGenerationResult {
  /**
   * 0..N candidates (§7). Returning none is a legitimate answer, distinct from
   * "No Sufficient Relation", which is an evaluation outcome reached later
   * (§7.2).
   */
  readonly candidates: readonly RelationClaimCandidate[];
}

/* ── Operational comparability (Gate 3) ───────────────────────────────── */

/**
 * The model's judgment of whether an axis is operationally specific.
 *
 * `sameNature` and `operationallySpecific` are separate booleans because Gate 3
 * asks two distinct questions: do the records support a same-nature comparison,
 * and is the axis specific enough to answer "具体比较什么?".
 *
 * `onlySharedCategory` captures the named failure mode: if the only answer is
 * "它们都属于 X", comparability normally fails.
 */
export interface ComparabilityJudgment {
  readonly operationallySpecific: boolean;
  readonly sameNature: boolean;
  /** True when the axis reduces to "they both belong to category X". */
  readonly onlySharedCategory: boolean;
  /** Audit only. Never parsed. */
  readonly explanation: string;
}

/* ── Abstraction ceiling (Gate 6, §8; Patch 10) ───────────────────────── */

export const PROHIBITED_ABSTRACTION_CATEGORIES = [
  'personality',
  'identity',
  'permanent_trait',
  'hidden_motive',
  'certain_causal_explanation',
] as const;

export type ProhibitedAbstractionCategory =
  (typeof PROHIBITED_ABSTRACTION_CATEGORIES)[number];

/**
 * Structured Gate 6 result.
 *
 * `prohibitedClaimDetected = true` hard-fails regardless of any other field
 * (docs/architecture.md §7). Code reads the boolean and the category; it never
 * scans `explanation` for forbidden words.
 */
export interface AbstractionCeilingJudgment {
  readonly prohibitedClaimDetected: boolean;
  readonly category: ProhibitedAbstractionCategory | null;
  /** Audit only. Never parsed. */
  readonly explanation: string;
}

/* ── Evidence dimension judgment (§9, §10) ────────────────────────────── */

/**
 * One dimension's judgment as returned by the model.
 *
 * The model may decline by returning `unavailable`, which the domain honours by
 * leaving the dimension explicitly unscored rather than imputing a number
 * (docs/architecture.md §11 Patch 9).
 */
export type DimensionJudgmentResult =
  | {
      readonly dimension: EvidenceDimension;
      readonly status: 'scored';
      /** 0–3 semantic scale (§9). Weighting and totalling are code's. */
      readonly score: DimensionScore;
      /** Required. An unexplained score is inadmissible (Patch 8). */
      readonly reason: string;
    }
  | {
      readonly dimension: EvidenceDimension;
      readonly status: 'unavailable';
      readonly reason: string;
    };

export interface EvidenceJudgmentRequest {
  readonly records: readonly RecordView[];
  readonly comparisonAxis: ComparisonAxis;
  readonly relationType: string;
  /**
   * Baseline context for Specificity (§10.4). Supplied by CODE, not inferred by
   * the model, because a baseline MUST NOT be invented (INV-15). The domain
   * additionally clamps the resulting score to the §10.4 ceiling.
   */
  readonly baselineContext: {
    readonly hasReliablePersonalBaseline: boolean;
    readonly recordSuppliesInternalBaseline: boolean;
  };
}

export interface EvidenceJudgmentResult {
  /** One entry per dimension. Completeness is validated by code. */
  readonly judgments: readonly DimensionJudgmentResult[];
}

/* ── The port ─────────────────────────────────────────────────────────── */

/* ── Hypothesis generation (§13, §14) ─────────────────────────────────── */

/**
 * A Relation Claim offered to the model as possible anchor material.
 *
 * Carries `supportLevel` because H1's path A depends on it, but carries NO
 * numeric score: the model has no reason to see the arithmetic, and exposing it
 * would invite reasoning about strength where the contract wants a categorical
 * judgment.
 */
export interface HypothesisAnchorView {
  readonly claimId: string;
  readonly relationType: string;
  readonly axisQuestion: string;
  readonly evidenceSummary: string;
  readonly supportLevel: string | null;
}

export interface HypothesisGenerationRequest {
  readonly claims: readonly HypothesisAnchorView[];
}

export interface HypothesisGenerationResult {
  /**
   * 0..N candidate explanations. §13 asks for 少量 competing explanations, and
   * the domain caps the admitted count; the model is not asked to rank them,
   * because ranking would imply a confidence the contract forbids.
   */
  readonly candidates: readonly HypothesisCandidate[];
}

export interface SemanticJudgmentPort {
  /** §34 Candidate Generation — open by design. */
  generateCandidates(
    request: CandidateGenerationRequest,
  ): Promise<CandidateGenerationResult>;

  /** Gate 3 input. Code decides pass/fail from the structured fields. */
  judgeComparability(request: {
    readonly records: readonly RecordView[];
    readonly comparisonAxis: ComparisonAxis;
    readonly relationType: string;
  }): Promise<ComparabilityJudgment>;

  /** Gate 6 input. `prohibitedClaimDetected` is decisive. */
  judgeAbstractionCeiling(request: {
    readonly relationType: string;
    readonly comparisonAxis: ComparisonAxis;
    readonly evidenceSummary: string;
  }): Promise<AbstractionCeilingJudgment>;

  /** §9/§10 per-dimension judgments. Arithmetic stays in code. */
  judgeEvidenceDimensions(
    request: EvidenceJudgmentRequest,
  ): Promise<EvidenceJudgmentResult>;

  /* ── Hypothesis stage (§13, §14) ────────────────────────────────────── */

  /**
   * §13 — propose a small number of competing explanations.
   *
   * The candidate carries the model's own `supportBasis` classification, which
   * deterministic code then compares against the single admissible value. The
   * model is NOT asked to rank or score its candidates: ranking would imply a
   * confidence the contract does not permit a Hypothesis to carry.
   */
  generateHypotheses(
    request: HypothesisGenerationRequest,
  ): Promise<HypothesisGenerationResult>;

  /**
   * §14 H6 — abstraction ceiling for an explanation.
   *
   * Returns the same structured shape as the Relation-stage Gate 6 judgment,
   * because §14 H6's prohibition list is near-identical to §8 Gate 6's and a
   * second parallel mechanism would be a divergence risk rather than extra
   * safety. `prohibitedClaimDetected` is decisive.
   */
  judgeHypothesisAbstractionCeiling(request: {
    readonly explanation: string;
    readonly mechanism: string;
  }): Promise<AbstractionCeilingJudgment>;
}
