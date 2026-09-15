/**
 * Target-scoped StateAssignment (ENGINEERING_CONTRACT §16, §16.1–16.3;
 * docs/architecture.md §4, Patch B).
 *
 * There is NO case-global state. State always attaches to a specific target.
 *
 * MVP target scope is FROZEN to exactly three types:
 *   relation_claim | hypothesis | discovery
 *
 * `reflection_episode` is deliberately absent from `StateTargetType`, so the
 * type system rejects it at every call site. A ReflectionEpisode records how a
 * reflection was elicited; it is not a target of user_position, suspension, or
 * archival.
 */

import type {
  PresentationState,
  StateTargetType,
  UserPosition,
  WorkflowState,
} from '../shared/enums';
import type { StateAssignmentId } from '../shared/ids';

export interface StateAssignment {
  readonly id: StateAssignmentId;
  readonly targetType: StateTargetType;
  readonly targetRef: string;

  /** User's stance. Never an input to evidence scoring (INV-04). */
  readonly userPosition: UserPosition;
  readonly workflowState: WorkflowState;
  readonly presentationState: PresentationState;

  readonly updatedAt: Date;
}

/**
 * §16.1 — user disagreement does not erase evidence.
 *
 * This combination is explicitly VALID and must never be normalized away:
 *   evidence_support_level = strong
 *   user_position          = disagrees
 *   workflow_state         = suspended
 *
 * There is intentionally no function here that maps `userPosition` onto any
 * evidence field. Evidence lives on RelationClaim and is untouchable from
 * this module (INV-04, docs/architecture.md §11 Patch 9).
 */

/** §16.3 — archive is an attention/presentation decision only. */
export const isArchived = (s: Pick<StateAssignment, 'presentationState'>): boolean =>
  s.presentationState === 'archived';

/** §16.2 — suspension stops active progression but preserves evidence. */
export const isSuspended = (s: Pick<StateAssignment, 'workflowState'>): boolean =>
  s.workflowState === 'suspended';

/**
 * Archive and suspend are ORTHOGONAL (ENGINEERING_CONTRACT §16.2 "do not
 * invent a separate Hold state", §16.3). Any of the four combinations is
 * representable; neither field is derived from the other.
 */
export const describesActivePresentation = (s: StateAssignment): boolean =>
  !isArchived(s) && !isSuspended(s);
