/** Temporary read adapter for the explicit legacy composition fallback. */
import type {
  RecordQueries,
  RecordReadModel,
  ReflectionMeaningReadModel,
} from '../../packages/core/index';
import type { Repositories } from './container';
import { recordId } from '../domain/shared/ids';

const MAX_RECENT_RECORDS = 100;

const toRecordReadModel = (
  record: NonNullable<Awaited<ReturnType<Repositories['records']['findById']>>>,
): RecordReadModel => ({
  id: record.id,
  verbatim: record.rawExpression?.verbatim ?? null,
  language: record.rawExpression?.language ?? null,
  epistemicRoles: [...record.epistemicRoles],
  time: record.time,
  capturedAt: record.provenance.capturedAt,
  createdAt: record.createdAt,
});

export const createLegacyRecordQueries = (
  repositories: Repositories,
): RecordQueries => ({
  listRecent: async ({ limit }) => {
    if (!Number.isInteger(limit) || limit <= 0) return [];
    const records = await repositories.records.listRecent(
      Math.min(limit, MAX_RECENT_RECORDS),
    );
    return records.map(toRecordReadModel);
  },
  getById: async (id) => {
    const record = await repositories.records.findById(recordId(id));
    return record === null ? null : toRecordReadModel(record);
  },
  getReflectionContext: async (id) => {
    const record = await repositories.records.findById(recordId(id));
    if (record === null) return null;

    const history = await repositories.reflectionRecords.listByRecord(
      record.id,
    );
    const meaningHistory: ReflectionMeaningReadModel[] = history.map(
      (reflection) => ({
        id: reflection.id,
        meaningCommitment: reflection.meaningCommitment,
        validAtTime: reflection.validAtTime,
        currentEffect: reflection.currentEffect,
        createdAt: reflection.createdAt,
      }),
    );

    return { record: toRecordReadModel(record), meaningHistory };
  },
  search: async ({ query, limit }) => {
    const needle = query.trim().toLocaleLowerCase();
    if (!Number.isInteger(limit) || limit <= 0 || needle.length === 0) return [];

    const records = await repositories.records.listRecent(MAX_RECENT_RECORDS);
    return records
      .filter((record) =>
        (record.rawExpression?.verbatim ?? '')
          .toLocaleLowerCase()
          .includes(needle),
      )
      .slice(0, Math.min(limit, MAX_RECENT_RECORDS))
      .map(toRecordReadModel);
  },
});
