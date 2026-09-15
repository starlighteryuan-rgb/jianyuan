/**
 * Relation Hard Gates 1–6 (ENGINEERING_CONTRACT §8).
 *
 * All six must pass BEFORE evidence scoring. §8 is explicit about the ordering:
 * "Before evidence scoring, a candidate Relation Claim must pass the required
 * gates." Gate 4 in particular must precede scoring, because §10.3 says
 * Temporal Adequacy is "only scored AFTER Temporal Legibility passes".
 *
 * Where each gate's authority lives (§31):
 *
 *   Gate 1  Usage Permission          → CODE   (directives)
 *   Gate 2  Epistemic Eligibility     → CODE   (epistemic roles)
 *   Gate 3  Operational Comparability → LLM judges, CODE decides from fields
 *   Gate 4  Temporal Legibility       → CODE   (time semantics)
 *   Gate 5  Lineage Integrity         → CODE   (evidence unit identity)
 *   Gate 6  Abstraction Ceiling       → LLM judges, CODE hard-fails on flag
 *
 * The two model-informed gates receive STRUCTURED judgments and branch on
 * dedicated boolean/enum fields only. No gate parses an `explanation`
 * (docs/architecture.md §7, Patch 10).
 */

import type {
  AbstractionCeilingJudgment,
  ComparabilityJudgment,
} from '../ports/semantic-judgment';
import type { EffectivePermissions } from '../directive/directive-resolution';
import { permitsAnalysis } from '../directive/directive-resolution';
import type { PersonalRecord } from '../record/record';
import { distinctEvidenceUnitCount } from '../record/record';
import { isReportedInterval } from '../shared/time-semantics';
import type { EpistemicRole } from '../shared/enums';
import type { RelationClaimCandidate } from './relation-claim';
import type { RecordId } from '../shared/ids';

export const GATES = [
  'usage_permission',
  'epistemic_eligibility',
  'operational_comparability',
  'temporal_legibility',
  'lineage_integrity',
  'abstraction_ceiling',
] as const;

export type GateName = (typeof GATES)[number];

export type GateFailure = {
  readonly gate: GateName;
  /** Machine-readable cause. Never free prose used for control flow. */
  readonly code: string;
  readonly detail: string;
};

export type GateOutcome =
  | { readonly passed: true }
  | { readonly passed: false; readonly failure: GateFailure };

const pass: GateOutcome = { passed: true };

const fail = (
  gate: GateName,
  code: string,
  detail: string,
): GateOutcome => ({ passed: false, failure: { gate, code, detail } });

/* ── Gate 1 — Usage Permission (§8) ───────────────────────────────────── */

/**
 * "The underlying records must permit the intended analysis. User directives
 * override system preference."
 *
 * A Relation Claim IS analysis, so this consults `allowAnalysis` specifically —
 * never a general-purpose permission. "只记录，不分析" must block this gate
 * while still permitting storage (§26, INV-17).
 */
export const gateUsagePermission = (
  permissions: EffectivePermissions,
): GateOutcome =>
  permitsAnalysis(permissions)
    ? pass
    : fail(
        'usage_permission',
        'analysis_not_permitted',
        'An active directive forbids analysis of these records ' +
          `(applied directives: ${permissions.appliedDirectiveIds.join(', ') || 'none'}).`,
      );

/* ── Gate 2 — Epistemic Eligibility (§8, INV-01, INV-06) ──────────────── */

/**
 * Roles that may NEVER serve as evidence for a personal Relation Claim.
 *
 * §8 Gate 2: "AI hypotheses, generated summaries, and external references MUST
 * NOT masquerade as observed personal facts."
 *
 *   - `ai_hypothesis`      → INV-01: AI Hypothesis is not factual evidence.
 *   - `external_reference`  → INV-06 / §38: external material cannot define the
 *                            user. docs/architecture.md §8 calls this a hard
 *                            filter that stays closed.
 *   - `product_event`       → §39: system interactions are real events, but they
 *                            are not evidence about behaviour outside the
 *                            product.
 */
export const EPISTEMICALLY_INELIGIBLE_ROLES: readonly EpistemicRole[] = [
  'ai_hypothesis',
  'external_reference',
  'product_event',
] as const;

/**
 * A record is ineligible if it carries ANY ineligible role.
 *
 * Deliberately "any", not "only". A record labelled both `user_expression` and
 * `ai_hypothesis` is still an AI artifact; letting the benign label rescue it
 * would be exactly the masquerade Gate 2 forbids.
 */
export const isEpistemicallyEligible = (record: PersonalRecord): boolean =>
  !record.epistemicRoles.some((role) =>
    EPISTEMICALLY_INELIGIBLE_ROLES.includes(role),
  );

export const gateEpistemicEligibility = (
  records: readonly PersonalRecord[],
): GateOutcome => {
  const ineligible = records.filter((r) => !isEpistemicallyEligible(r));

  if (ineligible.length > 0) {
    const offending = ineligible
      .map(
        (r) =>
          `${r.id}[${r.epistemicRoles
            .filter((role) => EPISTEMICALLY_INELIGIBLE_ROLES.includes(role))
            .join(',')}]`,
      )
      .join(' ');

    return fail(
      'epistemic_eligibility',
      'ineligible_epistemic_role',
      'AI hypotheses, external references, and product events may not serve ' +
        `as evidence for a personal Relation Claim: ${offending}.`,
    );
  }

  return pass;
};

/* ── Gate 3 — Operational Comparability (§8) ──────────────────────────── */

/**
 * "Records must support a sufficiently specific, same-nature Comparison Axis.
 * Shared words, themes, abstract categories, or verbatim alone are
 * insufficient." Sanity test: 具体比较什么?
 *
 * Code decides from three structured booleans. `onlySharedCategory` encodes the
 * named failure: if the only answer is "它们都属于 X", comparability fails.
 */
export const gateOperationalComparability = (
  judgment: ComparabilityJudgment,
): GateOutcome => {
  if (judgment.onlySharedCategory) {
    return fail(
      'operational_comparability',
      'only_shared_category',
      'The axis reduces to shared membership in a category ("它们都属于 X"), ' +
        'which §8 Gate 3 treats as insufficient.',
    );
  }

  if (!judgment.operationallySpecific) {
    return fail(
      'operational_comparability',
      'axis_not_operationally_specific',
      'The Comparison Axis does not answer 具体比较什么 with enough specificity.',
    );
  }

  if (!judgment.sameNature) {
    return fail(
      'operational_comparability',
      'axis_not_same_nature',
      'The records do not support a same-nature comparison on this axis.',
    );
  }

  return pass;
};

/* ── Gate 4 — Temporal Legibility (§8, §5, §5.1) ──────────────────────── */

/**
 * "Is the temporal interpretation itself legally supported?"
 *
 * §8 is emphatic that this gate does NOT ask how strong the temporal evidence
 * is — that is scored later as Temporal Adequacy (§10.3). So this checks
 * legality only.
 *
 * The rule enforced: a claim asserting ordering or transition across records
 * cannot rest on a `user_reported_interval`. An interval says the user later
 * reported that span; it is not a sequence of observed points, and §12 forbids
 * splitting it into synthetic events (INV-08).
 *
 * Ordering across `observation_time` snapshots IS legal here — §5.1 permits a
 * transition somewhere within the observation interval. What remains illegal is
 * claiming an exact transition time, which no relation type may assert and
 * which `exactTransitionTimeFromSnapshots` refuses at the source.
 */
export const gateTemporalLegibility = (
  candidate: RelationClaimCandidate,
  records: readonly PersonalRecord[],
): GateOutcome => {
  if (!candidate.assertsTemporalOrdering) return pass;

  const intervals = records.filter((r) => isReportedInterval(r.time));

  if (intervals.length > 0) {
    return fail(
      'temporal_legibility',
      'ordering_over_reported_interval',
      'A user-reported interval is not a sequence of observed points, so it ' +
        `cannot support a temporal ordering claim (records: ${intervals
          .map((r) => r.id)
          .join(', ')}).`,
    );
  }

  if (records.length < 2) {
    return fail(
      'temporal_legibility',
      'ordering_requires_multiple_points',
      'A temporal ordering claim needs at least two time points to order.',
    );
  }

  return pass;
};

/* ── Gate 5 — Lineage Integrity / No Double Counting (§8, §6.1) ────────── */

/**
 * "The claim must not depend on duplicated, derivative, or artificially
 * multiplied evidence."
 *
 * Keyed on `evidenceUnitId`, which is exactly why that identity was promoted to
 * first class (docs/architecture.md §4 Patch 2): the check is a cheap DISTINCT
 * rather than a transitive lineage traversal.
 *
 * The enforced rule: a multi-record claim must rest on at least two DISTINCT
 * Evidence Units. Comparing a record with its own summary or reformat is
 * comparing one source to itself — INV-02 ("a summary of an event is not
 * another event") and INV-03 (repeated prompting manufactures nothing).
 *
 * A single-record claim passes: it makes no cross-record independence claim.
 * How much independent support a relation type actually needs is a separate,
 * later question, scored as Independent Support (§10.2) — and §10.2 warns
 * against punishing a two-endpoint Change relation merely for having two
 * records, so this gate counts UNITS, never records.
 */
export const gateLineageIntegrity = (
  records: readonly PersonalRecord[],
): GateOutcome => {
  if (records.length < 2) return pass;

  const units = distinctEvidenceUnitCount(records);

  if (units < 2) {
    return fail(
      'lineage_integrity',
      'evidence_units_collapse',
      `${records.length} records collapse to ${units} Evidence Unit; the ` +
        'claim would count one source as independent support for itself.',
    );
  }

  return pass;
};

/* ── Gate 6 — Abstraction Ceiling (§8, Patch 10) ──────────────────────── */

/**
 * "A descriptive Relation Claim must not silently escalate into: personality;
 * identity; permanent trait; hidden motive; certain causal explanation."
 *
 * `prohibitedClaimDetected = true` hard-fails regardless of any other field
 * (docs/architecture.md §7). Code reads the boolean and category only; the
 * former keyword blocklist was dropped as the enforcement mechanism.
 */
export const gateAbstractionCeiling = (
  judgment: AbstractionCeilingJudgment,
): GateOutcome =>
  judgment.prohibitedClaimDetected
    ? fail(
        'abstraction_ceiling',
        'prohibited_abstraction',
        'The claim escalates into a prohibited abstraction' +
          `${judgment.category === null ? '' : ` (${judgment.category})`}; a ` +
          'descriptive Relation may not become personality, identity, a ' +
          'permanent trait, a hidden motive, or certain causation.',
      )
    : pass;

/* ── Aggregate ────────────────────────────────────────────────────────── */

export interface GateInputs {
  readonly candidate: RelationClaimCandidate;
  readonly records: readonly PersonalRecord[];
  readonly permissions: EffectivePermissions;
  readonly comparability: ComparabilityJudgment;
  readonly abstractionCeiling: AbstractionCeilingJudgment;
}

/**
 * Run all six gates in contract order, collecting every failure.
 *
 * All gates are evaluated rather than short-circuiting, so a rejected candidate
 * reports every reason it was rejected. That matters for §42 auditability: a
 * claim that fails both Gate 2 and Gate 5 should say so.
 */
export const runGates = (inputs: GateInputs): readonly GateFailure[] => {
  const outcomes: readonly GateOutcome[] = [
    gateUsagePermission(inputs.permissions),
    gateEpistemicEligibility(inputs.records),
    gateOperationalComparability(inputs.comparability),
    gateTemporalLegibility(inputs.candidate, inputs.records),
    gateLineageIntegrity(inputs.records),
    gateAbstractionCeiling(inputs.abstractionCeiling),
  ];

  return outcomes.flatMap((o) => (o.passed ? [] : [o.failure]));
};

/** Convenience for callers that only need the verdict. */
export const allGatesPass = (inputs: GateInputs): boolean =>
  runGates(inputs).length === 0;

/**
 * Records referenced by a candidate but absent from the resolved set.
 *
 * A claim may not be evaluated against records that could not be loaded:
 * silently dropping one would change what the claim is about (§42, INV-16).
 */
export const missingRecordRefs = (
  candidate: RelationClaimCandidate,
  records: readonly PersonalRecord[],
): readonly RecordId[] => {
  const present = new Set<string>(records.map((r) => r.id));
  return candidate.recordRefs.filter((ref) => !present.has(ref));
};
