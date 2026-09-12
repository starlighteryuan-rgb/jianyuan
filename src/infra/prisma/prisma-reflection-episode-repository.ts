/**
 * Prisma-backed ReflectionEpisodeRepository (ENGINEERING_CONTRACT §21, §22,
 * §23; docs/architecture.md §4 Patch 4).
 *
 * An episode records HOW a reflection was elicited and nothing else. There is no
 * meaning column, no user position, no response — Patch 4 moved
 * `meaning_commitment` out of this entity precisely so no field here could be
 * mistaken for what the user concluded (INV-18).
 *
 * `save` is an upsert rather than a create because a single episode accumulates
 * its `systemFollowupCount` as the exchange proceeds: the same episode is
 * written again when the one permitted follow-up occurs (§23).
 */

import type { PrismaClient } from '../../../generated/prisma/client';

import type { ReflectionEpisodeRepository } from '../../domain/ports/repositories';
import type { ReflectionEpisode } from '../../domain/reflection/reflection-episode';
import { toReflectionEpisodeRow } from './mappers';

export class PrismaReflectionEpisodeRepository
  implements ReflectionEpisodeRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async save(episode: ReflectionEpisode): Promise<void> {
    const row = toReflectionEpisodeRow(episode);

    await this.prisma.reflectionEpisode.upsert({
      where: { id: row.id },
      create: row,
      update: {
        // Provenance fields are updatable because an in-progress episode's
        // stimulus may be refined, but note what CANNOT change: there is no
        // meaning or position column to write, so no update path exists through
        // which an episode could acquire a conclusion (Patch 4).
        elicitationMode: row.elicitationMode,
        stimulusType: row.stimulusType,
        systemFollowupCount: row.systemFollowupCount,
        stimulusRef: row.stimulusRef,
        targetRef: row.targetRef,
      },
    });
  }
}
