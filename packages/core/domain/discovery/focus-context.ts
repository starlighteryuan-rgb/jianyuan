/**
 * CurrentFocusContext (ENGINEERING_CONTRACT §19, §18, §12).
 *
 * §19 requires this be lightweight and:
 *
 *   traceable · removable · overrideable · temporary · non-personality-based
 *
 * Each is structural below, not aspirational:
 *
 *   TRACEABLE  — every context carries a `source` naming where the focus came
 *                from. Nothing is inferred from nowhere.
 *   REMOVABLE  — `endedAt` ends a context without deleting it, and ending one
 *                never touches a Record (§19: expiry does NOT delete
 *                historical records).
 *   OVERRIDEABLE — a later context for the same subject supersedes an earlier
 *                one; the user's explicit statement always wins.
 *   TEMPORARY  — relevance decays. `deriveLifecycle` is a function of elapsed
 *                time, so a context cannot silently remain "current" forever.
 *   NON-PERSONALITY-BASED — the type carries no trait, no disposition, no
 *                inference about the person. Only what is currently in focus.
 *
 * THE ELASTIC-FADING RULE (§19):
 *
 *   > If the user provides an explicit duration, honor it.
 *   > Otherwise use elastic fading rather than fabricating a precise expiry.
 *
 * So `expiresAt` is set ONLY from a user-stated duration. With no such
 * statement it stays null and the lifecycle is derived from elapsed time since
 * `lastMentionedAt` — the system does not invent a precise moment the user's
 * focus ended, because it does not know one.
 */

import type { FocusContextId } from '../shared/ids';
import type { RelevanceState } from '../shared/enums';

/* ── Lifecycle (§19) ──────────────────────────────────────────────────── */

/**
 * §19's stated lifecycle: `active → fading → inactive`.
 *
 * Note this is NOT the same axis as `RelevanceState`: lifecycle describes the
 * context, while relevance is the signal a Discovery reads. `deriveRelevance`
 * maps one to the other, and the absence of any context maps to `unknown` —
 * which no lifecycle value does.
 */
export const FOCUS_LIFECYCLE_STATES = ['active', 'fading', 'inactive'] as const;

export type FocusLifecycleState = (typeof FOCUS_LIFECYCLE_STATES)[number];

/* ── Source (§19: traceable) ──────────────────────────────────────────── */

/**
 * Where the focus came from.
 *
 * The `source` schema shape is recorded in docs/architecture.md §13 as an
 * implementation-time decision rather than a contract question, so this is a
 * deliberate minimal choice: a kind plus a free-text reference.
 *
 * `user_stated` outranks `record_derived` when both exist for a subject —
 * §19's "overrideable", and consistent with the user owning their own meaning
 * (INV-18).
 */
export const FOCUS_SOURCE_KINDS = ['user_stated', 'record_derived'] as const;

export type FocusSourceKind = (typeof FOCUS_SOURCE_KINDS)[number];

export interface FocusSource {
  readonly kind: FocusSourceKind;
  /** What this focus is traceable to — a record, a capture, a user statement. */
  readonly ref: string;
}

/* ── Entity ───────────────────────────────────────────────────────────── */

export interface CurrentFocusContext {
  readonly id: FocusContextId;

  /** What is in focus — a claim, a hypothesis, a topic key. */
  readonly subjectRef: string;

  /** §19 traceability. */
  readonly source: FocusSource;

  /** When the subject was last raised. The basis for elastic fading. */
  readonly lastMentionedAt: Date;

  /**
   * Set ONLY from a user-stated duration (§19: "honor it"). Null means the user
   * stated no duration, and the system must NOT fabricate one.
   */
  readonly expiresAt: Date | null;

  /** Ends the context without deleting it (§19: removable). */
  readonly endedAt: Date | null;

  readonly createdAt: Date;
}

/* ── Elastic fading ───────────────────────────────────────────────────── */

/**
 * MVP IMPLEMENTATION RULE — elastic fading thresholds.
 *
 * Mine, not the contract's. §19 requires elastic fading and forbids fabricating
 * a precise expiry, but names no interval. These two thresholds are the smallest
 * conservative choice that makes "temporary" real:
 *
 *   within 7 days of last mention   → active
 *   7 to 30 days                    → fading
 *   beyond 30 days                  → inactive
 *
 * They are thresholds on a DERIVED state, not a stored expiry: nothing is
 * written at day 7, and no record changes at day 30. Recomputation from
 * `lastMentionedAt` is the whole mechanism, which is what keeps it "elastic" —
 * a later mention moves the whole curve rather than resetting a timer.
 */
export const FADE_AFTER_DAYS = 7;
export const INACTIVE_AFTER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

const daysBetween = (from: Date, to: Date): number =>
  (to.getTime() - from.getTime()) / DAY_MS;

/**
 * Derive the lifecycle state at a given moment.
 *
 * Ended and explicitly-expired contexts are `inactive` outright. An explicit
 * duration is honored precisely and does NOT pass through `fading`: the user
 * named an end, so the system does not invent a decay curve around it.
 */
export const deriveLifecycle = (
  context: CurrentFocusContext,
  now: Date,
): FocusLifecycleState => {
  if (context.endedAt !== null && context.endedAt <= now) return 'inactive';

  if (context.expiresAt !== null) {
    // §19: honor the stated duration. Active until it elapses, then inactive.
    return context.expiresAt > now ? 'active' : 'inactive';
  }

  // Elastic fading from last mention (§19).
  const elapsed = daysBetween(context.lastMentionedAt, now);

  if (elapsed < FADE_AFTER_DAYS) return 'active';
  if (elapsed < INACTIVE_AFTER_DAYS) return 'fading';
  return 'inactive';
};

/* ── Relevance derivation (§18, §19) ──────────────────────────────────── */

/**
 * Map a lifecycle state onto the Attention relevance signal.
 *
 * `inactive` becomes `low`, NOT `unknown`: an expired context is knowledge that
 * relevance has decayed, which is a different claim from having no information.
 * Only the absence of any context yields `unknown` (see `deriveRelevance`).
 *
 * §19: "Expiry reduces current relevance. It does NOT delete historical
 * records." This function is the whole of that reduction — it returns a signal
 * value and touches nothing.
 */
export const relevanceFromLifecycle = (
  state: FocusLifecycleState,
): RelevanceState => {
  switch (state) {
    case 'active':
      return 'high';
    case 'fading':
      return 'medium';
    case 'inactive':
      return 'low';
  }
};

/**
 * Current relevance for a subject, given whatever contexts exist for it.
 *
 * Returns `unknown` when NO context applies — §18 distinguishes unknown from
 * low, and defaulting to `low` here would quietly assert decayed relevance the
 * system never observed.
 *
 * When several contexts apply, a `user_stated` one wins (§19: overrideable);
 * otherwise the most recently mentioned wins. Ties favour the higher relevance,
 * since suppressing a subject the user just raised would be the worse error.
 */
export const deriveRelevance = (
  contexts: readonly CurrentFocusContext[],
  subjectRef: string,
  now: Date,
): RelevanceState => {
  const applicable = contexts.filter((c) => c.subjectRef === subjectRef);

  if (applicable.length === 0) return 'unknown';

  const stated = applicable.filter((c) => c.source.kind === 'user_stated');
  const pool = stated.length > 0 ? stated : applicable;

  const ordered = [...pool].sort(
    (a, b) => b.lastMentionedAt.getTime() - a.lastMentionedAt.getTime(),
  );

  const newest = ordered[0];
  if (newest === undefined) return 'unknown';

  const sameMoment = ordered.filter(
    (c) => c.lastMentionedAt.getTime() === newest.lastMentionedAt.getTime(),
  );

  const RANK: readonly RelevanceState[] = ['unknown', 'low', 'medium', 'high'];

  return sameMoment
    .map((c) => relevanceFromLifecycle(deriveLifecycle(c, now)))
    .reduce((best, candidate) =>
      RANK.indexOf(candidate) > RANK.indexOf(best) ? candidate : best,
    );
};

/* ── Mutations (§19: removable, overrideable) ─────────────────────────── */

/**
 * End a context without deleting it.
 *
 * Returns a new object; the caller persists it. §19: this reduces current
 * relevance and does not delete historical records — and indeed this function
 * has no access to any Record.
 */
export const endContext = (
  context: CurrentFocusContext,
  at: Date,
): CurrentFocusContext => ({ ...context, endedAt: at });

/**
 * Re-mention a subject, moving the fading curve.
 *
 * Deliberately does NOT clear `expiresAt`: if the user stated a duration, a
 * passing mention does not silently extend it past what they said. Overriding a
 * stated duration requires a new stated duration.
 */
export const touchContext = (
  context: CurrentFocusContext,
  at: Date,
): CurrentFocusContext => ({ ...context, lastMentionedAt: at });

/**
 * §19 — non-personality-based.
 *
 * Executable statement that this module models what is currently in focus and
 * never a trait, disposition, or standing characteristic of the person.
 */
export const INFERS_PERSONALITY = false as const;
