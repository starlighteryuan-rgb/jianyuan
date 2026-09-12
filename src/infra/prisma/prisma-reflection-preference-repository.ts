/**
 * Prisma-backed ReflectionPreferenceRepository (ENGINEERING_CONTRACT §33).
 *
 * §33: preferences describe interaction style, are not personality traits, may
 * change over time, and must not be used to infer stable identity.
 *
 * The adapter reflects that literally. There is one row, it is overwritten in
 * place, and NO history is kept: a history would invite reading consistency over
 * time as evidence about the person, which is exactly the inference §33 forbids.
 */

import type { PrismaClient } from '../../../generated/prisma/client';

import type { ReflectionPreferenceRepository } from '../../domain/ports/repositories';
import {
  SOLE_PREFERENCE_ID,
  type ReflectionPreference,
} from '../../domain/reflection/reflection-preference';
import {
  toDomainReflectionPreference,
  toReflectionPreferenceRow,
} from './mappers';

export class PrismaReflectionPreferenceRepository
  implements ReflectionPreferenceRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async find(): Promise<ReflectionPreference | null> {
    const row = await this.prisma.reflectionPreference.findUnique({
      where: { id: SOLE_PREFERENCE_ID },
    });

    // Null means UNSET, not "default". The caller applies defaults explicitly,
    // so a stored choice is never confused with an absent one.
    return row === null ? null : toDomainReflectionPreference(row);
  }

  async save(preference: ReflectionPreference): Promise<void> {
    const row = toReflectionPreferenceRow(preference);

    await this.prisma.reflectionPreference.upsert({
      where: { id: row.id },
      create: row,
      update: {
        hypothesisVisibility: row.hypothesisVisibility,
        interventionLevel: row.interventionLevel,
        explanationDensity: row.explanationDensity,
        updatedAt: row.updatedAt,
      },
    });
  }
}
