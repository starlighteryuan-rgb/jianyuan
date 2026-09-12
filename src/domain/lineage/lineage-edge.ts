/**
 * LineageEdge (ENGINEERING_CONTRACT §6; docs/architecture.md §4).
 *
 * Lineage explains *how* records relate. It is a SEPARATE concern from
 * evidence independence, which `evidenceUnitId` owns. Keeping these apart is
 * the explicit instruction of docs/architecture.md §4 ("Lineage 与 evidence
 * independence 是两个不同概念") and is what lets no-double-counting checks
 * avoid full transitive graph traversal.
 *
 * A LineageEdge therefore carries NO evidence verdict of any kind.
 */

import type { LineageEdgeId, RecordId } from '../shared/ids';
import type { LineageRelation } from '../shared/enums';

export interface LineageEdge {
  readonly id: LineageEdgeId;
  readonly childId: RecordId;
  readonly parentId: RecordId;
  readonly relationToParent: LineageRelation;
  readonly createdAt: Date;
}

/**
 * Direct parents of a record. Deliberately one hop: transitive closure is not
 * needed for MVP no-double-counting, because independence is keyed on
 * `evidenceUnitId` (docs/architecture.md §4, Patch 2).
 */
export const directParents = (
  edges: readonly LineageEdge[],
  child: RecordId,
): readonly LineageEdge[] => edges.filter((e) => e.childId === child);

/**
 * Guard against self-referencing lineage, which would let a record act as its
 * own ancestor and defeat lineage-integrity reasoning (Gate 5, §8).
 */
export const isSelfReferencing = (edge: LineageEdge): boolean =>
  edge.childId === edge.parentId;
