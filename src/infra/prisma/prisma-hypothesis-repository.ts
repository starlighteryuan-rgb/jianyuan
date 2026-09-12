/**
 * Prisma-backed HypothesisRepository.
 *
 * Simpler than the RelationClaim adapter: a Hypothesis has no parent/child score
 * coupling to defend, because it carries no evidence score of its own (§9's
 * Evidence Support belongs to the descriptive Relation Claim, and INV-09 keeps
 * it from being read as hypothesis probability).
 *
 * What IS defended on write is §13's competition requirement: a stored
 * hypothesis must still carry its rivals (H4), its falsifiers (H5), and at least
 * one discriminating prediction (H3). A hypothesis that lost those would read as
 * a settled account, which is exactly what §13 forbids storage from implying.
 */

import type { PrismaClient } from '../../../generated/prisma/client';

import type { HypothesisRepository } from '../../domain/ports/repositories';
import {
  remainsCompetable,
  type StoredHypothesis,
} from '../../domain/hypothesis/hypothesis';
import type { HypothesisId } from '../../domain/shared/ids';
import { toDomainHypothesis, toHypothesisRow } from './mappers';

export class PrismaHypothesisRepository implements HypothesisRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: HypothesisId): Promise<StoredHypothesis | null> {
    const row = await this.prisma.hypothesis.findUnique({ where: { id } });
    return row === null ? null : toDomainHypothesis(row);
  }

  async findByAnchorRef(
    anchorRef: string,
  ): Promise<readonly StoredHypothesis[]> {
    const rows = await this.prisma.hypothesis.findMany({
      where: { anchorRefs: { has: anchorRef } },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(toDomainHypothesis);
  }

  async listAll(): Promise<readonly StoredHypothesis[]> {
    // Ordered by time only. There is deliberately no ordering by strength:
    // competing explanations are peers, and ranking them would imply a
    // confidence §13 does not permit a Hypothesis to carry.
    const rows = await this.prisma.hypothesis.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(toDomainHypothesis);
  }

  async save(hypothesis: StoredHypothesis): Promise<void> {
    if (!remainsCompetable(hypothesis)) {
      throw new Error(
        `Refusing to persist Hypothesis ${hypothesis.id}: it must retain ` +
          'competing alternatives (H4), evidence that would strengthen and ' +
          'weaken it (H5), and at least one discriminating prediction (H3).',
      );
    }

    const row = toHypothesisRow(hypothesis);

    await this.prisma.hypothesis.upsert({
      where: { id: row.id },
      create: {
        ...row,
        anchorRefs: [...row.anchorRefs],
        supportingRecordRefs: [...row.supportingRecordRefs],
        discriminatingPredictions: [...row.discriminatingPredictions],
        alternatives: [...row.alternatives],
        wouldStrengthen: [...row.wouldStrengthen],
        wouldWeaken: [...row.wouldWeaken],
      },
      update: {
        explanation: row.explanation,
        anchorRefs: [...row.anchorRefs],
        anchorPath: row.anchorPath,
        // `supportBasis` is updatable because a re-evaluation may reclassify
        // the basis on new evidence. It is never silently upgraded: only the
        // admission gates write it, and only `directional_observation` admits.
        supportBasis: row.supportBasis,
        supportingRecordRefs: [...row.supportingRecordRefs],
        mechanism: row.mechanism,
        discriminatingPredictions: [...row.discriminatingPredictions],
        alternatives: [...row.alternatives],
        wouldStrengthen: [...row.wouldStrengthen],
        wouldWeaken: [...row.wouldWeaken],
      },
    });
  }
}
