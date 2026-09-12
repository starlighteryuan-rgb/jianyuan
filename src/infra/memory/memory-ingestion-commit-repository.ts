import type { IngestionCommitRepository } from '../../domain/ports/repositories';
import type { IngestionPlan } from '../../domain/ingestion/ingest-record';
import { MemoryRecordRepository } from './memory-record-repository';
import { MemoryEpistemicRoleRepository } from './memory-epistemic-role-repository';
import { MemoryLineageRepository } from './memory-lineage-repository';

/** Atomic in-memory adapter using snapshots and one commit/restore boundary. */
export class MemoryIngestionCommitRepository implements IngestionCommitRepository {
  constructor(
    private readonly records: MemoryRecordRepository,
    private readonly roles: MemoryEpistemicRoleRepository,
    private readonly lineage: MemoryLineageRepository,
  ) {}

  async commit(plan: IngestionPlan): Promise<void> {
    const records = this.records.snapshot();
    const roles = this.roles.snapshot();
    const lineage = this.lineage.snapshot();

    try {
      if (plan.kind === 'create') {
        await this.records.save(plan.record);
      }

      for (const role of plan.rolesToAdd) {
        await this.roles.addRole({ recordId: plan.kind === 'create' ? plan.record.id : plan.recordId, role });
      }

      if (plan.lineageEdge !== null) {
        await this.lineage.save({
          ...plan.lineageEdge,
          createdAt: plan.kind === 'create' ? plan.record.createdAt : new Date(),
        });
      }
    } catch (error) {
      this.records.restore(records);
      this.roles.restore(roles);
      this.lineage.restore(lineage);
      throw error;
    }
  }
}
