/**
 * Discovery stable identity (docs/architecture.md §4, Patch 6 + Patch B).
 *
 * Discovery persists IDENTITY ONLY:
 *   { id, subjectRef, discoveryKind, stableKey }
 *
 * Deliberately absent:
 *   - attentionPriority / any of the five attention signals
 *   - presentationLevel
 *   - presentationState
 *
 * Attention Priority and Presentation Level are COMPUTED ON READ and never
 * stored as permanent fact (Patch 6). Evidence strength and attention are
 * separate concerns (ENGINEERING_CONTRACT §17, INV-09), and persisting a
 * priority would freeze a judgment the contract wants recomputed.
 *
 * `presentationState` / archive / restore bind to `Discovery.id` through a
 * target-scoped StateAssignment row (Patch B), not through a column here.
 */

import type { DiscoveryId } from '../shared/ids';
import type { DiscoveryKind, DiscoverySubjectType } from '../shared/enums';

export interface DiscoverySubjectRef {
  readonly type: DiscoverySubjectType;
  readonly id: string;
}

export interface Discovery {
  readonly id: DiscoveryId;
  readonly subjectRef: DiscoverySubjectRef;
  readonly discoveryKind: DiscoveryKind;

  /**
   * Deterministic recomputation key. Recomputing a Discovery over the same
   * subject must resolve to the SAME persisted `id`, so archive/restore
   * decisions survive recomputation instead of binding to a transient object.
   */
  readonly stableKey: string;

  readonly createdAt: Date;
}

/**
 * Derive the stable key from subject identity + kind.
 *
 * Deterministic and free of scores, timestamps, or ranking, so it cannot drift
 * when attention is recomputed.
 */
export const deriveStableKey = (
  subjectRef: DiscoverySubjectRef,
  discoveryKind: DiscoveryKind,
): string => `${discoveryKind}:${subjectRef.type}:${subjectRef.id}`;

export const hasStableIdentity = (
  d: Pick<Discovery, 'stableKey' | 'subjectRef' | 'discoveryKind'>,
): boolean => d.stableKey === deriveStableKey(d.subjectRef, d.discoveryKind);
