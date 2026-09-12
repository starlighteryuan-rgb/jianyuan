import type { PrismaClient } from '../../../generated/prisma/client';
import type { IngestionCommitRepository } from '../../domain/ports/repositories';
import type { IngestionPlan } from '../../domain/ingestion/ingest-record';
import { epistemicRoleToDb, toLineageEdgeRow, toRecordRow } from './mappers';

/** Persists one Ingestion plan through a single Prisma transaction. */
export class PrismaIngestionCommitRepository implements IngestionCommitRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async commit(plan: IngestionPlan): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (plan.kind === 'create') {
        const row = toRecordRow(plan.record);
        await tx.evidenceUnit.upsert({
          where: { id: row.evidenceUnitId },
          create: {
            id: row.evidenceUnitId,
            ...(plan.evidenceUnitDeterminationReason === null
              ? {}
              : { mintedFromParentReason: plan.evidenceUnitDeterminationReason }),
          },
          update: {},
        });
        await tx.record.upsert({
          where: { id: row.id },
          create: row,
          update: {},
        });
      }

      const recordId = plan.kind === 'create' ? plan.record.id : plan.recordId;
      for (const role of plan.rolesToAdd) {
        const dbRole = epistemicRoleToDb(role);
        await tx.recordEpistemicRole.upsert({
          where: { recordId_role: { recordId, role: dbRole } },
          create: { recordId, role: dbRole },
          update: {},
        });
      }

      if (plan.lineageEdge !== null) {
        const row = toLineageEdgeRow({
          ...plan.lineageEdge,
          createdAt: plan.kind === 'create' ? plan.record.createdAt : new Date(),
        });
        await tx.lineageEdge.upsert({
          where: {
            childId_parentId_relationToParent: {
              childId: row.childId,
              parentId: row.parentId,
              relationToParent: row.relationToParent,
            },
          },
          create: row,
          update: {},
        });
      }
    });
  }
}
