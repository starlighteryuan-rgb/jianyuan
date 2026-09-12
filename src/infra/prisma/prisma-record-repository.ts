/**
 * Prisma-backed RecordRepository.
 *
 * Not exercised against a live database yet (PostgreSQL is unavailable in this
 * environment), so it is written to be verifiable by typecheck and by mapper
 * round-trip tests, with the DB-touching parts kept as thin as possible.
 *
 * Two details that are easy to get wrong and are handled explicitly:
 *
 *   1. `Record.evidenceUnitId` is a REQUIRED FK to `evidence_unit`. Saving a
 *      Record therefore has to ensure its Evidence Unit row exists first, in
 *      the SAME transaction — otherwise a legitimate save fails on a
 *      constraint, or worse, half-succeeds.
 *
 *   2. `countDistinctEvidenceUnits` pushes DISTINCT down to the database. It
 *      must never be implemented as "count rows", which is the exact confusion
 *      INV-16 and ENGINEERING_CONTRACT §10.2 warn about.
 *
 * A mapping failure here THROWS rather than returning null. A null would be
 * read as "no such record", but an inconsistent row means stored data violates
 * an invariant — that is a defect to surface, not a domain-level absence.
 */

import type { $Enums, PrismaClient } from '../../../generated/prisma/client';

import type { RecordRepository } from '../../domain/ports/repositories';
import type { PersonalRecord } from '../../domain/record/record';
import type {
  EvidenceUnitId,
  RecordId,
  SourceFingerprint,
} from '../../domain/shared/ids';
import { type RecordRow, toDomainRecord, toRecordRow } from './mappers';

/** Row shape plus the joined role rows, as selected below. */
interface RecordRowWithRoles extends RecordRow {
  readonly epistemicRoles: readonly { readonly role: $Enums.EpistemicRole }[];
}

export class PrismaRecordRepository implements RecordRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private hydrate(row: RecordRowWithRoles): PersonalRecord {
    const mapped = toDomainRecord(
      row,
      row.epistemicRoles.map((r) => r.role),
    );

    if (!mapped.ok) {
      throw new Error(
        `Inconsistent stored Record ${row.id}: ${mapped.error.detail}`,
      );
    }

    return mapped.value;
  }

  async findById(id: RecordId): Promise<PersonalRecord | null> {
    const row = await this.prisma.record.findUnique({
      where: { id },
      include: { epistemicRoles: { select: { role: true } } },
    });

    return row === null ? null : this.hydrate(row);
  }

  async findBySourceFingerprint(
    fingerprint: SourceFingerprint,
  ): Promise<PersonalRecord | null> {
    const row = await this.prisma.record.findUnique({
      where: { sourceFingerprint: fingerprint },
      include: { epistemicRoles: { select: { role: true } } },
    });

    return row === null ? null : this.hydrate(row);
  }

  async findByEvidenceUnit(
    unitId: EvidenceUnitId,
  ): Promise<readonly PersonalRecord[]> {
    const rows = await this.prisma.record.findMany({
      where: { evidenceUnitId: unitId },
      include: { epistemicRoles: { select: { role: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((row) => this.hydrate(row));
  }

  async countDistinctEvidenceUnits(ids: readonly RecordId[]): Promise<number> {
    if (ids.length === 0) return 0;

    // DISTINCT on evidenceUnitId, not a row count. Many Records legitimately
    // share one unit (summaries, reformats), and they must count once.
    const rows = await this.prisma.record.findMany({
      where: { id: { in: [...ids] } },
      select: { evidenceUnitId: true },
      distinct: ['evidenceUnitId'],
    });

    return rows.length;
  }

  async save(
    record: PersonalRecord,
    options?: { readonly evidenceUnitReason?: string },
  ): Promise<void> {
    const row = toRecordRow(record);
    const reason = options?.evidenceUnitReason;

    await this.prisma.$transaction(async (tx) => {
      // Ensure the Evidence Unit exists before the FK is needed. Idempotent:
      // re-saving a Record that shares a unit must not disturb the unit.
      await tx.evidenceUnit.upsert({
        where: { id: row.evidenceUnitId },
        create: {
          id: row.evidenceUnitId,
          ...(reason === undefined ? {} : { mintedFromParentReason: reason }),
        },
        update: {},
      });

      await tx.record.upsert({
        where: { id: row.id },
        create: row,
        update: {
          // sourceFingerprint and evidenceUnitId are identity and are
          // deliberately NOT updatable here: changing either would rewrite what
          // the Record *is*, and re-minting identity on update is precisely the
          // no-double-counting hazard (INV-16).
          provenanceOrigin: row.provenanceOrigin,
          provenanceActor: row.provenanceActor,
          sourceRef: row.sourceRef,
          capturedAt: row.capturedAt,
          timeSemantic: row.timeSemantic,
          timeAt: row.timeAt,
          intervalFrom: row.intervalFrom,
          intervalTo: row.intervalTo,
          intervalReportedAs: row.intervalReportedAs,
          rawExpressionVerbatim: row.rawExpressionVerbatim,
          rawExpressionLanguage: row.rawExpressionLanguage,
        },
      });
    });
  }
}
