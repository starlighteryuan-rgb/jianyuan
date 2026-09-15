import { describe, expect, it } from 'vitest';

import {
  RecordQueryService,
  evidenceUnitId,
  recordId,
  sourceFingerprint,
  userReflectionRecordId,
  type PersonalRecord,
  type RecordRepository,
  type UserReflectionRecord,
  type UserReflectionRecordRepository,
} from '../index';

const at = new Date('2026-09-13T00:00:00.000Z');
const record: PersonalRecord = {
  id: recordId('record-query-1'),
  sourceFingerprint: sourceFingerprint('fingerprint-query-1'),
  evidenceUnitId: evidenceUnitId('evidence-query-1'),
  epistemicRoles: ['user_expression'],
  provenance: {
    origin: 'user_reported',
    actor: 'user',
    sourceRef: 'query-test:1',
    capturedAt: at,
  },
  time: { semantic: 'capture_time', at },
  rawExpression: { verbatim: '我想以后再回来看。', language: 'zh' },
  createdAt: at,
};
const reflection: UserReflectionRecord = {
  id: userReflectionRecordId('reflection-query-1'),
  recordId: record.id,
  meaningCommitment: 'tentative',
  validAtTime: { semantic: 'observation_time', at },
  currentEffect: 'current',
  supersededByRef: null,
  supersededAt: null,
  episodeRef: null,
  createdAt: at,
};

const records: RecordRepository = {
  findById: async (id) => id === record.id ? record : null,
  findBySourceFingerprint: async () => record,
  findByEvidenceUnit: async () => [record],
  countDistinctEvidenceUnits: async () => 1,
  listRecent: async (limit) => limit > 0 ? [record] : [],
  searchText: async (query, limit) =>
    limit > 0 && record.rawExpression?.verbatim.includes(query) ? [record] : [],
  save: async () => undefined,
};
const reflectionRecords: UserReflectionRecordRepository = {
  save: async () => undefined,
  listByRecord: async (id) => id === record.id ? [reflection] : [],
  // This test exercises RecordQueryService, which reads by Record. The
  // fixture reflection has no episodeRef, so an episode lookup is empty.
  listByEpisode: async () => [],
};

describe('RecordQueryService', () => {
  const queries = new RecordQueryService({ records, reflectionRecords });

  it('returns recent and single Record read models without exposing repositories', async () => {
    expect(await queries.listRecent({ limit: 10 })).toEqual([
      expect.objectContaining({
        id: record.id,
        verbatim: '我想以后再回来看。',
        epistemicRoles: ['user_expression'],
      }),
    ]);
    expect(await queries.getById(record.id)).toEqual(
      expect.objectContaining({ id: record.id, verbatim: record.rawExpression?.verbatim }),
    );
  });

  it('returns Record and meaning history as Reflection context', async () => {
    const context = await queries.getReflectionContext(record.id);

    expect(context?.record.id).toBe(record.id);
    expect(context?.meaningHistory).toEqual([
      expect.objectContaining({
        id: reflection.id,
        meaningCommitment: 'tentative',
      }),
    ]);
  });

  it('returns safe empty results for invalid limits and missing Records', async () => {
    expect(await queries.listRecent({ limit: 0 })).toEqual([]);
    expect(await queries.getById('missing')).toBeNull();
    expect(await queries.getReflectionContext('missing')).toBeNull();
    expect(await queries.search({ query: '回来', limit: 10 })).toHaveLength(1);
    expect(await queries.search({ query: ' ', limit: 10 })).toEqual([]);
  });
});
