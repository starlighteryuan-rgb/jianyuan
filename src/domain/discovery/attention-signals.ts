/**
 * The five Attention Priority signals (ENGINEERING_CONTRACT §17, §20, §36;
 * docs/architecture.md §13).
 *
 * §20 states what this layer is for:
 *
 *   > Attention Management means returning the user's attention to themselves.
 *   > identify something worth returning to attention → bring it back →
 *     provide sufficient cognitive support → exit.
 *
 * So the signals answer "is this worth returning to the user's attention now?"
 * — never "how true is this?" or "how strong is the evidence?".
 *
 * THE STRUCTURAL EXCLUSION (INV-09, §36):
 *
 *   `SignalInputs` contains NO evidence support level, no numeric evidence
 *   score, and no dimension judgments. Strong evidence support does not imply
 *   high attention priority, and the exclusion is enforced by the input type
 *   rather than by a convention someone must remember. A future field added
 *   carelessly would have to be added HERE, in a type whose doc comment forbids
 *   it, and the test suite pins the key set.
 *
 * §17 also forbids Discovery carrying a score that overlaps evidence strength,
 * which is why every signal below is a small ordinal enum rather than a number:
 * numbers invite arithmetic, comparison, and ranking that the contract does not
 * support.
 */

import type { RelevanceState } from '../shared/enums';

/* ── Signal 1: Novelty ────────────────────────────────────────────────── */

/**
 * Has this been brought to the user's attention before?
 *
 * `resurfaced` is deliberately distinct from `new`: something the user has
 * already seen is not novel merely because it became relevant again. Collapsing
 * the two would let repeated surfacing masquerade as fresh discovery — the
 * attention-layer analogue of INV-03's manufactured evidence.
 */
export const NOVELTY_STATES = ['new', 'resurfaced', 'seen'] as const;
export type NoveltyState = (typeof NOVELTY_STATES)[number];

/* ── Signal 2: Current Relevance ──────────────────────────────────────── */
// Four-valued `RelevanceState` from shared/enums, where `unknown` is distinct
// from `low` (§18): unknown prohibits proactive presentation but not passive
// availability. Derived from CurrentFocusContext (§19), never guessed.

/* ── Signal 3: Temporal Depth ─────────────────────────────────────────── */

/**
 * How far back the underlying evidence reaches.
 *
 * `unknown` exists because depth cannot be computed for a subject whose records
 * carry only a user-reported interval with no resolved bounds — §12 forbids
 * splitting such an interval into synthetic points to manufacture a span.
 * Unknown depth is not shallow depth.
 */
export const TEMPORAL_DEPTH_STATES = [
  'unknown',
  'shallow',
  'moderate',
  'deep',
] as const;
export type TemporalDepthState = (typeof TEMPORAL_DEPTH_STATES)[number];

/* ── Signal 4: Reflection / Action Potential ──────────────────────────── */

/**
 * Is there something the user could actually reflect on or act on here?
 *
 * Low potential means surfacing would cost the user attention while offering no
 * purchase — precisely the dependence-optimising behaviour §20 rejects.
 */
export const POTENTIAL_STATES = ['low', 'medium', 'high'] as const;
export type PotentialState = (typeof POTENTIAL_STATES)[number];

/* ── Signal 5: Interpretation Risk ────────────────────────────────────── */

/**
 * How easily could this be misread as a stronger claim than it is?
 *
 * §17 lists Interpretation Risk as a signal WITHOUT stating its direction, so
 * the direction is an interpretation choice. See `INTERPRETATION_RISK_RULE`
 * below for the choice made and why.
 */
export const INTERPRETATION_RISK_STATES = ['low', 'medium', 'high'] as const;
export type InterpretationRiskState =
  (typeof INTERPRETATION_RISK_STATES)[number];

/**
 * MVP IMPLEMENTATION RULE — the direction of Interpretation Risk.
 *
 * Mine, not the contract's. §17 names the signal but not its direction, and
 * both readings are arguable:
 *
 *   (a) High risk RAISES priority — the item most needs the user's own
 *       interpretation returned to them.
 *   (b) High risk LOWERS priority — do not surface what is likely to be
 *       misread.
 *
 * Chosen: high risk CAPS priority at `medium` rather than forcing it to `low`.
 *
 * Reasoning. `high` is the gateway to Level 3 eligibility (§18), so capping
 * there delivers the restraint §20 asks for: a risky item is never pushed at
 * the user. But capping at `low` would hide risky items from a user who
 * ACTIVELY OPENED the stream, which is the system deciding what the user may
 * not see about themselves — the opposite of §20's "returning the user's
 * attention to themselves", and in tension with §18's Level 2 requiring the
 * user to look.
 */
export const INTERPRETATION_RISK_RULE =
  'high_interpretation_risk_caps_priority_at_medium' as const;

/* ── The signal set ───────────────────────────────────────────────────── */

/**
 * All five signals for one Discovery.
 *
 * Every field is a categorical judgment supplied by the caller (computed from
 * records, states, and focus context) — this module performs no I/O and reads
 * no evidence score.
 */
export interface SignalInputs {
  readonly novelty: NoveltyState;
  readonly currentRelevance: RelevanceState;
  readonly temporalDepth: TemporalDepthState;
  readonly potential: PotentialState;
  readonly interpretationRisk: InterpretationRiskState;
}

/**
 * The five signal names, in contract order.
 *
 * Exported so tests can assert the set is exactly five and that no sixth signal
 * (especially an evidence-derived one) crept in.
 */
export const ATTENTION_SIGNALS = [
  'novelty',
  'currentRelevance',
  'temporalDepth',
  'potential',
  'interpretationRisk',
] as const;

export type AttentionSignalName = (typeof ATTENTION_SIGNALS)[number];

/**
 * Signals that are structurally forbidden as attention inputs.
 *
 * Documentation-in-code for INV-09 / §36. The test suite asserts none of these
 * appears as a key of `SignalInputs`.
 */
export const FORBIDDEN_ATTENTION_INPUTS = [
  'evidenceSupportLevel',
  'evidenceNumericScore',
  'evidenceDimensionScores',
  'supportBasis',
  'userPosition',
] as const;

/**
 * The most conservative possible signal set.
 *
 * Used when signals cannot be established. Note `unknown` for both relevance
 * and depth rather than `low`: "we could not determine this" is a different
 * claim from "this is low", and only the former blocks proactive presentation
 * on relevance grounds (§18).
 */
export const UNKNOWN_SIGNALS: SignalInputs = {
  novelty: 'seen',
  currentRelevance: 'unknown',
  temporalDepth: 'unknown',
  potential: 'low',
  interpretationRisk: 'high',
};
