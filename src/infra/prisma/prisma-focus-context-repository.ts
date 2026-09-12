/**
 * Prisma-backed FocusContextRepository (ENGINEERING_CONTRACT §19).
 *
 * `listActive` filters only on what is STORED — not ended, and not past a
 * user-stated expiry. It deliberately does NOT filter on elastic fading: a faded
 * context is still a live row whose reduced relevance is derived on read.
 * Filtering it out here would require the database to know a fading threshold,
 * which is precisely the "fabricated precise expiry" §19 forbids.
 *
 * `expire` ends a context row and touches nothing else. §19: "Expiry reduces
 * current relevance. It does NOT delete historical records."
 */

import type { PrismaClient } from '../../../generated/prisma/client';

import type { FocusContextRepository } from '../../domain/ports/repositories';
import type { CurrentFocusContext } from '../../domain/discovery/focus-context';
import type { FocusContextId } from '../../domain/shared/ids';
import { toDomainFocusContext, toFocusContextRow } from './mappers';

export class PrismaFocusContextRepository implements FocusContextRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: FocusContextId): Promise<CurrentFocusContext | null> {
    const row = await this.prisma.currentFocusContext.findUnique({
      where: { id },
    });

    return row === null ? null : toDomainFocusContext(row);
  }

  async listActive(now: Date): Promise<readonly CurrentFocusContext[]> {
    const rows = await this.prisma.currentFocusContext.findMany({
      where: {
        endedAt: null,
        // A stated duration is honored precisely (§19). Null means the user
        // stated none, so the row stays active and fades on read instead.
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(toDomainFocusContext);
  }

  async save(context: CurrentFocusContext): Promise<void> {
    const row = toFocusContextRow(context);

    await this.prisma.currentFocusContext.upsert({
      where: { id: row.id },
      create: row,
      update: {
        subjectRef: row.subjectRef,
        sourceKind: row.sourceKind,
        sourceRef: row.sourceRef,
        lastMentionedAt: row.lastMentionedAt,
        expiresAt: row.expiresAt,
        endedAt: row.endedAt,
      },
    });
  }

  async expire(id: FocusContextId, at: Date): Promise<void> {
    // Ends the context; deletes nothing. Absent rows are a no-op rather than an
    // error, so expiring an already-removed focus is safe to retry.
    await this.prisma.currentFocusContext.updateMany({
      where: { id, endedAt: null },
      data: { endedAt: at },
    });
  }
}
