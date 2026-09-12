/**
 * Prisma-backed DirectiveRepository.
 *
 * `listActive` filters on `revokedAt: null` at the database level, so a revoked
 * directive stops influencing resolution immediately (ENGINEERING_CONTRACT §26:
 * directives must be revocable).
 *
 * Revocation is an UPDATE, never a DELETE. A directive is a first-class record
 * (§26) and its history matters: the fact that the user once issued it, and
 * when they withdrew it, both remain inspectable.
 */

import type { PrismaClient } from '../../../generated/prisma/client';

import type { DirectiveRepository } from '../../domain/ports/repositories';
import type { Directive } from '../../domain/directive/directive';
import type { DirectiveId } from '../../domain/shared/ids';
import { toDirectiveRow, toDomainDirective } from './mappers';

export class PrismaDirectiveRepository implements DirectiveRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: DirectiveId): Promise<Directive | null> {
    const row = await this.prisma.directive.findUnique({ where: { id } });
    return row === null ? null : toDomainDirective(row);
  }

  async listActive(): Promise<readonly Directive[]> {
    const rows = await this.prisma.directive.findMany({
      where: { revokedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(toDomainDirective);
  }

  async save(directive: Directive): Promise<void> {
    const row = toDirectiveRow(directive);

    await this.prisma.directive.upsert({
      where: { id: row.id },
      create: row,
      update: {
        // All four permission dimensions are updated independently. None is
        // derived from another (INV-17).
        allowAnalysis: row.allowAnalysis,
        allowStorage: row.allowStorage,
        allowPassivePresentation: row.allowPassivePresentation,
        allowProactivePresentation: row.allowProactivePresentation,
        appliesToFutureSimilar: row.appliesToFutureSimilar,
        scopeKind: row.scopeKind,
        scopeValue: row.scopeValue,
        revokedAt: row.revokedAt,
      },
    });
  }

  async revoke(id: DirectiveId, at: Date): Promise<void> {
    await this.prisma.directive.update({
      where: { id },
      data: { revokedAt: at },
    });
  }
}
