/**
 * Reflection response routing (ENGINEERING_CONTRACT §15, §16, §21, §23;
 * docs/architecture.md §6 Patch 7).
 *
 * THIS MODULE ANSWERS ONE QUESTION: when the user reacts to something the
 * system presented, what may be created?
 *
 * It is the single place where the four layers are held apart:
 *
 *   EVIDENCE       — the descriptive Relation's support. Changed ONLY by a new
 *                    independent Record. Nothing here writes it.
 *   HYPOTHESIS     — a possible explanation. Changed ONLY by admission gates.
 *                    Nothing here writes it.
 *   USER POSITION  — the user's stance. Lives on StateAssignment. Never touches
 *                    evidence (§15, §36).
 *   NEW RECORD     — the user's own new content. Enters via ingestion and is
 *                    then subject to the same rules as any other Record.
 *
 * THE ROUTING RULE, stated once:
 *
 *   Only FREE TEXT becomes a Record. Button presses never do.
 *
 * §21 is explicit that "I'd like to say something" is an ACTION rather than an
 * epistemic stance, and that "leave it for now" is a workflow/presentation
 * action rather than a factual judgment. So a click carries no factual content
 * to capture, and manufacturing a Record from one would fabricate user content
 * the user never wrote.
 *
 * §15 is the reason this matters: user agreement is not automatically evidence.
 * If a click became a Record, and that Record became directional support, then
 * "对。" would silently raise evidence support — exactly the epistemic leak §15
 * forbids. The defence is structural: clicks produce no Record at all.
 */

import {
  MAX_AUTOMATIC_FOLLOWUPS,
  isPromptContaminationSusceptible,
} from './reflection-episode';
import type {
  MeaningCommitment,
  ReflectionResponse,
  UserPosition,
} from '../shared/enums';

/* ── What the user did ────────────────────────────────────────────────── */

/**
 * The user's reaction to a presented item.
 *
 * `response` is the frozen four-value reflection vocabulary. `freeText` is the
 * ONLY field that can produce a Record, and it is null unless the user actually
 * wrote something.
 *
 * `leaveForNow` is separate from `response` on purpose: §21 classifies it as a
 * workflow action, not a stance. Folding it into the response enum would make
 * deferral look like a judgment about the content.
 */
export interface ReflectionFeedback {
  /** The stance the user expressed, if any. */
  readonly response: ReflectionResponse | null;

  /**
   * Text the user wrote in their own words. Null when they only pressed
   * buttons. Whitespace-only text counts as nothing written.
   */
  readonly freeText: string | null;

  /** §21 — a workflow action ("leave it for now"), not a factual judgment. */
  readonly leaveForNow: boolean;

  /**
   * True when the user continued the conversation of their own accord.
   *
   * §23 needs this to distinguish a user-driven exchange from system-driven
   * follow-ups: only the latter risks prompt contamination.
   */
  readonly userInitiatedContinuation: boolean;
}

/* ── Projection onto the frozen state vocabulary (§16) ────────────────── */

/**
 * Project a reflection response onto §16's frozen `user_position`.
 *
 * §16 freezes `user_position` to `none | agrees | disagrees | uncertain`.
 * Widening it would be a contract change, so the richer reflection vocabulary
 * is projected here — LOSSILY, EXPLICITLY, AND IN EXACTLY ONE PLACE.
 *
 * The lossy step is `questioned → uncertain`. Questioning and being unsure are
 * different acts: one engages, the other withholds. §16 has no value for
 * "engaged but not settled", and inventing one would modify the contract. The
 * distinction is preserved on the ReflectionEpisode, which keeps the original
 * response, so nothing is destroyed — only the projection is coarse.
 */
export const toUserPosition = (
  response: ReflectionResponse | null,
): UserPosition => {
  if (response === null) return 'none';

  switch (response) {
    case 'accepted':
      return 'agrees';
    case 'rejected':
      return 'disagrees';
    case 'questioned':
    case 'uncertain':
      return 'uncertain';
  }
};

/* ── The routing decision ─────────────────────────────────────────────── */

/**
 * What the system may create in response to this feedback.
 *
 * Note the shape: `record` is either present with content, or absent. There is
 * no "create an empty Record" branch, because there is no such thing as a
 * Record of a click.
 */
export interface RoutingDecision {
  /**
   * Text to ingest as a new Record, or null if nothing should be captured.
   *
   * When non-null the caller ingests it through the normal Phase 2 path, so it
   * receives provenance, time semantics, a source fingerprint, and an
   * evidence-unit determination like any other Record.
   */
  readonly captureText: string | null;

  /** The position to record on StateAssignment. Always decided. */
  readonly userPosition: UserPosition;

  /** §21 — the user deferred; a workflow action, not a judgment. */
  readonly deferred: boolean;

  /**
   * Whether a UserReflectionRecord should be created.
   *
   * True exactly when `captureText` is non-null: a UserReflectionRecord wraps a
   * Record, so there is nothing to wrap without captured content.
   */
  readonly createsReflectionRecord: boolean;

  /**
   * Meaning commitment for any created UserReflectionRecord.
   *
   * ALWAYS `tentative` in MVP. `confirmed` is frozen out of MVP by user
   * decision, and §24 warns that spontaneity is not certainty — a user writing
   * freely has not thereby committed to an interpretation. Raising commitment
   * would require an explicit act the MVP does not offer.
   */
  readonly meaningCommitment: MeaningCommitment;

  /** Why this decision was reached, for audit (§42). */
  readonly reasons: readonly string[];
}

/** Text that is present but only whitespace is not content. */
const meaningfulText = (text: string | null): string | null => {
  if (text === null) return null;
  const trimmed = text.trim();
  return trimmed.length === 0 ? null : trimmed;
};

/**
 * Route one piece of feedback.
 *
 * Pure and total. Every branch is decided here; the application layer executes
 * without re-deciding anything.
 */
export const routeFeedback = (
  feedback: ReflectionFeedback,
): RoutingDecision => {
  const reasons: string[] = [];
  const captureText = meaningfulText(feedback.freeText);

  if (captureText === null) {
    reasons.push(
      'No free text was written, so nothing is captured. A button press ' +
        'carries no factual content and must not become a Record (§21).',
    );
  } else {
    reasons.push(
      'The user wrote in their own words, so the text is ingested as a new ' +
        'Record and wrapped in a UserReflectionRecord (§21, §22).',
    );
    reasons.push(
      'Creating this Record does NOT by itself grant a new evidence_unit_id ' +
        'or independent-support status; eligibility is evaluated separately ' +
        '(Patch 7, §15).',
    );
  }

  if (feedback.response !== null) {
    reasons.push(
      `Response \`${feedback.response}\` is recorded as user position ` +
        `\`${toUserPosition(feedback.response)}\`, which never alters evidence ` +
        '(§15, §36).',
    );
  }

  if (feedback.leaveForNow) {
    reasons.push(
      'The user deferred. §21 classifies this as a workflow/presentation ' +
        'action, not a factual judgment about the content.',
    );
  }

  return {
    captureText,
    userPosition: toUserPosition(feedback.response),
    deferred: feedback.leaveForNow,
    createsReflectionRecord: captureText !== null,
    // Frozen for MVP: `confirmed` is not an MVP state.
    meaningCommitment: 'tentative',
    reasons,
  };
};

/* ── §23 prompt contamination ─────────────────────────────────────────── */

/**
 * §23 — the frozen cap on automatic follow-ups.
 *
 *   > Default: at most ONE system follow-up unless the user actively continues.
 *
 * Deliberately RE-EXPORTED from `reflection-episode` rather than redeclared.
 * The cap is a contract limit, and a second declaration could drift from the
 * first — the same divergence risk that made Phase 4's H6 reuse the
 * Relation-stage judgment shape instead of building a parallel mechanism.
 *
 * The user's freeze confirms the cap: no chat loop.
 */
export { MAX_AUTOMATIC_FOLLOWUPS };

/**
 * May the system ask another follow-up?
 *
 * Permitted only when the cap has not been reached, OR the user is actively
 * continuing. A user-driven exchange is not a system-driven interrogation, and
 * §23 restricts only the latter.
 */
export const mayFollowUp = (input: {
  readonly systemFollowupCount: number;
  readonly userInitiatedContinuation: boolean;
}): boolean =>
  input.userInitiatedContinuation ||
  input.systemFollowupCount < MAX_AUTOMATIC_FOLLOWUPS;

/**
 * Is a response prompt-shaped rather than freely offered?
 *
 * §23: awareness shaped by repeated system prompting is NOT equivalent to
 * spontaneous awareness. When the system has pushed past its follow-up budget
 * without the user driving, the resulting expression is still stored as genuine
 * user history — but it must not strengthen hypothesis evidence.
 *
 * DELEGATES to `isPromptContaminationSusceptible`, which already owns this rule
 * (Phase 1). This wrapper exists only to offer the single-object signature the
 * rest of this module uses; it adds no logic of its own, so the two can never
 * disagree.
 *
 * Note the judgment is about ELICITATION, never about sincerity. The user's
 * words are not doubted; only their evidentiary independence is.
 */
export const isPromptShaped = (input: {
  readonly systemFollowupCount: number;
  readonly userInitiatedContinuation: boolean;
}): boolean =>
  isPromptContaminationSusceptible(
    { systemFollowupCount: input.systemFollowupCount },
    input.userInitiatedContinuation,
  );

/**
 * §15 / §36 — nothing in this module writes an evidence field.
 *
 * Executable statement of the invariant. `RoutingDecision` carries no support
 * level, no score, and no hypothesis reference, so there is no field through
 * which a response could reach the evidence layer.
 */
export const ROUTING_TOUCHES_EVIDENCE = false as const;
