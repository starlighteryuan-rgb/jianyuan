import type { UserReflectionRecordRepository } from '../../domain/ports/repositories';
import type { UserReflectionRecord } from '../../domain/reflection/user-reflection-record';
import type { RecordId, UserReflectionRecordId } from '../../domain/shared/ids';

export class MemoryUserReflectionRecordRepository
  implements UserReflectionRecordRepository
{
  private readonly records = new Map<
    UserReflectionRecordId,
    UserReflectionRecord
  >();

  async save(record: UserReflectionRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async listByRecord(
    recordId: RecordId,
  ): Promise<readonly UserReflectionRecord[]> {
    const matches: UserReflectionRecord[] = [];

    for (const record of this.records.values()) {
      if (record.recordId === recordId) {
        matches.push(record);
      }
    }

    return matches;
  }

  clear(): void {
    this.records.clear();
  }
}
