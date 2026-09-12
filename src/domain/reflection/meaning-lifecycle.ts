/**
 * Meaning lifecycle (ENGINEERING_CONTRACT §24, §25; INV-18).
 *
 * §25 governs what happens when the user's understanding changes:
 *
 *   > A later meaning supersedes an earlier one.
 *   > The earlier meaning is RETAINED: historically, the user did understand it
 *     that way.
 *   > Revising a meaning must NOT set workflow_state = suspended or
 *     presentation_state = archived.
 *
 * That last clause is the load-bearing one, and the reason this module exists
 * rather than the transition being inlined. Changing one's mind is not the same
 * act as suspending a line of analysis or archiving an item, and conflating them
 * would let a revision silently suppress content the user never asked to hide.
 * `planRevision` therefore returns NO state changes at all — the type has no
 * field for them.
 *
 * The supersede mechanics themselves live on the entity (`supersede` in
 * user-reflection-record.ts, Phase 1). This module owns the PAIR operation and
 * the forbidden-side-effect boundary; it does not reimplement supersession.
 */

import {
  type UserReflectionRecord,
  supersede,
} from './user-reflection-record';
import type { MeaningCommitment } from '../shared/enums';
import type { RecordId, UserReflectionRecordId } from '../shared/ids';
import type { TimeAssertion } from '../shared/time-semantics';

/**
 * The result of revising a meaning.
 *
 * Deliberately absent: `workflowState`, `presentationState`, `archived`,
 * `suspended`. §25 forbids a revision setting them, and their absence from this
 * type means a caller cannot apply them from a revision even by mistake.
 */
export interface MeaningRevision {
  /** The new current meaning. */
  readonly current: UserReflectionRecord;
  /** The prior meaning, retained with `currentEffect = 'superseded'`. */
  readonly superseded: UserReflectionRecord;
  readonly reasons: readonly string[];
}

/**
 * Create a new meaning that supersedes an earlier one.
 *
 * Both records are returned; the caller persists both. The earlier is never
 * deleted or mutated in place — §25 requires it be retained, because the user
 * genuinely did understand it that way at the time.
 */
export const planRevision = (input: {
  readonly earlier: UserReflectionRecord;
  readonly laterId: UserReflectionRecordId;
  readonly laterRecordId: RecordId;
  readonly validAtTime: TimeAssertion;
  /**
   * The episode the revision arose in, or null when it was not elicited through
   * one. Required rather than optional: §22 makes provenance load-bearing, so a
   * caller must state whether it knows the origin instead of silently omitting
   * it.
   */
  readonly episodeRef: string | null;
  readonly at: Date;
}): MeaningRevision => {
  const current: UserReflectionRecord = {
    id: input.laterId,
    recordId: input.laterRecordId,
    // Frozen for MVP: `confirmed` is not an MVP state, so a revision is as
    // tentative as the meaning it replaces. §24 also warns that changing one's
    // mind is not evidence of greater certainty.
    meaningCommitment: 'tentative',
    validAtTime: input.validAtTime,
    currentEffect: 'current',
    supersededByRef: null,
    supersededAt: null,
    episodeRef: input.episodeRef,
    createdAt: input.at,
  };

  return {
    current,
    superseded: supersede(input.earlier, input.laterId, input.at),
    reasons: [
      'The later meaning becomes current; the earlier is retained as ' +
        'superseded, because the user did historically understand it that ' +
        'way (§25).',
      'No workflow or presentation state changes: revising a meaning is not ' +
        'suspending or archiving (§25).',
    ],
  };
};

/**
 * The meaning in force at a given moment.
 *
 * §25 makes user meaning TIME-INDEXED, so "what does the user think?" is only
 * answerable relative to a time. Returns the newest record created at or before
 * `at`, or null when the user had not yet expressed a meaning.
 *
 * Note this reads `createdAt` (when the meaning was expressed) rather than
 * `validAtTime` (the period the meaning is ABOUT). The two differ: a user may
 * today revise their understanding of last year. Asking which meaning was in
 * force is a question about expression order.
 */
export const meaningInForceAt = (
  history: readonly UserReflectionRecord[],
  at: Date,
): UserReflectionRecord | null => {
  const eligible = history.filter((r) => r.createdAt.getTime() <= at.getTime());

  if (eligible.length === 0) return null;

  const ordered = [...eligible].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  return ordered[0] ?? null;
};

/**
 * Whether a meaning may be treated as the user's settled position.
 *
 * ALWAYS false in MVP: `confirmed` is frozen out, so every meaning is
 * `tentative`. Kept as a named function rather than an inline comparison so the
 * single place this would change is explicit if `confirmed` is ever enabled.
 *
 * INV-18: only the user may raise this, and MVP offers no act that does.
 */
export const isSettled = (commitment: MeaningCommitment): boolean =>
  commitment === 'confirmed';

/**
 * §25 — a revision never suppresses content.
 *
 * Executable statement of the prohibition. `MeaningRevision` carries no
 * workflow or presentation field, so this cannot drift from the type.
 */
export const REVISION_CHANGES_PRESENTATION = false as const;
