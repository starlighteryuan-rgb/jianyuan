/**
 * Prisma-backed DiscoveryRepository (docs/architecture.md §4 Patch 6; §17).
 *
 * A Discovery row is IDENTITY ONLY: `{ id, subjectRef, discoveryKind,
 * stableKey }`. Attention Priority and Presentation Level are computed on read
 * and never persisted, so this adapter has no column to write them to even if a
 * caller tried.
 *
 * `ensure` is idempotent on `stableKey`, which is the whole point of Patch 6:
 * recomputing a Discovery over the same subject must bind to the SAME row, so
 * the user's archive and restore decisions survive recomputation instead of
 * being attached to a transient object that disappears on the next pass.
 */

import type { PrismaClient } from '../../../generated/prisma/client';

import type { DiscoveryRepository } from '../../domain/ports/repositories';
import type { Discovery } from '../../domain/discovery/discovery';
import { hasStableIdentity } from '../../domain/discovery/discovery';
import type { DiscoveryId } from '../../domain/shared/ids';
import { toDiscoveryRow, toDomainDiscovery } from './mappers';

export class PrismaDiscoveryRepository implements DiscoveryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: DiscoveryId): Promise<Discovery | null> {
    const row = await this.prisma.discovery.findUnique({ where: { id } });
    return row === null ? null : toDomainDiscovery(row);
  }

  async findByStableKey(stableKey: string): Promise<Discovery | null> {
    const row = await this.prisma.discovery.findUnique({ where: { stableKey } });
    return row === null ? null : toDomainDiscovery(row);
  }

  async ensure(discovery: Discovery): Promise<Discovery> {
    if (!hasStableIdentity(discovery)) {
      throw new Error(
        `Refusing to persist Discovery ${discovery.id}: it must carry a ` +
          'non-empty stableKey, or archive/restore state could not survive ' +
          'recomputation (Patch 6).',
      );
    }

    const row = toDiscoveryRow(discovery);

    // Idempotent on stableKey. `update: {}` is deliberate: an existing identity
    // is returned UNCHANGED rather than refreshed. Rewriting `createdAt` would
    // reset the age a Novelty judgment reads, letting recomputation manufacture
    // novelty — the attention-layer analogue of INV-03.
    const saved = await this.prisma.discovery.upsert({
      where: { stableKey: row.stableKey },
      create: row,
      update: {},
    });

    return toDomainDiscovery(saved);
  }
}
