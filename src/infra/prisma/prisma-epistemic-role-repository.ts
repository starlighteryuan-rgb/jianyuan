/**
 * Prisma-backed RecordEpistemicRoleRepository.
 *
 * This adapter writes to ONE table and touches nothing else. That narrowness is
 * the point: reclassifying a source must be incapable of altering its Evidence
 * Unit (ENGINEERING_CONTRACT §4, INV-16).
 *
 * `addRole` is idempotent via the composite primary key (recordId, role).
 * Asserting the same role twice is a no-op, so repeated classification cannot
 * multiply anything.
 */

import type { PrismaClient } from '../../../generated/prisma/client';

import type { RecordEpistemicRoleRepository } from '../../domain/ports/repositories';
import type { RecordEpistemicRoleAssignment } from '../../domain/record/epistemic-role';
import type { EpistemicRole } from '../../domain/shared/enums';
import type { RecordId } from '../../domain/shared/ids';
import { epistemicRoleFromDb, epistemicRoleToDb } from './mappers';

export class PrismaEpistemicRoleRepository
  implements RecordEpistemicRoleRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async listRoles(recordId: RecordId): Promise<readonly EpistemicRole[]> {
    const rows = await this.prisma.recordEpistemicRole.findMany({
      where: { recordId },
      select: { role: true },
    });

    return rows.map((r) => epistemicRoleFromDb(r.role));
  }

  async addRole(assignment: RecordEpistemicRoleAssignment): Promise<void> {
    const role = epistemicRoleToDb(assignment.role);

    // Idempotent on the composite PK. Note there is no `update` payload: a
    // role assignment carries no mutable data, and crucially no evidence field
    // that a re-assertion could disturb.
    await this.prisma.recordEpistemicRole.upsert({
      where: { recordId_role: { recordId: assignment.recordId, role } },
      create: { recordId: assignment.recordId, role },
      update: {},
    });
  }
}
