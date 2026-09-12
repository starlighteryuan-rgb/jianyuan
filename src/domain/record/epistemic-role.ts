/**
 * RecordEpistemicRole (docs/architecture.md §4, Patch 1).
 *
 * One Record → 0..N epistemic roles → exactly one Evidence Unit.
 *
 * The whole point of promoting roles to their own collection is that
 * reclassification must be cheap and lossless WITHOUT ever affecting evidence
 * independence (ENGINEERING_CONTRACT §4, INV-16).
 */

import type { EvidenceUnitId, RecordId } from '../shared/ids';
import type { EpistemicRole } from '../shared/enums';

export interface RecordEpistemicRoleAssignment {
  readonly recordId: RecordId;
  readonly role: EpistemicRole;
}

/** Role sets are sets: duplicates carry no meaning and are collapsed. */
export const normalizeRoles = (
  roles: readonly EpistemicRole[],
): readonly EpistemicRole[] => [...new Set(roles)];

export const hasRole = (
  roles: readonly EpistemicRole[],
  role: EpistemicRole,
): boolean => roles.includes(role);

/**
 * Adding a role NEVER changes the Evidence Unit.
 *
 * Expressed as a total function so the invariant is executable rather than a
 * comment: whatever roles you add, the returned unit is the one you passed in
 * (INV-16, ENGINEERING_CONTRACT §4 "multiple classifications of the same
 * source MUST NOT create multiple independent pieces of evidence").
 */
export const addRolePreservingEvidenceUnit = (
  current: {
    readonly roles: readonly EpistemicRole[];
    readonly evidenceUnitId: EvidenceUnitId;
  },
  role: EpistemicRole,
): {
  readonly roles: readonly EpistemicRole[];
  readonly evidenceUnitId: EvidenceUnitId;
} => ({
  roles: normalizeRoles([...current.roles, role]),
  evidenceUnitId: current.evidenceUnitId,
});
