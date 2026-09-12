/**
 * Presentation Level decision (ENGINEERING_CONTRACT §16.3, §18, §20, §26,
 * §40.5; docs/architecture.md §4 Patch 5, §4 Patch 6).
 *
 * §18's three levels:
 *
 *   l1 — stored only; not surfaced.
 *   l2 — available when the user looks (PASSIVE).
 *   l3 — proactively brought to the user (ACTIVE).
 *
 * This module decides the CEILING a Discovery may be presented at. It is
 * computed on read and never stored (Patch 6): only Discovery identity persists.
 *
 * Two separations the contract insists on, both structural here:
 *
 *   PRESENTATION IS NOT EPISTEMIC VALIDITY. Nothing in `PresentationInputs`
 *   carries an evidence score, and nothing this module returns changes one.
 *   Archiving a Discovery does not weaken its evidence; suspending it does not
 *   refute it (§16.1, §16.3, §36).
 *
 *   PASSIVE AND PROACTIVE PERMISSIONS ARE INDEPENDENT (Patch 5). "Don't
 *   proactively remind me about this" does not imply "don't show it if I look",
 *   and vice versa. They are two fields and are checked separately.
 *
 * L3 IS DISABLED BY DEFAULT (§18, §40.5). Reaching l3 requires the default to
 * be explicitly lifted AND every other condition to hold. The default-off flag
 * is the last word: no combination of signals can override it.
 */

import type { AttentionAssessment } from './attention-priority';
import type { AttentionPriority, PresentationLevel } from '../shared/enums';

/**
 * Whether proactive presentation is enabled at all for this deployment.
 *
 * MVP ships with L3 off (§40.5). Kept as a named constant rather than an inline
 * `false` so the single place that would have to change is explicit and
 * greppable.
 */
export const L3_ENABLED_BY_DEFAULT = false;

const ORDER: readonly PresentationLevel[] = ['l1', 'l2', 'l3'];

const rank = (l: PresentationLevel): number => ORDER.indexOf(l);

const lower = (
  a: PresentationLevel,
  b: PresentationLevel,
): PresentationLevel => (rank(a) <= rank(b) ? a : b);

/**
 * Everything the decision depends on.
 *
 * Deliberately absent: evidence support level, numeric score, dimension
 * judgments, hypothesis support basis. Presentation prominence is not a function
 * of epistemic strength (INV-09, §36), and the input type enforces it.
 */
export interface PresentationInputs {
  /** Computed attention assessment (§17). */
  readonly attention: AttentionAssessment;

  /** §16.3 — the user archived this. A presentation decision, not a deletion. */
  readonly archived: boolean;

  /** §16.2 — the user suspended this line of analysis. */
  readonly suspended: boolean;

  /** Patch 5 — independent Directive permissions. */
  readonly allowPassivePresentation: boolean;
  readonly allowProactivePresentation: boolean;

  /**
   * Deployment-level L3 switch. Defaults off (§40.5); pass `true` only where
   * proactive presentation has been explicitly enabled.
   */
  readonly l3Enabled?: boolean;
}

export interface PresentationDecision {
  /** The highest level this Discovery may be presented at. */
  readonly maxLevel: PresentationLevel;
  /** Available if the user looks. */
  readonly passiveEligible: boolean;
  /** May be brought to the user unprompted. */
  readonly proactiveEligible: boolean;
  /** Why the ceiling landed where it did, most restrictive first (§42). */
  readonly reasons: readonly string[];
}

/** Minimum attention priority that opens the proactive path (§18, §20). */
export const MIN_PRIORITY_FOR_PROACTIVE: AttentionPriority = 'high';

/**
 * Decide the presentation ceiling.
 *
 * Pure and total. Every restriction is recorded in `reasons` even when a more
 * restrictive one already dominates, so the full picture is auditable rather
 * than only the binding constraint.
 */
export const decidePresentation = (
  inputs: PresentationInputs,
): PresentationDecision => {
  const reasons: string[] = [];
  let ceiling: PresentationLevel = 'l3';

  // ── Hard restrictions on ALL presentation ───────────────────────────────
  if (!inputs.allowPassivePresentation) {
    ceiling = lower(ceiling, 'l1');
    reasons.push(
      'A Directive forbids passive presentation, so this is stored only ' +
        '(Patch 5).',
    );
  }

  // ── Restrictions on PROACTIVE presentation only ─────────────────────────
  if (inputs.archived) {
    // §16.3 / §18 — archive suppresses Level 2 and Level 3 presentation while
    // keeping the item retrievable. The evidence is untouched.
    ceiling = lower(ceiling, 'l1');
    reasons.push(
      'Archived, so it is not proactively surfaced; it remains retrievable ' +
        'and its evidence is unchanged (§16.3).',
    );
  }

  if (inputs.suspended) {
    // §16.2 / §18 — the user paused this line. Suspension halts forward
    // progression and retains backend evidence without Level 2/3 presentation
    // (§16.1 keeps strong+disagrees+suspended valid).
    ceiling = lower(ceiling, 'l1');
    reasons.push(
      'Suspended at the user’s request, so it is not proactively ' +
        'surfaced; the evidence remains (§16.2).',
    );
  }

  if (!inputs.allowProactivePresentation) {
    ceiling = lower(ceiling, 'l2');
    reasons.push(
      'A Directive forbids proactive presentation; passive availability is ' +
        'unaffected (Patch 5).',
    );
  }

  if (inputs.attention.priority !== MIN_PRIORITY_FOR_PROACTIVE) {
    ceiling = lower(ceiling, 'l2');
    reasons.push(
      `Attention priority is \`${inputs.attention.priority}\`; proactive ` +
        `presentation requires \`${MIN_PRIORITY_FOR_PROACTIVE}\` (§18, §20).`,
    );
  }

  // Ceilings from the attention layer are restated here so one audit trail
  // explains the outcome without the caller having to consult both modules.
  for (const c of inputs.attention.ceilings) {
    reasons.push(`Attention ceiling — ${c.reason}`);
  }

  // ── L3 default-off has the last word (§40.5) ────────────────────────────
  const l3Enabled = inputs.l3Enabled ?? L3_ENABLED_BY_DEFAULT;

  if (!l3Enabled) {
    ceiling = lower(ceiling, 'l2');
    reasons.push(
      'Proactive presentation (Level 3) is disabled by default for MVP ' +
        '(§18, §40.5).',
    );
  }

  return {
    maxLevel: ceiling,
    passiveEligible: rank(ceiling) >= rank('l2'),
    proactiveEligible: ceiling === 'l3',
    reasons,
  };
};

/**
 * §20 — the Observer is an Attention Mediator: bring something back, provide
 * support, exit.
 *
 * Executable statement that nothing in this module optimises for repeat
 * engagement: there is no streak, no re-engagement counter, no escalation on
 * being ignored, and no field that grows when the user does not respond.
 */
export const OPTIMISES_FOR_DEPENDENCE = false as const;
