import type { StateAssignmentRepository } from '../../domain/ports/repositories';
import type { StateAssignment } from '../../domain/state/state-assignment';
import type { StateTargetType } from '../../domain/shared/enums';
import type { StateAssignmentId } from '../../domain/shared/ids';

export class MemoryStateAssignmentRepository
  implements StateAssignmentRepository
{
  private readonly assignments = new Map<StateAssignmentId, StateAssignment>();

  async findByTarget(
    targetType: StateTargetType,
    targetRef: string,
  ): Promise<StateAssignment | null> {
    for (const assignment of this.assignments.values()) {
      if (
        assignment.targetType === targetType &&
        assignment.targetRef === targetRef
      ) {
        return assignment;
      }
    }

    return null;
  }

  async save(assignment: StateAssignment): Promise<void> {
    this.assignments.set(assignment.id, assignment);
  }

  async findById(id: StateAssignmentId): Promise<StateAssignment | null> {
    return this.assignments.get(id) ?? null;
  }

  clear(): void {
    this.assignments.clear();
  }
}
