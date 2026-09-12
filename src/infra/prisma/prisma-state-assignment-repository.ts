/**
 * Prisma-backed StateAssignmentRepository (ENGINEERING_CONTRACT §16, §16.1–16.3;
 * docs/architecture.md §4 Patch B).
 *
 * State is TARGET-SCOPED: there is no case-global state, and the schema enforces
 * one row per target via `@@unique([targetType, targetRef])`.
 *
 * WHY `save` UPSERTS ON THE TARGET, NOT ON THE ID.
 *
 * `(targetType, targetRef)` is the semantic key — §16 says one state row per
 * target — while `id` is merely its surrogate. Upserting on `id` would let a
 * caller that minted a fresh id for a target that already has a row hit a
 * unique-constraint violation instead of updating it. Keying on the target makes
 * the write idempotent in the way the contract actually means, and an existing
 * row keeps its original `id` rather than having it rewritten underneath any
 * reference to it.
 *
 * WHAT THIS ADAPTER CANNOT DO: touch evidence. `StateAssignment` carries no
 * evidence field, so there is no column here through which a user's position
 * could alter a descriptive score (INV-04, arch §11 Patch 9). §16.1's valid
 * combination — `supportLevel = strong` with `userPosition = disagrees` and
 * `workflowState = suspended` — round-trips untouched because the three state
 * fields are written independently and none is derived from another.
 */

import type { PrismaClient } from '../../../generated/prisma/client';

import type { StateAssignmentRepository } from '../../domain/ports/repositories';
import type { StateAssignment } from '../../domain/state/state-assignment';
import type { StateTargetType } from '../../domain/shared/enums';
import type { StateAssignmentId } from '../../domain/shared/ids';
import {
  toDbStateTargetType,
  toDomainStateAssignment,
  toStateAssignmentRow,
} from './mappers';

export class PrismaStateAssignmentRepository
  implements StateAssignmentRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async findByTarget(
    targetType: StateTargetType,
    targetRef: string,
  ): Promise<StateAssignment | null> {
    const row = await this.prisma.stateAssignment.findUnique({
      where: {
        targetType_targetRef: {
          targetType: toDbStateTargetType(targetType),
          targetRef,
        },
      },
    });

    return row === null ? null : toDomainStateAssignment(row);
  }

  async findById(id: StateAssignmentId): Promise<StateAssignment | null> {
    const row = await this.prisma.stateAssignment.findUnique({ where: { id } });
    return row === null ? null : toDomainStateAssignment(row);
  }

  async save(assignment: StateAssignment): Promise<void> {
    const row = toStateAssignmentRow(assignment);

    await this.prisma.stateAssignment.upsert({
      where: {
        targetType_targetRef: {
          targetType: row.targetType,
          targetRef: row.targetRef,
        },
      },
      create: row,
      // `id`, `targetType`, and `targetRef` are deliberately absent from the
      // update: the row's identity and its target are not things a save may
      // change. Only the three orthogonal state fields move.
      update: {
        userPosition: row.userPosition,
        workflowState: row.workflowState,
        presentationState: row.presentationState,
        updatedAt: row.updatedAt,
      },
    });
  }
}
