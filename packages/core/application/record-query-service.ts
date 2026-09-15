import type {
  RecordRepository,
  UserReflectionRecordRepository,
} from '../domain/ports/repositories';
import type { PersonalRecord } from '../domain/record/record';
import { recordId } from '../domain/shared/ids';
import type {
  RecordQueries,
  RecordReadModel,
  RecordReflectionContextReadModel,
  ReflectionMeaningReadModel,
} from '../contracts/records';

export interface RecordQueryDeps {
  readonly records: RecordRepository;
  readonly reflectionRecords: UserReflectionRecordRepository;
}

const MAX_RECENT_RECORDS = 100;

const toRecordReadModel = (record: PersonalRecord): RecordReadModel => ({
  id: record.id,
  verbatim: record.rawExpression?.verbatim ?? null,
  language: record.rawExpression?.language ?? null,
  epistemicRoles: [...record.epistemicRoles],
  time: record.time,
  capturedAt: record.provenance.capturedAt,
  createdAt: record.createdAt,
});

export class RecordQueryService implements RecordQueries {
  constructor(private readonly deps: RecordQueryDeps) {}

  async listRecent(input: {
    readonly limit: number;
  }): Promise<readonly RecordReadModel[]> {
    if (!Number.isInteger(input.limit) || input.limit <= 0) return [];

    const limit = Math.min(input.limit, MAX_RECENT_RECORDS);
    const records = await this.deps.records.listRecent(limit);
    return records.map(toRecordReadModel);
  }

  async getById(id: string): Promise<RecordReadModel | null> {
    const record = await this.deps.records.findById(recordId(id));
    return record === null ? null : toRecordReadModel(record);
  }

  async getReflectionContext(
    id: string,
  ): Promise<RecordReflectionContextReadModel | null> {
    const brandedId = recordId(id);
    const record = await this.deps.records.findById(brandedId);
    if (record === null) return null;

    const history = await this.deps.reflectionRecords.listByRecord(brandedId);
    const meaningHistory: ReflectionMeaningReadModel[] = history.map(
      (reflection) => ({
        id: reflection.id,
        meaningCommitment: reflection.meaningCommitment,
        validAtTime: reflection.validAtTime,
        currentEffect: reflection.currentEffect,
        createdAt: reflection.createdAt,
      }),
    );

    return {
      record: toRecordReadModel(record),
      meaningHistory,
    };
  }

  async search(input: {
    readonly query: string;
    readonly limit: number;
  }): Promise<readonly RecordReadModel[]> {
    const query = input.query.trim();
    if (!Number.isInteger(input.limit) || input.limit <= 0 || query.length === 0) {
      return [];
    }

    const records = await this.deps.records.searchText(
      query,
      Math.min(input.limit, MAX_RECENT_RECORDS),
    );
    return records.map(toRecordReadModel);
  }
}
