import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  discoveryId,
  evidenceUnitId,
  lineageEdgeId,
  recordId,
  relationClaimId,
  sourceFingerprint,
  type IngestionPlan,
  type PersonalRecord,
} from '../../../core/index';
import { runAwarenessUseCase } from '../../memory/tests/storage-contract';
import { createSqliteStorage, SQLITE_SCHEMA_VERSION } from '../index';

const temporaryDirectories: string[] = [];

const databasePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-sqlite-'));
  temporaryDirectories.push(directory);
  return join(directory, 'awareness.sqlite');
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('SqliteStorageAdapter', () => {
  it('persists the core data across connection restart and repeatable migration', async () => {
    const path = databasePath();
    const first = createSqliteStorage(path);
    const result = await runAwarenessUseCase(first);
    await first.discoveries.ensure({
      id: discoveryId('sqlite-discovery-1'),
      subjectRef: {
        type: 'relation_claim',
        id: relationClaimId('memory-relation-1'),
      },
      discoveryKind: 'relation_discovery',
      stableKey: 'relation_claim:memory-relation-1:relation_discovery',
      createdAt: new Date('2026-09-13T00:02:30.000Z'),
    });
    expect(result.reflectionCount).toBe(1);
    first.close();

    const reopened = createSqliteStorage(path);
    expect(reopened.schemaVersion).toBe(SQLITE_SCHEMA_VERSION);
    expect(await reopened.records.listRecent(10)).toHaveLength(2);
    expect(
      await reopened.relationClaims.findById(
        relationClaimId('memory-relation-1'),
      ),
    ).not.toBeNull();
    expect(
      await reopened.discoveries.findByStableKey(
        'relation_claim:memory-relation-1:relation_discovery',
      ),
    ).not.toBeNull();
    const reflected = await reopened.records.searchText('继续观察', 10);
    expect(reflected).toHaveLength(1);
    expect(
      await reopened.userReflectionRecords.listByRecord(reflected[0]!.id),
    ).toHaveLength(1);
    reopened.close();
  });

  it('exports, clears, and restores every core table atomically', async () => {
    const adapter = createSqliteStorage(databasePath());
    await runAwarenessUseCase(adapter);
    await adapter.discoveries.ensure({
      id: discoveryId('sqlite-discovery-export'),
      subjectRef: {
        type: 'relation_claim',
        id: relationClaimId('memory-relation-1'),
      },
      discoveryKind: 'relation_discovery',
      stableKey: 'sqlite-export-discovery',
      createdAt: new Date('2026-09-13T00:02:30.000Z'),
    });

    const exported = adapter.exportData();
    expect(exported).not.toContain('undefined');
    adapter.clear();
    expect(await adapter.records.listRecent(10)).toEqual([]);
    expect(await adapter.relationClaims.listAll(10)).toEqual([]);

    adapter.restoreData(exported);
    expect(await adapter.records.listRecent(10)).toHaveLength(2);
    expect(await adapter.relationClaims.listAll(10)).toHaveLength(1);
    expect(
      await adapter.discoveries.findByStableKey('sqlite-export-discovery'),
    ).not.toBeNull();
    const reflected = await adapter.records.searchText('继续观察', 10);
    expect(
      await adapter.userReflectionRecords.listByRecord(reflected[0]!.id),
    ).toHaveLength(1);
    adapter.close();
  });

  it('rolls back Record and role writes when an ingestion commit fails', async () => {
    const adapter = createSqliteStorage(databasePath());
    const at = new Date('2026-09-13T00:00:00.000Z');
    const record: PersonalRecord = {
      id: recordId('rollback-record'),
      sourceFingerprint: sourceFingerprint('rollback-fingerprint'),
      evidenceUnitId: evidenceUnitId('rollback-evidence'),
      epistemicRoles: ['user_expression'],
      provenance: {
        origin: 'user_reported',
        actor: 'user',
        sourceRef: 'rollback-source',
        capturedAt: at,
      },
      time: { semantic: 'capture_time', at },
      rawExpression: { verbatim: '这条写入应被回滚。', language: 'zh' },
      createdAt: at,
    };
    const plan: IngestionPlan = {
      kind: 'create',
      record,
      rolesToAdd: ['user_expression'],
      lineageEdge: {
        id: lineageEdgeId('rollback-edge'),
        parentId: recordId('missing-parent'),
        childId: record.id,
        relationToParent: 'derived_from',
      },
      evidenceUnitInherited: true,
      evidenceUnitDeterminationReason: null,
    };

    await expect(adapter.ingestion.commit(plan)).rejects.toThrow();
    expect(await adapter.records.findById(record.id)).toBeNull();
    expect(await adapter.roles.listRoles(record.id)).toEqual([]);
    adapter.close();
  });

  it('treats LIKE wildcard characters as literal search text', async () => {
    const adapter = createSqliteStorage(databasePath());
    const at = new Date('2026-09-13T00:00:00.000Z');
    await adapter.records.save({
      id: recordId('search-record'),
      sourceFingerprint: sourceFingerprint('search-fingerprint'),
      evidenceUnitId: evidenceUnitId('search-evidence'),
      epistemicRoles: [],
      provenance: {
        origin: 'user_reported',
        actor: 'user',
        sourceRef: 'search-source',
        capturedAt: at,
      },
      time: { semantic: 'capture_time', at },
      rawExpression: { verbatim: '完成率是 50%_draft', language: 'zh' },
      createdAt: at,
    });

    expect(await adapter.records.searchText('%_draft', 10)).toHaveLength(1);
    expect(await adapter.records.searchText('%missing', 10)).toEqual([]);
    adapter.close();
  });
});
