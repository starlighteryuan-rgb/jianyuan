/**
 * Prisma-backed RelationClaimRepository.
 *
 * The delicate obligation here is the Patch 8 coupling: a stored support level
 * must never exist without all six dimension scores AND their reasons. SQL
 * cannot express that declaratively across a parent and a child table, so this
 * adapter defends it twice:
 *
 *   - On WRITE, `hasAuditableEvidence` is checked and a violating claim is
 *     REFUSED. Persisting it would create an unaudited support level, which is
 *     exactly what Patch 8 exists to prevent.
 *   - On READ, `toDomainRelationClaim` re-validates and refuses to reconstruct
 *     a partial assessment rather than repairing it.
 *
 * Writes are transactional and use replace semantics for the child rows: an
 * assessment is one atomic judgment, so a re-score must not leave a mix of old
 * and new dimension rows behind.
 */

import type { PrismaClient } from '../../../generated/prisma/client';

import type { RelationClaimRepository } from '../../domain/ports/repositories';
import {
  hasAuditableEvidence,
  type StoredRelationClaim,
} from '../../domain/relation/relation-claim';
import type { EvidenceSupportLevel } from '../../domain/relation/evidence-dimensions';
import type { RecordId, RelationClaimId } from '../../domain/shared/ids';
import {
  supportLevelToDb,
  toDomainRelationClaim,
  toRelationClaimDimensionRows,
  toRelationClaimRow,
} from './mappers';

export class PrismaRelationClaimRepository implements RelationClaimRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async hydrate(id: string): Promise<StoredRelationClaim | null> {
    const row = await this.prisma.relationClaim.findUnique({
      where: { id },
      include: {
        recordRefs: { select: { recordId: true } },
        dimensionJudgments: true,
      },
    });

    if (row === null) return null;

    const mapped = toDomainRelationClaim(row, row.dimensionJudgments);

    if (!mapped.ok) {
      // An inconsistent stored claim is a defect to surface, not a domain-level
      // absence. Returning null would read as "no such claim".
      throw new Error(
        `Inconsistent stored RelationClaim ${id}: ${mapped.error.detail}`,
      );
    }

    // `toDomainRelationClaim` cannot see the join rows, so refs are attached
    // here where they are available.
    return {
      ...mapped.value,
      recordRefs: row.recordRefs.map((r) => r.recordId as RecordId),
    };
  }

  async findById(id: RelationClaimId): Promise<StoredRelationClaim | null> {
    return this.hydrate(id);
  }

  async findByRecordRef(
    recordId: RecordId,
  ): Promise<readonly StoredRelationClaim[]> {
    const joins = await this.prisma.relationClaimRecord.findMany({
      where: { recordId },
      select: { claimId: true },
    });

    const claims: StoredRelationClaim[] = [];
    for (const join of joins) {
      const claim = await this.hydrate(join.claimId);
      if (claim !== null) claims.push(claim);
    }

    return claims;
  }

  async listBySupportLevel(
    level: EvidenceSupportLevel,
  ): Promise<readonly StoredRelationClaim[]> {
    // A claim with no assessment has supportLevel NULL and is therefore matched
    // by no level query — an unscored claim must never be mistaken for a weakly
    // supported one (arch §11 Patch 9).
    const rows = await this.prisma.relationClaim.findMany({
      where: { supportLevel: supportLevelToDb(level) },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    const claims: StoredRelationClaim[] = [];
    for (const row of rows) {
      const claim = await this.hydrate(row.id);
      if (claim !== null) claims.push(claim);
    }

    return claims;
  }

  async save(claim: StoredRelationClaim): Promise<void> {
    if (!hasAuditableEvidence(claim)) {
      throw new Error(
        `Refusing to persist RelationClaim ${claim.id}: a support level ` +
          'requires all six dimension scores with reasons (Patch 8).',
      );
    }

    const row = toRelationClaimRow(claim);
    const dimensionRows = toRelationClaimDimensionRows(claim);

    await this.prisma.$transaction(async (tx) => {
      await tx.relationClaim.upsert({
        where: { id: row.id },
        create: row,
        update: {
          axisQuestion: row.axisQuestion,
          axisDimension: row.axisDimension,
          relationType: row.relationType,
          evidenceSummary: row.evidenceSummary,
          assertsTemporalOrdering: row.assertsTemporalOrdering,
          numericScore: row.numericScore,
          supportLevel: row.supportLevel,
        },
      });

      // Replace semantics: an assessment is one atomic judgment, so a re-score
      // must not leave stale dimension rows alongside fresh ones.
      await tx.relationClaimDimension.deleteMany({ where: { claimId: row.id } });
      if (dimensionRows.length > 0) {
        await tx.relationClaimDimension.createMany({
          data: dimensionRows.map((d) => ({ claimId: row.id, ...d })),
        });
      }

      await tx.relationClaimRecord.deleteMany({ where: { claimId: row.id } });
      if (claim.recordRefs.length > 0) {
        await tx.relationClaimRecord.createMany({
          data: claim.recordRefs.map((recordId) => ({
            claimId: row.id,
            recordId,
          })),
        });
      }
    });
  }
}
