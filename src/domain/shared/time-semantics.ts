/**
 * Time Semantics (ENGINEERING_CONTRACT §5, §5.1, INV-07, INV-08).
 *
 * Time must preserve WHAT KIND of time is actually known. The system MUST NOT
 * upgrade one time semantic into another. An observation_time is not an
 * event_time; a user_reported_interval is not continuous system observation.
 */

import type { TimeSemantic } from './enums';
import { type Result, err, ok } from './result';

/**
 * A point-in-time assertion, tagged with the kind of time it represents.
 */
export interface TimePoint {
  readonly semantic: Exclude<TimeSemantic, 'user_reported_interval'>;
  readonly at: Date;
}

/**
 * An interval the USER reported. Not a system observation, and not
 * decomposable into synthetic observed events (ENGINEERING_CONTRACT §12).
 */
export interface ReportedInterval {
  readonly semantic: 'user_reported_interval';
  readonly from: Date | null;
  readonly to: Date | null;
  /** Preserved user wording of the interval, e.g. "这半年". */
  readonly reportedAs: string;
}

export type TimeAssertion = TimePoint | ReportedInterval;

export const isReportedInterval = (t: TimeAssertion): t is ReportedInterval =>
  t.semantic === 'user_reported_interval';

export type TimeSemanticError =
  | { readonly kind: 'semantic_upgrade_forbidden'; readonly from: TimeSemantic; readonly to: TimeSemantic }
  | { readonly kind: 'interval_not_decomposable'; readonly reportedAs: string };

/**
 * Reinterpreting one time semantic as another is forbidden unless it is a
 * no-op. There is no "promotion" ladder: observation_time never becomes
 * event_time, capture_time never becomes observation_time, and a reported
 * interval never becomes a set of observed points.
 *
 * Deterministic code owns this rule (ENGINEERING_CONTRACT §31).
 */
export const reinterpretSemantic = (
  from: TimeSemantic,
  to: TimeSemantic,
): Result<TimeSemantic, TimeSemanticError> =>
  from === to
    ? ok(to)
    : err({ kind: 'semantic_upgrade_forbidden', from, to });

/**
 * A snapshot establishes only the observed state at its observation point
 * (ENGINEERING_CONTRACT §5.1). Asking for an exact transition time from
 * snapshots alone must fail.
 */
export const exactTransitionTimeFromSnapshots = (
  snapshots: readonly TimePoint[],
): Result<never, TimeSemanticError> => {
  void snapshots;
  return err({
    kind: 'semantic_upgrade_forbidden',
    from: 'observation_time',
    to: 'event_time',
  });
};
