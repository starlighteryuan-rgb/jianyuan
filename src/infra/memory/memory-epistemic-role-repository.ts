import type { RecordEpistemicRoleRepository } from '../../domain/ports/repositories';
import type { RecordEpistemicRoleAssignment } from '../../domain/record/epistemic-role';
import type { EpistemicRole } from '../../domain/shared/enums';
import type { RecordId } from '../../domain/shared/ids';

export class MemoryEpistemicRoleRepository
  implements RecordEpistemicRoleRepository
{
  private readonly roles = new Map<RecordId, Set<EpistemicRole>>();

  async listRoles(recordId: RecordId): Promise<readonly EpistemicRole[]> {
    return Array.from(this.roles.get(recordId) ?? []);
  }

  async addRole(assignment: RecordEpistemicRoleAssignment): Promise<void> {
    const roles = this.roles.get(assignment.recordId);
    if (roles === undefined) {
      this.roles.set(assignment.recordId, new Set([assignment.role]));
      return;
    }

    roles.add(assignment.role);
  }

  clear(): void {
    this.roles.clear();
  }

  snapshot(): Map<RecordId, Set<EpistemicRole>> {
    return new Map(
      [...this.roles.entries()].map(([id, values]) => [id, new Set(values)]),
    );
  }

  restore(snapshot: Map<RecordId, Set<EpistemicRole>>): void {
    this.roles.clear();
    for (const [id, values] of snapshot) this.roles.set(id, new Set(values));
  }
}
