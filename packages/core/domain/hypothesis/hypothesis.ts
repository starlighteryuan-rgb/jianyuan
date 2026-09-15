/**
 * Hypothesis (ENGINEERING_CONTRACT §13, §14, §15).
 *
 * Relation answers "what structure exists?"; Hypothesis answers "why might this
 * structure exist?". §13 requires the two stay separate, and this module is the
 * explanatory side of that split.
 *
 * §13 is explicit about what the layer is NOT for:
 *
 *   > Hypothesis Layer is NOT intended to find the true hidden cause.
 *   > 提出少量有证据锚定、彼此可竞争、可由未来证据区分的可能解释。
 *   > Formal storage of a Hypothesis does NOT make it true.
 *
 * Three structural consequences, each visible in the types below:
 *
 *   1. THERE IS NO PROBABILITY, CONFIDENCE, OR CERTAINTY FIELD. Storing one
 *      would let formal storage imply truth, which §13 forbids outright. A
 *      hypothesis carries its anchors, its explanatory content, its rivals, and
 *      the evidence that would discriminate it — never a number claiming how
 *      likely it is.
 *
 *   2. `alternatives` and `discriminatingEvidence` are REQUIRED, non-empty by
 *      gate. H4 requires competing explanations remain possible; H5 requires the
 *      system be able to name what would strengthen AND weaken the hypothesis.
 *      Making them structural fields means a hypothesis without rivals or
 *      without falsifiers cannot be built, not merely that it should not be.
 *
 *   3. `supportBasis` is a four-value enum, not prose. §14 H2 names three
 *      insufficient bases explicitly, and docs/architecture.md §7 (Patch 10)
 *      forbids enforcing that by scanning text.
 */

import type { HypothesisId, RelationClaimId } from '../shared/ids';

/* ── H2 support basis (§14 H2) ────────────────────────────────────────── */

/**
 * The model's own account of WHAT KIND of support it found.
 *
 * §14 H2 rules that these are insufficient:
 *   "not ruled out" / "logically possible"  → `compatibility_only`
 *   "no contradiction found"                 → `absence_of_contradiction`
 *
 * under the two frozen rules:
 *   > Compatibility is not Support.
 *   > Absence of contradiction is not evidence of support.
 *
 * Only `directional_observation` — evidence actively pointing toward the
 * explanation — admits. Deterministic code enforces that by comparing against
 * this enum, never by reading `reasoning` prose (Patch 10).
 */
export const SUPPORT_BASES = [
  'directional_observation',
  'compatibility_only',
  'absence_of_contradiction',
  'insufficient',
] as const;

export type SupportBasis = (typeof SUPPORT_BASES)[number];

/** The single basis that constitutes positive directional support (§14 H2). */
export const ADMISSIBLE_SUPPORT_BASIS: SupportBasis = 'directional_observation';

/* ── H1 anchors (§14 H1) ──────────────────────────────────────────────── */

/**
 * How a hypothesis is anchored to evidence.
 *
 * §14 H1 permits two paths:
 *   A. at least one Relation Claim at `supported` or above
 *   B. at least two mutually independent Observed Patterns
 *
 * Path B's independence is keyed on `evidence_unit_id` identity — the same
 * identity Gate 5 uses — NOT on pattern labels. Two differently-named patterns
 * drawn from one source are one piece of evidence wearing two hats.
 */
export const ANCHOR_PATHS = ['supported_relation', 'independent_patterns'] as const;
export type AnchorPath = (typeof ANCHOR_PATHS)[number];

/**
 * An Observed Pattern offered as a path-B anchor.
 *
 * Carries its own evidence-unit footprint so independence is checkable by
 * identity. `label` exists for display and audit only; nothing decides
 * independence from it.
 */
export interface ObservedPattern {
  readonly claimId: RelationClaimId;
  readonly label: string;
  /** Every Evidence Unit this pattern rests on. Disjointness is required. */
  readonly evidenceUnitIds: readonly string[];
}

/* ── H3 explanatory gain (§14 H3) ─────────────────────────────────────── */

/**
 * What the hypothesis adds beyond restating the Relation.
 *
 * §14 H3 requires a hypothesis introduce mechanism or conditional structure AND
 * yield at least one discriminating prediction. A hypothesis that merely
 * re-describes the observed structure has no explanatory gain and is rejected.
 */
export interface ExplanatoryGain {
  /** The proposed mechanism or conditional structure. */
  readonly mechanism: string;
  /**
   * Predictions that would distinguish this explanation from its rivals.
   * Non-empty by gate: a prediction shared by every candidate discriminates
   * nothing.
   */
  readonly discriminatingPredictions: readonly string[];
}

/* ── H5 discriminating evidence (§14 H5) ──────────────────────────────── */

/**
 * Future evidence that would move the hypothesis in each direction.
 *
 * BOTH lists are required non-empty by gate. A hypothesis that can name what
 * would confirm it but nothing that would undermine it is unfalsifiable, and
 * §14 H5 requires the system describe both directions.
 */
export interface DiscriminatingEvidence {
  readonly wouldStrengthen: readonly string[];
  readonly wouldWeaken: readonly string[];
}

/* ── Candidate and stored forms ───────────────────────────────────────── */

/** A proposed hypothesis, before the admission gates run. */
export interface HypothesisCandidate {
  /** The proposed explanation. Descriptive of a possibility, not an assertion. */
  readonly explanation: string;
  /** Claims or patterns this rests on. */
  readonly anchorRefs: readonly string[];
  readonly anchorPath: AnchorPath;
  /** Patterns supplied when `anchorPath` is 'independent_patterns'. */
  readonly patterns: readonly ObservedPattern[];
  /** The model's own classification of its support (§14 H2). */
  readonly supportBasis: SupportBasis;
  /**
   * Records the model says actively point toward this explanation. Code
   * re-checks each against epistemic eligibility and lineage integrity
   * independently — an anchor may not rest on an AI hypothesis, an external
   * reference, or a lineage-collapsed source.
   */
  readonly supportingRecordRefs: readonly string[];
  readonly explanatoryGain: ExplanatoryGain;
  /** Rival explanations that remain possible (§14 H4). */
  readonly alternatives: readonly string[];
  readonly discriminatingEvidence: DiscriminatingEvidence;
}

/**
 * An admitted, persisted hypothesis.
 *
 * Note what is absent: no probability, no confidence, no truth value, no
 * ranking against its alternatives. §13 — formal storage does not make it true.
 */
export interface StoredHypothesis {
  readonly id: HypothesisId;
  readonly explanation: string;
  readonly anchorRefs: readonly string[];
  readonly anchorPath: AnchorPath;
  readonly supportBasis: SupportBasis;
  readonly supportingRecordRefs: readonly string[];
  readonly mechanism: string;
  readonly discriminatingPredictions: readonly string[];
  readonly alternatives: readonly string[];
  readonly wouldStrengthen: readonly string[];
  readonly wouldWeaken: readonly string[];
  readonly createdAt: Date;
}

export const buildStoredHypothesis = (input: {
  readonly id: HypothesisId;
  readonly candidate: HypothesisCandidate;
  readonly createdAt: Date;
}): StoredHypothesis => ({
  id: input.id,
  explanation: input.candidate.explanation,
  anchorRefs: input.candidate.anchorRefs,
  anchorPath: input.candidate.anchorPath,
  supportBasis: input.candidate.supportBasis,
  supportingRecordRefs: input.candidate.supportingRecordRefs,
  mechanism: input.candidate.explanatoryGain.mechanism,
  discriminatingPredictions:
    input.candidate.explanatoryGain.discriminatingPredictions,
  alternatives: input.candidate.alternatives,
  wouldStrengthen: input.candidate.discriminatingEvidence.wouldStrengthen,
  wouldWeaken: input.candidate.discriminatingEvidence.wouldWeaken,
  createdAt: input.createdAt,
});

/**
 * §13 executable check — an admitted hypothesis still carries its rivals and
 * its falsifiers.
 *
 * Used by tests and by the persistence adapter before a write, so a hypothesis
 * cannot be stored having lost the structure that made it admissible.
 */
export const remainsCompetable = (h: StoredHypothesis): boolean =>
  h.alternatives.length > 0 &&
  h.wouldStrengthen.length > 0 &&
  h.wouldWeaken.length > 0 &&
  h.discriminatingPredictions.length > 0;

/**
 * §13 — a Hypothesis is a POSSIBLE explanation.
 *
 * Deliberately absent from this module: probability, confidence, likelihood,
 * certainty, truth, and any ranking of one explanation over another. §15 adds
 * that user agreement does not raise evidence support, so there is likewise no
 * field an agreement could increment.
 */
export const HYPOTHESIS_STORAGE_DOES_NOT_IMPLY_TRUTH = true as const;
