/**
 * Deterministic Attention Priority aggregation (ENGINEERING_CONTRACT §17, §20,
 * §36, §40.5; docs/architecture.md §13).
 *
 * THE AGGREGATION FUNCTION IS AN OPEN QUESTION IN THE ARCHITECTURE.
 *
 * docs/architecture.md §13 records the output scale as decided
 * (`low | medium | high`) and the exact aggregation function as still deferred.
 * This module therefore implements "the smallest conservative rule that
 * preserves the frozen signal semantics, respects archive/suspend restrictions,
 * does not enable aggressive proactive behaviour, and keeps L3 disabled by
 * default" — documented as an MVP IMPLEMENTATION RULE, not as new product
 * philosophy.
 *
 * Design constraints that shaped the rule:
 *
 *   1. NO EVIDENCE INPUT. `SignalInputs` carries no support level or score
 *      (INV-09, §36). The exclusion is enforced by the input type.
 *
 *   2. NO NUMERIC SCORE ESCAPES. Internally the rule counts elevating signals,
 *      but the count is not exported and not stored. §17 forbids Discovery
 *      carrying a score that overlaps evidence strength, and a persisted number
 *      would invite exactly the ranking the contract avoids.
 *
 *   3. CEILINGS DOMINATE. Any rule that would push priority up is subordinate
 *      to every rule that holds it down. `high` is the gateway to Level 3
 *      eligibility, so reaching it requires positive grounds AND the absence of
 *      every restraint.
 *
 *   4. DETERMINISTIC AND PURE. Same signals, same priority, every time. No
 *      clock, no randomness, no model call.
 */

import {
  type SignalInputs,
  UNKNOWN_SIGNALS,
} from './attention-signals';
import type { AttentionPriority } from '../shared/enums';

/**
 * MVP IMPLEMENTATION RULE — the aggregation, stated plainly.
 *
 * Step 1. Count ELEVATING signals, each worth exactly one:
 *           novelty is `new`
 *           currentRelevance is `high`
 *           temporalDepth is `deep`
 *           potential is `high`
 *
 *         Note `interpretationRisk` NEVER elevates — it only restrains (see
 *         `INTERPRETATION_RISK_RULE`). And `resurfaced` does not elevate:
 *         something already seen is not novel because it became relevant again.
 *
 * Step 2. Base priority from the count:  0 → low | 1–2 → medium | 3+ → high
 *
 * Step 3. Apply ceilings, most restrictive winning:
 *           potential is `low`            → cap at `low`
 *           interpretationRisk is `high`  → cap at `medium`
 *           currentRelevance is `unknown` → cap at `medium`
 *
 * Why `potential: low` caps at `low` while high interpretation risk caps only at
 * `medium`: §20 says the system should provide cognitive support and exit, not
 * optimise for dependence. An item the user can do nothing with has no business
 * consuming attention at any level of prominence. Risk is different — the item
 * may matter a great deal; it merely must not be pushed.
 *
 * Why `unknown` relevance caps at `medium` rather than `low`: §18 distinguishes
 * unknown from low. Unknown blocks the proactive path without hiding the item
 * from a user who looks.
 */
export const AGGREGATION_RULE =
  'count_elevating_signals_then_apply_most_restrictive_ceiling' as const;

/** Ordinal positions, so a ceiling is an index comparison. */
const ORDER: readonly AttentionPriority[] = ['low', 'medium', 'high'];

const rank = (p: AttentionPriority): number => ORDER.indexOf(p);

/** The lower of two priorities. Used to apply ceilings. */
const lower = (
  a: AttentionPriority,
  b: AttentionPriority,
): AttentionPriority => (rank(a) <= rank(b) ? a : b);

/**
 * Which signals are currently elevating.
 *
 * Exported for auditability (§42): a computed priority should be explainable
 * without re-deriving it. Returns names, never a score.
 */
export const elevatingSignals = (
  signals: SignalInputs,
): readonly string[] => {
  const elevating: string[] = [];

  if (signals.novelty === 'new') elevating.push('novelty:new');
  if (signals.currentRelevance === 'high') {
    elevating.push('currentRelevance:high');
  }
  if (signals.temporalDepth === 'deep') elevating.push('temporalDepth:deep');
  if (signals.potential === 'high') elevating.push('potential:high');

  return elevating;
};

/**
 * Which restraints currently apply.
 *
 * Also exported for auditability, and deliberately separate from the elevating
 * list: the two are not symmetric, because ceilings dominate.
 */
export const activeCeilings = (
  signals: SignalInputs,
): readonly { readonly reason: string; readonly cap: AttentionPriority }[] => {
  const ceilings: { reason: string; cap: AttentionPriority }[] = [];

  if (signals.potential === 'low') {
    ceilings.push({
      reason:
        'potential:low — surfacing would consume attention while offering no ' +
        'purchase (§20).',
      cap: 'low',
    });
  }

  if (signals.interpretationRisk === 'high') {
    ceilings.push({
      reason:
        'interpretationRisk:high — the item must not be pushed, but remains ' +
        'available if the user looks (§18, §20).',
      cap: 'medium',
    });
  }

  if (signals.currentRelevance === 'unknown') {
    ceilings.push({
      reason:
        'currentRelevance:unknown — relevance could not be established, so ' +
        'proactive presentation is not permitted (§18).',
      cap: 'medium',
    });
  }

  return ceilings;
};

/** The base priority before ceilings, from the elevating-signal count. */
const baseFromCount = (count: number): AttentionPriority => {
  if (count >= 3) return 'high';
  if (count >= 1) return 'medium';
  return 'low';
};

/**
 * A computed priority together with the reasoning behind it.
 *
 * Note there is no numeric field: the internal count does not escape. The
 * signals and the named reasons are the audit trail (§42).
 */
export interface AttentionAssessment {
  readonly priority: AttentionPriority;
  readonly signals: SignalInputs;
  readonly elevating: readonly string[];
  readonly ceilings: readonly {
    readonly reason: string;
    readonly cap: AttentionPriority;
  }[];
}

/**
 * Compute Attention Priority from the five signals.
 *
 * Pure and total. COMPUTED ON READ — the caller must not persist the result as
 * permanent fact (docs/architecture.md §4 Patch 6).
 */
export const assessAttention = (
  signals: SignalInputs,
): AttentionAssessment => {
  const elevating = elevatingSignals(signals);
  const ceilings = activeCeilings(signals);

  const priority = ceilings.reduce<AttentionPriority>(
    (current, ceiling) => lower(current, ceiling.cap),
    baseFromCount(elevating.length),
  );

  return { priority, signals, elevating, ceilings };
};

/** Convenience for callers needing only the level. */
export const attentionPriorityFor = (
  signals: SignalInputs,
): AttentionPriority => assessAttention(signals).priority;

/**
 * The floor case: unknown signals must never yield high priority.
 *
 * Exported as an executable statement of the conservative default rather than a
 * comment asserting it.
 */
export const UNKNOWN_SIGNALS_PRIORITY: AttentionPriority =
  attentionPriorityFor(UNKNOWN_SIGNALS);
