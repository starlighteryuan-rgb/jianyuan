import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createCoreSqliteComposition,
  type CoreIdGenerator,
} from '@/server/capture-composition-root';
import { executeCapture } from '@/server/capture-use-case';
import {
  recordId,
  type RelationClaimCandidate,
} from '../packages/core/index';
import { DeterministicSemanticJudgmentAdapter } from '../packages/providers/deterministic/index';

class SqliteFlowIds implements CoreIdGenerator {
  private sequences = new Map<string, number>();
  private next(prefix: string): string {
    const value = (this.sequences.get(prefix) ?? 0) + 1;
    this.sequences.set(prefix, value);
    return `${prefix}_sqlite_${value}`;
  }
  nextRecordId = () => this.next('rec');
  nextEvidenceUnitId = () => this.next('eu');
  nextLineageEdgeId = () => this.next('edge');
  nextDirectiveId = () => this.next('dir');
  nextRelationClaimId = () => this.next('rc');
  nextHypothesisId = () => this.next('hyp');
  nextDiscoveryId = () => this.next('disc');
  nextStateAssignmentId = () => this.next('state');
  nextReflectionEpisodeId = () => this.next('ep');
  nextUserReflectionRecordId = () => this.next('urr');
}

describe('SQLite Core graph', () => {
  it('survives restart across Record -> Relation -> Discovery -> Reflection', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'jianyuan-core-sqlite-'));
    const path = join(directory, 'core.sqlite');
    const candidate: RelationClaimCandidate = {
      recordRefs: [recordId('rec_sqlite_1'), recordId('rec_sqlite_2')],
      comparisonAxis: {
        question: '两次记录是否都从具体动作开始？',
        dimension: '行动启动顺序',
      },
      relationType: 'action_sequence',
      evidenceSummary: '两条记录都从一个具体动作开始。',
      assertsTemporalOrdering: false,
    };

    try {
      const firstGraph = createCoreSqliteComposition(path, {
        ids: new SqliteFlowIds(),
        hash: (value) => `sqlite-flow:${value}`,
        judgment: new DeterministicSemanticJudgmentAdapter({
          candidates: [candidate],
        }),
      });
      expect(firstGraph.ai.enabled).toBe(false);
      const first = await executeCapture(firstGraph.ingestion, {
        verbatim: '我先写下第一步。',
        submissionId: '123e4567-e89b-42d3-a456-426614174101',
        submittedAt: new Date('2026-09-13T01:00:00.000Z'),
        capturedAt: new Date('2026-09-13T01:00:01.000Z'),
      });
      const second = await executeCapture(firstGraph.ingestion, {
        verbatim: '我再次先做了最小动作。',
        submissionId: '123e4567-e89b-42d3-a456-426614174102',
        submittedAt: new Date('2026-09-13T01:01:00.000Z'),
        capturedAt: new Date('2026-09-13T01:01:01.000Z'),
      });
      if (!first.ok || !second.ok) throw new Error('SQLite capture failed');

      const relation = await firstGraph.relations.evaluate({
        recordRefs: [recordId(first.value.recordId), recordId(second.value.recordId)],
        subject: {
          topicTags: [],
          source: 'sqlite-flow',
          relationAxes: ['行动启动顺序'],
          userSelectedRefs: [first.value.recordId, second.value.recordId],
          createdAt: new Date('2026-09-13T01:02:00.000Z'),
        },
        baselineContext: {
          hasReliablePersonalBaseline: true,
          recordSuppliesInternalBaseline: false,
        },
        now: new Date('2026-09-13T01:02:00.000Z'),
      });
      const claim = relation.persisted[0];
      if (claim === undefined) throw new Error('SQLite relation failed');

      expect(
        await firstGraph.discovery.listStream({
          now: new Date('2026-09-13T01:03:00.000Z'),
          relationLimit: 10,
        }),
      ).toHaveLength(1);
      const reflected = await firstGraph.reflectionFlow.respondToRelation({
        targetRef: claim.id,
        feedback: {
          response: null,
          freeText: '这条关系值得我继续观察。',
          leaveForNow: false,
          userInitiatedContinuation: false,
        },
        now: new Date('2026-09-13T01:04:00.000Z'),
      });
      expect(reflected?.recordId).not.toBeNull();
      firstGraph.storage.close();

      const restarted = createCoreSqliteComposition(path);
      expect(await restarted.records.listRecent({ limit: 10 })).toHaveLength(3);
      expect(await restarted.records.search({ query: '继续观察', limit: 10 }))
        .toHaveLength(1);
      expect(await restarted.storage.relationClaims.listAll(10)).toHaveLength(1);
      expect(
        await restarted.discovery.listStream({
          now: new Date('2026-09-13T01:05:00.000Z'),
          relationLimit: 10,
        }),
      ).toHaveLength(1);
      if (reflected?.recordId === null || reflected === null) {
        throw new Error('SQLite reflection failed');
      }
      const episodes = await restarted.storage.reflectionEpisodes.listByTarget(
        claim.id,
      );
      expect(episodes).toHaveLength(1);
      expect(episodes[0]?.targetRef).toBe(claim.id);
      expect(
        await restarted.storage.userReflectionRecords.listByEpisode(
          episodes[0]!.id,
        ),
      ).toEqual([
        expect.objectContaining({
          recordId: reflected.recordId,
          episodeRef: episodes[0]!.id,
        }),
      ]);
      expect(
        (await restarted.records.getReflectionContext(reflected.recordId))
          ?.meaningHistory,
      ).toHaveLength(1);
      expect(
        await restarted.reflectionFlow.getRelationTarget(
          claim.id,
          new Date('2026-09-13T01:06:00.000Z'),
        ),
      ).toEqual(
        expect.objectContaining({
          userPosition: 'none',
          reflections: [
            expect.objectContaining({
              recordId: reflected.recordId,
              verbatim: '这条关系值得我继续观察。',
            }),
          ],
        }),
      );
      restarted.storage.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
