/**
 * Hypothesis Admission Gates H1–H6 (ENGINEERING_CONTRACT §14), plus the §16.2
 * suspension constraint.
 *
 * All six must pass for a hypothesis to be admitted. Authority per gate (§31):
 *
 *   H1 Anchor                      → CODE  (support levels + evidence units)
 *   H2 Positive Directional Support → LLM classifies, CODE decides
 *   H3 Explanatory Gain            → LLM judges, CODE checks presence
 *   H4 Alternative Awareness       → CODE  (non-empty rivals)
 *   H5 Discriminating Evidence     → CODE  (both directions non-empty)
 *   H6 Abstraction Ceiling         → LLM flags, CODE hard-fails
 *
 * H2 carries the most weight and is the easiest to fake. §14 H2 names the
 * insufficient bases explicitly — "not ruled out", "logically possible",
 * "compatible", "no contradiction found" — under two frozen rules:
 *
 *   > Compatibility is not Support.
 *   > Absence of contradiction is not evidence of support.
 *
 * Enforcement is a comparison against the model's own structured
 * `supportBasis` enum, never a scan of its prose (docs/architecture.md §7,
 * Patch 10).
 */

import {
  ADMISSIBLE_SUPPORT_BASIS,
  type HypothesisCandidate,
  type ObservedPattern,
} from './hypothesis';
import type { AbstractionCeilingJudgment } from '../ports/semantic-judgment';
import { isEpistemicallyEligible } from '../relation/gates';
import type { PersonalRecord } from '../record/record';
import { distinctEvidenceUnitCount } from '../record/record';
import type { StoredRelationClaim } from '../relation/relation-claim';
import type { WorkflowState } from '../shared/enums';

export const ADMISSION_GATES = [
  'anchor',
  'positive_directional_support',
  'explanatory_gain',
  'alternative_awareness',
  'discriminating_evidence',
  'abstraction_ceiling',
] as const;

export type AdmissionGateName = (typeof ADMISSION_GATES)[number];

export type AdmissionFailure = {
  readonly gate: AdmissionGateName | 'suspension';
  readonly code: string;
  readonly detail: string;
};

export type AdmissionOutcome =
  | { readonly passed: true }
  | { readonly passed: false; readonly failure: AdmissionFailure };

const pass: AdmissionOutcome = { passed: true };

const fail = (
  gate: AdmissionGateName | 'suspension',
  code: string,
  detail: string,
): AdmissionOutcome => ({ passed: false, failure: { gate, code, detail } });

/* ── H1 — Anchor (§14 H1) ─────────────────────────────────────────────── */

/**
 * Support levels that satisfy anchor path A.
 *
 * §14 H1 requires "at least one Relation Claim at `supported` or above", so
 * `weak` and `observed` do not qualify on their own.
 */
export const PATH_A_SUFFICIENT_LEVELS = ['supported', 'strong'] as const;

/**
 * Minimum Evidence Units for a single Observed Pattern under the STRICT reading.
 *
 * MVP IMPLEMENTATION RULE (mine, not the contract's — flagged as such).
 *
 * A "Pattern" is not the same thing as a claim that merely cleared the
 * `observed` threshold: a pattern implies repetition. The strict reading
 * therefore requires each path-B pattern to rest on at least two Evidence
 * Units of its own. The contract fixes the independence rule but not this
 * threshold, so it is recorded here as an implementation decision.
 */
export const MIN_EVIDENCE_UNITS_PER_PATTERN = 2;

/** Minimum patterns for anchor path B (§14 H1: "at least two"). */
export const MIN_INDEPENDENT_PATTERNS = 2;

/**
 * Are these patterns MUTUALLY INDEPENDENT?
 *
 * Independence is decided by `evidence_unit_id` identity — the same identity
 * Gate 5 uses — and never by pattern label. §14 H1's own qualifier is that the
 * patterns "must not simply repackage the same primary Evidence Units under
 * different axes", so two differently-named patterns drawn from one source are
 * one piece of evidence wearing two hats.
 *
 * Implemented as PAIRWISE DISJOINTNESS: no two patterns may share any Evidence
 * Unit. A weaker "the union is larger than one" test would admit two patterns
 * overlapping on a shared source, which is exactly the repackaging the contract
 * names.
 */
export const patternsAreMutuallyIndependent = (
  patterns: readonly ObservedPattern[],
): boolean => {
  for (let i = 0; i < patterns.length; i += 1) {
    for (let j = i + 1; j < patterns.length; j += 1) {
      const left = patterns[i];
      const right = patterns[j];
      if (left === undefined || right === undefined) continue;

      const shared = left.evidenceUnitIds.some((unit) =>
        right.evidenceUnitIds.includes(unit),
      );
      if (shared) return false;
    }
  }

  return true;
};

/** Evidence Units shared between any two patterns, for audit detail. */
const sharedUnitsAcross = (
  patterns: readonly ObservedPattern[],
): readonly string[] => {
  const seen = new Map<string, number>();

  for (const pattern of patterns) {
    // Deduplicate within a pattern first: one pattern citing the same unit
    // twice is not evidence of cross-pattern overlap.
    for (const unit of new Set(pattern.evidenceUnitIds)) {
      seen.set(unit, (seen.get(unit) ?? 0) + 1);
    }
  }

  return [...seen.entries()].flatMap(([unit, count]) =>
    count > 1 ? [unit] : [],
  );
};

export const gateAnchor = (
  candidate: HypothesisCandidate,
  anchorClaims: readonly StoredRelationClaim[],
): AdmissionOutcome => {
  if (candidate.anchorPath === 'supported_relation') {
    // `some` rather than `includes` so no type assertion is needed to compare a
    // widened union against the narrow tuple.
    const qualifying = anchorClaims.filter((claim) =>
      PATH_A_SUFFICIENT_LEVELS.some((level) => level === claim.supportLevel),
    );

    if (qualifying.length === 0) {
      const levels =
        anchorClaims.map((c) => c.supportLevel ?? 'unscored').join(', ') ||
        'none';

      return fail(
        'anchor',
        'no_supported_relation',
        'Anchor path A requires at least one Relation Claim at `supported` or ' +
          `above; the supplied anchors are at: ${levels}.`,
      );
    }

    return pass;
  }

  // ── Path B: mutually independent Observed Patterns ────────────────────
  const { patterns } = candidate;

  if (patterns.length < MIN_INDEPENDENT_PATTERNS) {
    return fail(
      'anchor',
      'insufficient_patterns',
      `Anchor path B requires at least ${MIN_INDEPENDENT_PATTERNS} Observed ` +
        `Patterns; ${patterns.length} supplied.`,
    );
  }

  const thin = patterns.filter(
    (p) =>
      new Set(p.evidenceUnitIds).size < MIN_EVIDENCE_UNITS_PER_PATTERN,
  );

  if (thin.length > 0) {
    return fail(
      'anchor',
      'pattern_not_repeated',
      `A Pattern implies repetition, so each requires at least ` +
        `${MIN_EVIDENCE_UNITS_PER_PATTERN} distinct Evidence Units; ` +
        `underweight: ${thin.map((p) => p.claimId).join(', ')}.`,
    );
  }

  if (!patternsAreMutuallyIndependent(patterns)) {
    return fail(
      'anchor',
      'patterns_not_independent',
      'Patterns must not repackage the same primary Evidence Units under ' +
        `different axes; shared units: ${sharedUnitsAcross(patterns).join(', ')}.`,
    );
  }

  return pass;
};

/* ── H2 — Positive Directional Support (§14 H2) ───────────────────────── */

/**
 * "Evidence must actively point toward the explanation."
 *
 * Three checks, all structural:
 *
 *   1. `supportBasis` must be exactly `directional_observation`. The three
 *      other values are the contract's named insufficient bases and hard-fail.
 *   2. `supportingRecordRefs` must be non-empty — support that names no record
 *      points at nothing.
 *   3. Every supporting record must independently pass epistemic eligibility
 *      (Gate 2) and the set must not be lineage-collapsed (Gate 5). An anchor
 *      may not rest on an AI hypothesis, an external reference, or one source
 *      counted twice (INV-01, INV-06, INV-02, INV-03).
 */
export const gatePositiveDirectionalSupport = (
  candidate: HypothesisCandidate,
  supportingRecords: readonly PersonalRecord[],
): AdmissionOutcome => {
  if (candidate.supportBasis !== ADMISSIBLE_SUPPORT_BASIS) {
    return fail(
      'positive_directional_support',
      `support_basis_${candidate.supportBasis}`,
      `Support basis is \`${candidate.supportBasis}\`; only ` +
        `\`${ADMISSIBLE_SUPPORT_BASIS}\` admits. Compatibility is not ` +
        'support, and absence of contradiction is not evidence of support.',
    );
  }

  if (candidate.supportingRecordRefs.length === 0) {
    return fail(
      'positive_directional_support',
      'no_supporting_records',
      'Directional support must name the records that point toward the ' +
        'explanation; none were supplied.',
    );
  }

  const missing = candidate.supportingRecordRefs.filter(
    (ref) => !supportingRecords.some((r) => r.id === ref),
  );

  if (missing.length > 0) {
    return fail(
      'positive_directional_support',
      'unresolved_supporting_record',
      `Supporting records could not be resolved: ${missing.join(', ')}.`,
    );
  }

  const ineligible = supportingRecords.filter(
    (r) => !isEpistemicallyEligible(r),
  );

  if (ineligible.length > 0) {
    return fail(
      'positive_directional_support',
      'ineligible_supporting_record',
      'Supporting evidence may not be an AI hypothesis, an external ' +
        `reference, or a product event: ${ineligible.map((r) => r.id).join(', ')}.`,
    );
  }

  // Re-checked here rather than inherited from the anchor claim: H2's support
  // set is its own set of records and may differ from the anchor's.
  if (
    supportingRecords.length > 1 &&
    distinctEvidenceUnitCount(supportingRecords) < 2
  ) {
    return fail(
      'positive_directional_support',
      'supporting_records_collapse',
      `${supportingRecords.length} supporting records collapse to a single ` +
        'Evidence Unit; repetition of one source is not additional support.',
    );
  }

  return pass;
};

/* ── H3 — Explanatory Gain (§14 H3) ───────────────────────────────────── */

/**
 * The hypothesis must add mechanism or conditional structure AND yield at least
 * one discriminating prediction. Restating the Relation in other words is not
 * explanation.
 */
export const gateExplanatoryGain = (
  candidate: HypothesisCandidate,
): AdmissionOutcome => {
  const { mechanism, discriminatingPredictions } = candidate.explanatoryGain;

  if (mechanism.trim().length === 0) {
    return fail(
      'explanatory_gain',
      'no_mechanism',
      'The hypothesis proposes no mechanism or conditional structure beyond ' +
        'the Relation it rests on.',
    );
  }

  if (discriminatingPredictions.length === 0) {
    return fail(
      'explanatory_gain',
      'no_discriminating_prediction',
      'The hypothesis yields no prediction that would distinguish it from ' +
        'competing explanations.',
    );
  }

  return pass;
};

/* ── H4 — Alternative Awareness (§14 H4) ──────────────────────────────── */

/**
 * Competing explanations must remain possible.
 *
 * A hypothesis presented as the only available account has foreclosed the
 * competition the layer exists to preserve (§13).
 */
export const gateAlternativeAwareness = (
  candidate: HypothesisCandidate,
): AdmissionOutcome =>
  candidate.alternatives.length === 0
    ? fail(
        'alternative_awareness',
        'no_alternatives',
        'No competing explanation is recorded, so this hypothesis is ' +
          'presented as the only possible account.',
      )
    : pass;

/* ── H5 — Discriminating Evidence (§14 H5) ────────────────────────────── */

/**
 * The system must be able to say what would strengthen AND what would weaken
 * the hypothesis.
 *
 * Both directions are required. A hypothesis that can name confirmations but no
 * falsifiers is unfalsifiable, and one that can name neither is not a
 * hypothesis at all.
 */
export const gateDiscriminatingEvidence = (
  candidate: HypothesisCandidate,
): AdmissionOutcome => {
  const { wouldStrengthen, wouldWeaken } = candidate.discriminatingEvidence;

  if (wouldStrengthen.length === 0) {
    return fail(
      'discriminating_evidence',
      'no_strengthening_evidence',
      'The system cannot name evidence that would strengthen this hypothesis.',
    );
  }

  if (wouldWeaken.length === 0) {
    return fail(
      'discriminating_evidence',
      'no_weakening_evidence',
      'The system cannot name evidence that would weaken this hypothesis, ' +
        'making it unfalsifiable.',
    );
  }

  return pass;
};

/* ── H6 — Abstraction Ceiling (§14 H6) ────────────────────────────────── */

/**
 * No personality, identity, permanent attribute, essential nature, or certain
 * causality.
 *
 * Reuses the Relation-stage judgment shape deliberately: §14 H6's prohibition
 * list is near-identical to §8 Gate 6's, and a second parallel mechanism would
 * be a divergence risk rather than extra safety.
 */
export const gateHypothesisAbstractionCeiling = (
  judgment: AbstractionCeilingJudgment,
): AdmissionOutcome =>
  judgment.prohibitedClaimDetected
    ? fail(
        'abstraction_ceiling',
        'prohibited_abstraction',
        'The hypothesis escalates into a prohibited abstraction' +
          `${judgment.category === null ? '' : ` (${judgment.category})`}; it ` +
          'may not assert personality, identity, a permanent attribute, an ' +
          'essential nature, or certain causality.',
      )
    : pass;

/* ── §16.2 — Suspension blocks new hypothesis generation ──────────────── */

/**
 * A suspended Relation yields NO new Hypothesis generation (§16.2).
 *
 * Evidence survives suspension — §16.1 makes `strong` evidence with a
 * `disagrees` position and a `suspended` workflow a VALID combination — so this
 * does not erase anything. It stops forward progression only.
 *
 * Not one of the six numbered gates, but binding at the same point in the
 * pipeline, so it is enforced alongside them.
 */
export const gateNotSuspended = (
  anchorStates: readonly {
    readonly targetRef: string;
    readonly workflowState: WorkflowState;
  }[],
): AdmissionOutcome => {
  const suspended = anchorStates.filter((s) => s.workflowState === 'suspended');

  return suspended.length > 0
    ? fail(
        'suspension',
        'anchor_suspended',
        'No new Hypothesis may be generated from a suspended Relation ' +
          `(§16.2): ${suspended.map((s) => s.targetRef).join(', ')}. The ` +
          'evidence remains and future independent facts may still be received.',
      )
    : pass;
};

/* ── Aggregate ────────────────────────────────────────────────────────── */

export interface AdmissionInputs {
  readonly candidate: HypothesisCandidate;
  readonly anchorClaims: readonly StoredRelationClaim[];
  readonly supportingRecords: readonly PersonalRecord[];
  readonly abstractionCeiling: AbstractionCeilingJudgment;
  readonly anchorStates: readonly {
    readonly targetRef: string;
    readonly workflowState: WorkflowState;
  }[];
}

/**
 * Run every gate, collecting all failures.
 *
 * No short-circuit: a candidate failing H2 and H5 should report both, so a
 * rejection is fully auditable (§42).
 */
export const runAdmissionGates = (
  inputs: AdmissionInputs,
): readonly AdmissionFailure[] => {
  const outcomes: readonly AdmissionOutcome[] = [
    gateNotSuspended(inputs.anchorStates),
    gateAnchor(inputs.candidate, inputs.anchorClaims),
    gatePositiveDirectionalSupport(inputs.candidate, inputs.supportingRecords),
    gateExplanatoryGain(inputs.candidate),
    gateAlternativeAwareness(inputs.candidate),
    gateDiscriminatingEvidence(inputs.candidate),
    gateHypothesisAbstractionCeiling(inputs.abstractionCeiling),
  ];

  return outcomes.flatMap((o) => (o.passed ? [] : [o.failure]));
};

export const isAdmissible = (inputs: AdmissionInputs): boolean =>
  runAdmissionGates(inputs).length === 0;
