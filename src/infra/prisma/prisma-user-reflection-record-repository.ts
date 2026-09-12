/**
 * Prisma-backed UserReflectionRecordRepository (ENGINEERING_CONTRACT §24, §25;
 * INV-18; docs/architecture.md §4 Patch 3).
 *
 * This entity owns the user's meaning lifecycle, so two rules bind the adapter:
 *
 *   §25 — a superseded meaning is RETAINED, never deleted. There is no delete
 *         method here at all; supersession is an update that sets
 *         `currentEffect = 'superseded'` and leaves the row in place.
 *
 *   §12 — meaning validity time is a full TimeAssertion, so a row with
 *         inconsistent time columns is REFUSED rather than repaired. Reading
 *         throws instead of fabricating bounds or inventing the user's wording.
 *
 * The refusal is deliberate and matches the RelationClaim adapter's stance: a
 * malformed row is a defect to surface, not something to paper over with a
 * plausible reconstruction of what the user meant.
 */

import type { PrismaClient } from '../../../generated/prisma/client';

import type { UserReflectionRecordRepository } from '../../domain/ports/repositories';
import type { UserReflectionRecord } from '../../domain/reflection/user-reflection-record';
import type { RecordId } from '../../domain/shared/ids';
import {
  toDomainUserReflectionRecord,
  toUserReflectionRecordRow,
  type UserReflectionRecordRow,
} from './mappers';

/**
 * Map a row, throwing on inconsistency.
 *
 * The port returns plain entities rather than Results, so a mapping failure
 * surfaces as an exception. Repairing it silently would mean guessing what
 * period a meaning was valid over, which §12 forbids.
 */
const mapOrThrow = (row: UserReflectionRecordRow): UserReflectionRecord => {
  const mapped = toDomainUserReflectionRecord(row);

  if (!mapped.ok) {
    throw new Error(
      `Refusing to reconstruct UserReflectionRecord ${row.id}: its meaning ` +
        `validity time is inconsistent (${mapped.error.detail}). The period a ` +
        'meaning was valid over may not be fabricated (§12, §25).',
    );
  }

  return mapped.value;
};

export class PrismaUserReflectionRecordRepository
  implements UserReflectionRecordRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async save(record: UserReflectionRecord): Promise<void> {
    const row = toUserReflectionRecordRow(record);

    await this.prisma.userReflectionRecord.upsert({
      where: { id: row.id },
      create: row,
      update: {
        // `currentEffect`, `supersededById`, and `supersededAt` are updatable
        // because that IS supersession (§25). Note there is no delete path: the
        // earlier meaning stays, because the user did historically understand it
        // that way.
        meaningCommitment: row.meaningCommitment,
        validAtSemantic: row.validAtSemantic,
        validAtTime: row.validAtTime,
        validAtIntervalFrom: row.validAtIntervalFrom,
        validAtIntervalTo: row.validAtIntervalTo,
        validAtIntervalReportedAs: row.validAtIntervalReportedAs,
        currentEffect: row.currentEffect,
        supersededById: row.supersededById,
        supersededAt: row.supersededAt,
        episodeId: row.episodeId,
      },
    });
  }

  async listByRecord(
    recordId: RecordId,
  ): Promise<readonly UserReflectionRecord[]> {
    // Oldest first, so the meaning history reads in the order the user actually
    // expressed it (§25: meaning is time-indexed).
    const rows = await this.prisma.userReflectionRecord.findMany({
      where: { recordId },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(mapOrThrow);
  }
}
