import type { UserReflectionRecordRepository } from '../../core/index';
import type { UserReflectionRecord } from '../../core/index';
import type { RecordId, UserReflectionRecordId } from '../../core/index';

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

  async listByEpisode(
    episodeRef: string,
  ): Promise<readonly UserReflectionRecord[]> {
    const matches: UserReflectionRecord[] = [];

    for (const record of this.records.values()) {
      if (record.episodeRef === episodeRef) {
        matches.push(record);
      }
    }

    // Oldest first, matching the SQLite adapter's ordering.
    return matches.sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );
  }

  clear(): void {
    this.records.clear();
  }
}


