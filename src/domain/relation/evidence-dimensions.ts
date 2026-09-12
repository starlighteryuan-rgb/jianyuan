/**
 * Evidence Support Score — dimensions, weights, anchors, levels.
 *
 * Transcribed from ENGINEERING_CONTRACT §9 and §10. These numbers are FROZEN
 * product logic, not tuning parameters.
 *
 * What this score means (§9):
 *
 *   > support for the descriptive Relation Claim only.
 *
 * What it explicitly does NOT mean (§9, INV-09, §36):
 *   truth probability, importance, current relevance, attention priority,
 *   hypothesis probability, or user agreement.
 *
 * There is deliberately no function anywhere in this module that converts a
 * support level into a priority, a ranking, or a confidence. Attention is a
 * separate computation with `evidence_support_level` structurally excluded as
 * an input (docs/architecture.md §13).
 */

/* ── The six dimensions (§9) ──────────────────────────────────────────── */

export const EVIDENCE_DIMENSIONS = [
  'structural_strength',
  'independent_support',
  'temporal_adequacy',
  'specificity_baseline_contrast',
  'counterevidence_balance',
  'evidence_fidelity',
] as const;

export type EvidenceDimension = (typeof EVIDENCE_DIMENSIONS)[number];

/**
 * Weights from §9, as integer percentages. They sum to exactly 100.
 *
 * Integers rather than floats so the arithmetic in evidence-score.ts can stay
 * in exact integer space and never drift.
 */
export const DIMENSION_WEIGHTS = {
  structural_strength: 20,
  independent_support: 20,
  temporal_adequacy: 15,
  specificity_baseline_contrast: 20,
  counterevidence_balance: 15,
  evidence_fidelity: 10,
} as const satisfies Record<EvidenceDimension, number>;

/** Compile-time-adjacent guarantee that the frozen weights still total 100. */
export const TOTAL_WEIGHT: number = EVIDENCE_DIMENSIONS.reduce(
  (sum, d) => sum + DIMENSION_WEIGHTS[d],
  0,
);

/* ── Per-dimension 0–3 scale (§9, §10) ────────────────────────────────── */

/** Each dimension is judged on a 0–3 semantic scale BY THE MODEL (§9). */
export const DIMENSION_SCALE = [0, 1, 2, 3] as const;
export type DimensionScore = (typeof DIMENSION_SCALE)[number];

export const isDimensionScore = (n: number): n is DimensionScore =>
  n === 0 || n === 1 || n === 2 || n === 3;

/**
 * Why a dimension might carry no usable score (docs/architecture.md §11,
 * Patch 9).
 *
 * The replacement for the rejected "let the user override a score" fallback.
 * An unusable judgment is retried or left explicitly unscored — NEVER
 * user-edited, and never quietly defaulted to a number.
 */
export const SCORE_STATUSES = ['scored', 'unavailable', 'needs_retry'] as const;
export type ScoreStatus = (typeof SCORE_STATUSES)[number];

/**
 * One dimension's judgment.
 *
 * Patch 8 requires every stored score to trace to a stored reason, so the
 * scored variant carries both. The unscored variants carry no number at all —
 * making "a level without its reasons" unrepresentable rather than merely
 * discouraged.
 */
export type DimensionJudgment =
  | {
      readonly status: 'scored';
      readonly score: DimensionScore;
      /** From the model. Required: an unexplained score is inadmissible. */
      readonly reason: string;
    }
  | {
      readonly status: 'unavailable' | 'needs_retry';
      readonly reason: string;
    };

export type DimensionJudgments = Readonly<
  Record<EvidenceDimension, DimensionJudgment>
>;

/* ── Support levels (§9) ──────────────────────────────────────────────── */

export const EVIDENCE_SUPPORT_LEVELS = [
  'weak',
  'observed',
  'supported',
  'strong',
] as const;

export type EvidenceSupportLevel = (typeof EVIDENCE_SUPPORT_LEVELS)[number];

/**
 * Thresholds from §9:
 *   0–44 weak | 45–69 observed | 70–84 supported | 85–100 strong
 *
 * Stored as inclusive lower bounds, highest first, so lookup is a simple scan
 * with no gap or overlap possible.
 */
export const SUPPORT_LEVEL_FLOORS = [
  { level: 'strong', min: 85 },
  { level: 'supported', min: 70 },
  { level: 'observed', min: 45 },
  { level: 'weak', min: 0 },
] as const satisfies readonly {
  readonly level: EvidenceSupportLevel;
  readonly min: number;
}[];

/* ── Dimension anchors (§10) ──────────────────────────────────────────── */

/**
 * The 0–3 anchor text per dimension, verbatim in substance from §10.
 *
 * Carried in code because these anchors are what the model must be shown when
 * it judges a dimension. Paraphrasing them in a prompt would quietly redefine
 * the scale, which §42 forbids.
 */
export const DIMENSION_ANCHORS: Readonly<
  Record<EvidenceDimension, Readonly<Record<DimensionScore, string>>>
> = {
  // §10.1
  structural_strength: {
    0: 'no defensible structure beyond coincidence or vague similarity',
    1: 'weak structure; interpretation depends heavily on framing',
    2: 'clear structural correspondence supported by the records',
    3: 'strong and repeated/explicit structural correspondence with little ambiguity',
  },
  // §10.2 — relative to the MINIMUM required by the proposed Relation Type.
  // A Change relation needing two endpoints must not be punished merely for
  // having two records; repeated sampling of one state must not inflate
  // Persistence.
  independent_support: {
    0: 'insufficient independent support, or support is lineage-duplicated',
    1: 'exactly the minimum independent evidence required',
    2: 'more than the minimum, or independent cross-validation exists',
    3: 'multiple genuinely independent repetitions/corroborations beyond the minimum',
  },
  // §10.3 — scored ONLY after Temporal Legibility (Gate 4) passes.
  temporal_adequacy: {
    0: 'legal temporal interpretation, but evidence is too temporally weak for the claim',
    1: 'minimum usable temporal support',
    2: 'good temporal coverage/order for the claimed relation',
    3: 'strong temporal coverage, spacing, ordering, or repeated temporal support',
  },
  // §10.4 — without a reliable baseline this normally cannot exceed 1, unless
  // the record itself supplies an internal baseline. A baseline MUST NOT be
  // invented (INV-15).
  specificity_baseline_contrast: {
    0: 'generic/common baseline sufficiently explains the observation',
    1: 'some specificity, but no reliable Personal Baseline',
    2: 'the record itself contains a clear internal baseline or condition contrast',
    3: 'reliable Personal Behavioral Baseline or strong cross-context contrast',
  },
  // §10.5 — only FACTUAL counterevidence counts. User attitude is not
  // counterevidence (INV-04).
  counterevidence_balance: {
    0: 'strong factual counterevidence substantially undermines the claim',
    1: 'meaningful factual counterevidence exists',
    2: 'little factual counterevidence, or evidence is mixed but claim remains supported',
    3: 'relevant factual evidence is strongly consistent and no meaningful factual counterevidence is present',
  },
  // §10.6
  evidence_fidelity: {
    0: 'evidence only loosely or indirectly touches the axis',
    1: 'partial support requiring substantial interpretation',
    2: 'records directly support most of the axis',
    3: 'records directly and explicitly support the axis with minimal interpretive leap',
  },
};

/**
 * §10.4 ceiling helper.
 *
 * Exposed so the ceiling is applied by deterministic code rather than trusted
 * to the model's discretion. Without a reliable Personal Baseline AND without
 * an internal baseline in the record, Specificity cannot exceed 1.
 */
export const specificityCeiling = (context: {
  readonly hasReliablePersonalBaseline: boolean;
  readonly recordSuppliesInternalBaseline: boolean;
}): DimensionScore =>
  context.hasReliablePersonalBaseline || context.recordSuppliesInternalBaseline
    ? 3
    : 1;
