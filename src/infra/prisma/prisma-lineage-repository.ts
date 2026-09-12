/**
 * Prisma-backed LineageRepository.
 *
 * `directParents` is one hop by design. Transitive closure is unnecessary for
 * MVP no-double-counting because independence is keyed on `evidenceUnitId`
 * (docs/architecture.md §4 Patch 2) — that is the whole point of promoting the
 * Evidence Unit to first class.
 *
 * Saving an edge is idempotent on (childId, parentId, relationToParent), which
 * the schema declares unique. Re-asserting the same lineage fact must not
 * create a second edge, since duplicated lineage is exactly what Gate 5 guards
 * against (ENGINEERING_CONTRACT §8, §6.1).
 */

import type { PrismaClient } from '../../../generated/prisma/client';

import type { LineageRepository } from '../../domain/ports/repositories';
import type { LineageEdge } from '../../domain/lineage/lineage-edge';
import { isSelfReferencing } from '../../domain/lineage/lineage-edge';
import type { RecordId } from '../../domain/shared/ids';
import { toDomainLineageEdge, toLineageEdgeRow } from './mappers';

export class PrismaLineageRepository implements LineageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async directParents(childId: RecordId): Promise<readonly LineageEdge[]> {
    const rows = await this.prisma.lineageEdge.findMany({
      where: { childId },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(toDomainLineageEdge);
  }

  async save(edge: LineageEdge): Promise<void> {
    if (isSelfReferencing(edge)) {
      // A record that is its own ancestor would defeat lineage-integrity
      // reasoning entirely (Gate 5).
      throw new Error(
        `Refusing self-referencing lineage edge on record ${edge.childId}.`,
      );
    }

    const row = toLineageEdgeRow(edge);

    await this.prisma.lineageEdge.upsert({
      where: {
        childId_parentId_relationToParent: {
          childId: row.childId,
          parentId: row.parentId,
          relationToParent: row.relationToParent,
        },
      },
      create: row,
      // The edge is its own assertion; there is nothing to mutate.
      update: {},
    });
  }
}
