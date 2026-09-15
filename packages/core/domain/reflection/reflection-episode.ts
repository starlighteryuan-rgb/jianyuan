/**
 * ReflectionEpisode (ENGINEERING_CONTRACT §22, §23; docs/architecture.md §4,
 * Patch 4).
 *
 * This entity describes ONLY HOW a reflection was elicited. It says nothing
 * about what the user concluded.
 *
 * `meaningCommitment` is DELIBERATELY ABSENT from this interface. It lives on
 * `UserReflectionRecord` and nowhere else, so that no field here can be
 * mistaken for a meaning commitment (Patch 4, INV-18 "the user owns personal
 * meaning"). Adding it back would recreate exactly the leak Patch 4 closed.
 *
 * `elicitationMode` and `stimulusType` are ORTHOGONAL (§22): spontaneity and
 * stimulus are independent axes, and neither implies certainty (§24, INV-13).
 */

import type {
  ElicitationMode,
  StimulusType,
} from '../shared/enums';
import type { ReflectionEpisodeId } from '../shared/ids';

export interface ReflectionEpisode {
  readonly id: ReflectionEpisodeId;

  readonly elicitationMode: ElicitationMode;
  readonly stimulusType: StimulusType;

  /**
   * §23 — count of AI-initiated follow-ups AFTER the initial stimulus.
   * The initial stimulus does not count. User-initiated continuation does not
   * count as an automatic follow-up.
   */
  readonly systemFollowupCount: number;

  /** What the episode was elicited from, when there was a stimulus object. */
  readonly stimulusRef: string | null;

  /** What the episode is about. */
  readonly targetRef: string | null;

  readonly occurredAt: Date;
}

/** §23 default rule: at most one automatic system follow-up. */
export const MAX_AUTOMATIC_FOLLOWUPS = 1;

/**
 * §23 — Prompt Contamination susceptibility.
 *
 * When `systemFollowupCount > 1` without active user continuation, the
 * resulting response may still be stored as historical user expression, but it
 * MUST NOT automatically strengthen hypothesis evidence (INV-03, §37).
 *
 * This predicate is descriptive only. It is a flag for later evidence
 * eligibility, not a deletion or rewrite of the episode.
 */
export const isPromptContaminationSusceptible = (
  e: Pick<ReflectionEpisode, 'systemFollowupCount'>,
  userActivelyContinued: boolean,
): boolean =>
  e.systemFollowupCount > MAX_AUTOMATIC_FOLLOWUPS && !userActivelyContinued;

/**
 * §22 — do NOT fabricate provenance when it is unknown; use `unknown`.
 * Exposed as an explicit constructor so "unknown" is a first-class choice
 * rather than something a caller has to remember not to guess at.
 */
export const unknownProvenance = (): Pick<
  ReflectionEpisode,
  'elicitationMode' | 'stimulusType'
> => ({ elicitationMode: 'unknown', stimulusType: 'unknown' });
