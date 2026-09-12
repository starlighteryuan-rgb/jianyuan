import type { RecordRepository } from '../../domain/ports/repositories';
import type { PersonalRecord } from '../../domain/record/record';
import type {
  EvidenceUnitId,
  RecordId,
  SourceFingerprint,
} from '../../domain/shared/ids';

export class MemoryRecordRepository implements RecordRepository {
  private readonly records = new Map<RecordId, PersonalRecord>();

  async findById(id: RecordId): Promise<PersonalRecord | null> {
    return this.records.get(id) ?? null;
  }

  async findBySourceFingerprint(
    fingerprint: SourceFingerprint,
  ): Promise<PersonalRecord | null> {
    for (const record of this.records.values()) {
      if (record.sourceFingerprint === fingerprint) {
        return record;
      }
    }

    return null;
  }

  async findByEvidenceUnit(
    unitId: EvidenceUnitId,
  ): Promise<readonly PersonalRecord[]> {
    const matches: PersonalRecord[] = [];

    for (const record of this.records.values()) {
      if (record.evidenceUnitId === unitId) {
        matches.push(record);
      }
    }

    return matches;
  }

  async countDistinctEvidenceUnits(ids: readonly RecordId[]): Promise<number> {
    const evidenceUnitIds = new Set<EvidenceUnitId>();

    for (const id of ids) {
      const record = this.records.get(id);
      if (record !== undefined) {
        evidenceUnitIds.add(record.evidenceUnitId);
      }
    }

    return evidenceUnitIds.size;
  }

  async listRecent(limit: number): Promise<readonly PersonalRecord[]> {
    // `createdAt` descending — the platform's own clock. Never `time`, whose
    // semantic varies per record (§5, INV-07/INV-08).
    if (limit <= 0) return [];

    return [...this.records.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async save(record: PersonalRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  clear(): void {
    this.records.clear();
  }
}
