import { describe, expect, it } from 'vitest';
import type { IngestionPlan } from '@/domain/ingestion/ingest-record';
import { recordId, evidenceUnitId, lineageEdgeId } from '@/domain/shared/ids';
import { MemoryIngestionCommitRepository } from '@/infra/memory/memory-ingestion-commit-repository';
import { MemoryRecordRepository } from '@/infra/memory/memory-record-repository';
import { MemoryEpistemicRoleRepository } from '@/infra/memory/memory-epistemic-role-repository';
import { MemoryLineageRepository } from '@/infra/memory/memory-lineage-repository';

const NOW = new Date('2026-09-13T00:00:00.000Z');
const plan = (): IngestionPlan => ({
  kind: 'create',
  record: {
    id: recordId('rec-1'), sourceFingerprint: 'fp-1' as never,
    evidenceUnitId: evidenceUnitId('eu-1'),
    epistemicRoles: ['user_expression', 'observed_event'],
    provenance: { origin: 'directly_observed', actor: 'user', sourceRef: 'capture:1', capturedAt: NOW },
    time: { semantic: 'capture_time', at: NOW }, rawExpression: { verbatim: '原文', language: 'zh' }, createdAt: NOW,
  },
  rolesToAdd: ['user_expression', 'observed_event'],
  lineageEdge: { id: lineageEdgeId('edge-1'), childId: recordId('rec-1'), parentId: recordId('rec-parent'), relationToParent: 'summarizes' },
  evidenceUnitInherited: false, evidenceUnitDeterminationReason: null,
});
class FailingRoles extends MemoryEpistemicRoleRepository { override async addRole(): Promise<void> { throw new Error('role failure'); } }
class FailingLineage extends MemoryLineageRepository { override async save(): Promise<void> { throw new Error('lineage failure'); } }

describe('MemoryIngestionCommitRepository atomicity', () => {
  it('restores all stores when a Role write fails', async () => {
    const records = new MemoryRecordRepository(); const roles = new FailingRoles(); const lineage = new MemoryLineageRepository();
    const commit = new MemoryIngestionCommitRepository(records, roles, lineage);
    await expect(commit.commit(plan())).rejects.toThrow('role failure');
    expect(await records.listRecent(10)).toEqual([]); expect(await roles.listRoles(recordId('rec-1'))).toEqual([]); expect(await lineage.directParents(recordId('rec-1'))).toEqual([]);
  });
  it('restores all stores when Lineage write fails', async () => {
    const records = new MemoryRecordRepository(); const roles = new MemoryEpistemicRoleRepository(); const lineage = new FailingLineage();
    const commit = new MemoryIngestionCommitRepository(records, roles, lineage);
    await expect(commit.commit(plan())).rejects.toThrow('lineage failure');
    expect(await records.listRecent(10)).toEqual([]); expect(await roles.listRoles(recordId('rec-1'))).toEqual([]); expect(await lineage.directParents(recordId('rec-1'))).toEqual([]);
  });
  it('commits all stores on success', async () => {
    const records = new MemoryRecordRepository(); const roles = new MemoryEpistemicRoleRepository(); const lineage = new MemoryLineageRepository();
    await new MemoryIngestionCommitRepository(records, roles, lineage).commit(plan());
    expect(await records.findById(recordId('rec-1'))).not.toBeNull(); expect(await roles.listRoles(recordId('rec-1'))).toHaveLength(2); expect(await lineage.directParents(recordId('rec-1'))).toHaveLength(1);
  });
});
