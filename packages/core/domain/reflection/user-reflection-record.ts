/**
 * UserReflectionRecord (ENGINEERING_CONTRACT §24, §25, INV-12, INV-13, INV-18;
 * docs/architecture.md §4, Patch 3 + Patch 4).
 *
 * This is the SOLE owner of the meaning lifecycle:
 *   meaningCommitment | validAtTime | currentEffect | supersededByRef | supersededAt
 *
 * It is a distinct domain entity rather than a flattened `Record` (Patch 3),
 * while still sharing its underlying Record's provenance, raw expression, time
 * semantics, and evidenceUnitId via `recordId`.
 *
 * Meaning revision must NOT be expressed by abusing workflowState=suspended or
 * presentationState=archived (§25). Those live on StateAssignment and address a
 * different concern; this entity has its own supersession fields.
 */

import type { MeaningCommitment, MeaningEffect } from '../shared/enums';
import type {
  RecordId,
  UserReflectionRecordId,
} from '../shared/ids';
import type { TimeAssertion } from '../shared/time-semantics';

export interface UserReflectionRecord {
  readonly id: UserReflectionRecordId;

  /** Shares provenance, raw expression, time semantics, evidenceUnitId. */
  readonly recordId: RecordId;

  /**
   * §24 — spontaneity and certainty are ORTHOGONAL. A spontaneous statement
   * may still be `tentative` (INV-13). This field is never derived from the
   * episode's `elicitationMode`.
   */
  readonly meaningCommitment: MeaningCommitment;

  /** §25 — user meaning is time-indexed. */
  readonly validAtTime: TimeAssertion;
  readonly currentEffect: MeaningEffect;

  readonly supersededByRef: UserReflectionRecordId | null;
  readonly supersededAt: Date | null;

  /** Episode that elicited this, when known. */
  readonly episodeRef: string | null;

  readonly createdAt: Date;
}

/**
 * §25 — supersede an earlier meaning WITHOUT deleting it.
 *
 * The earlier record is retained and marked `superseded`, because it remains
 * historically true that the user held that interpretation at that time
 * (INV-12). This function returns the updated earlier record; it never returns
 * a deletion.
 */
export const supersede = (
  earlier: UserReflectionRecord,
  laterId: UserReflectionRecordId,
  at: Date,
): UserReflectionRecord => ({
  ...earlier,
  currentEffect: 'superseded',
  supersededByRef: laterId,
  supersededAt: at,
});

export const isCurrent = (r: Pick<UserReflectionRecord, 'currentEffect'>): boolean =>
  r.currentEffect === 'current';

/**
 * §24 — even a `confirmed` meaning remains USER-CONFIRMED MEANING, never an
 * objective personality fact (INV-18, §32 "the system MUST NOT auto-land
 * permanent personality labels as confirmed facts").
 *
 * There is intentionally no function in this module that promotes a
 * UserReflectionRecord into a trait, personality label, or factual claim.
 */
export const isUserConfirmedMeaning = (
  r: Pick<UserReflectionRecord, 'meaningCommitment'>,
): boolean => r.meaningCommitment === 'confirmed';
