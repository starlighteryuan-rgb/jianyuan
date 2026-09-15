import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  EVIDENCE_DIMENSIONS,
  recordId,
} from '../packages/core/index';
import { OpenAICompatibleProvider } from '../packages/providers/ai/index';
import {
  createCoreSqliteComposition,
  type CoreIdGenerator,
} from '@/server/capture-composition-root';
import { executeCapture } from '@/server/capture-use-case';
import {
  RelationCandidateRegistry,
  submitAIObservationReflection,
  suggestRelationsAfterCapture,
} from '@/server/ai-core-experience';

class AIFlowIds implements CoreIdGenerator {
  private sequences = new Map<string, number>();
  private next(prefix: string): string {
    const value = (this.sequences.get(prefix) ?? 0) + 1;
    this.sequences.set(prefix, value);
    return prefix + '_ai_' + value;
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

const completion = (value: unknown): Response =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(value) } }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

const providerWith = (fetcher: typeof fetch): OpenAICompatibleProvider =>
  new OpenAICompatibleProvider(
    {
      providerId: 'integration-provider',
      baseUrl: 'https://ai.example.test/v1',
      apiKey: 'integration-secret',
      model: 'manual-integration-model',
      timeoutMs: 100,
    },
    fetcher,
  );

describe('AI Provider + SQLite Core graph', () => {
  it('runs the AI-enabled relation and reflection invitation without bypassing Core', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'jianyuan-ai-sqlite-'));
    const path = join(directory, 'core.sqlite');
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: string }>;
      };
      const system = request.messages[0]?.content ?? '';
      if (system.includes('suggest tentative')) {
        return completion({
          suggestions: [
            {
              recordRefs: ['rec_ai_1', 'rec_ai_2'],
              comparisonAxis: {
                question: '两次记录是否都由一个最小动作启动？',
                dimension: '行动启动顺序',
              },
              relationType: 'possible_action_sequence',
              evidenceSummary: '两条记录都描述先执行一个最小动作。',
              assertsTemporalOrdering: false,
            },
          ],
        });
      }
      if (system.includes('operational comparability')) {
        return completion({
          operationallySpecific: true,
          sameNature: true,
          onlySharedCategory: false,
          explanation: '比较轴指向同一种可观察的行动启动顺序。',
        });
      }
      if (system.includes('abstraction ceiling')) {
        return completion({
          prohibitedClaimDetected: false,
          category: null,
          explanation: '候选只描述记录中的行动顺序。',
        });
      }
      if (system.includes('six evidence dimensions')) {
        return completion({
          judgments: EVIDENCE_DIMENSIONS.map((dimension) => ({
            dimension,
            status: 'scored',
            score: 2,
            reason: '记录直接支持该维度的中等强度判断。',
          })),
        });
      }
      if (system.includes('reflection invitation')) {
        return completion({ question: '这个可能的关系值得你继续观察吗？' });
      }
      throw new Error('unexpected AI prompt');
    });
    const provider = providerWith(fetcher as unknown as typeof fetch);

    try {
      const graph = createCoreSqliteComposition(path, {
        ids: new AIFlowIds(),
        hash: (value) => 'ai-flow:' + value,
        aiRuntime: { provider, judgment: provider },
      });
      const first = await executeCapture(graph.ingestion, {
        verbatim: '我先打开文档并写下一行。',
        submissionId: '123e4567-e89b-42d3-a456-426614174201',
        submittedAt: new Date('2026-09-14T01:00:00.000Z'),
        capturedAt: new Date('2026-09-14T01:00:01.000Z'),
      });
      const second = await executeCapture(graph.ingestion, {
        verbatim: '我先整理一个最小任务再继续。',
        submissionId: '123e4567-e89b-42d3-a456-426614174202',
        submittedAt: new Date('2026-09-14T01:01:00.000Z'),
        capturedAt: new Date('2026-09-14T01:01:01.000Z'),
      });
      if (!first.ok || !second.ok) throw new Error('capture failed');

      const registry = new RelationCandidateRegistry(
        () => 'candidate_ai_1',
        () => new Date('2026-09-14T01:02:00.000Z').getTime(),
      );
      const suggestion = await suggestRelationsAfterCapture(
        graph,
        second.value.recordId,
        registry,
      );
      expect(suggestion.status).toBe('candidates');
      if (suggestion.status !== 'candidates') throw new Error('no candidate');

      // A visible AI candidate is still only transient proposal data.
      expect(await graph.storage.relationClaims.listAll(10)).toHaveLength(0);
      expect(
        await graph.discovery.listStream({
          now: new Date('2026-09-14T01:02:00.000Z'),
          relationLimit: 10,
        }),
      ).toHaveLength(0);
      expect(suggestion.candidates[0]).not.toHaveProperty('evidence');
      expect(suggestion.candidates[0]).not.toHaveProperty('supportLevel');

      expect(suggestion.candidates[0]).toMatchObject({
        observation: '两条记录都描述先执行一个最小动作。',
        possibleExplanation: expect.stringContaining('一种可能是'),
        uncertainty: expect.stringContaining('无法判断'),
        reflectionQuestion: '两次记录是否都由一个最小动作启动？',
        referencedRecords: expect.arrayContaining([
          expect.objectContaining({ verbatim: '我先打开文档并写下一行。' }),
          expect.objectContaining({ verbatim: '我先整理一个最小任务再继续。' }),
        ]),
      });

      // A visible observation remains disposable until the user writes their own meaning.
      const withoutText = await submitAIObservationReflection(
        graph,
        {
          candidateId: suggestion.candidates[0]!.candidateId,
          meaning: 'connected',
          now: new Date('2026-09-14T01:02:00.000Z'),
        },
        registry,
      );
      expect(withoutText.status).toBe('reflection_required');
      expect(await graph.storage.relationClaims.listAll(10)).toHaveLength(0);

      const discarded = await submitAIObservationReflection(
        graph,
        {
          candidateId: suggestion.candidates[0]!.candidateId,
          meaning: 'not_my_experience',
          now: new Date('2026-09-14T01:02:30.000Z'),
        },
        registry,
      );
      expect(discarded.status).toBe('discarded');
      expect(await graph.storage.relationClaims.listAll(10)).toHaveLength(0);

      // A fresh observation plus free text is the only path that reaches Core.
      const secondSuggestion = await suggestRelationsAfterCapture(
        graph,
        second.value.recordId,
        registry,
      );
      expect(secondSuggestion.status).toBe('candidates');
      if (secondSuggestion.status !== 'candidates') throw new Error('no second candidate');
      const reflected = await submitAIObservationReflection(
        graph,
        {
          candidateId: secondSuggestion.candidates[0]!.candidateId,
          meaning: 'different_understanding',
          reflectionText: '我愿意继续观察，但暂时不把它当成结论。',
          now: new Date('2026-09-14T01:04:00.000Z'),
        },
        registry,
      );
      expect(reflected.status).toBe('discovery');
      if (reflected.status !== 'discovery') throw new Error('no discovery');
      expect(reflected.reflectionRecordId).toBeTruthy();
      expect(await graph.storage.relationClaims.listAll(10)).toHaveLength(1);
      graph.storage.close();

      const restarted = createCoreSqliteComposition(path);
      expect(restarted.ai.enabled).toBe(false);
      expect(await restarted.records.listRecent({ limit: 10 })).toHaveLength(3);
      expect(await restarted.storage.relationClaims.listAll(10)).toHaveLength(1);
      expect(
        await restarted.discovery.listStream({
          now: new Date('2026-09-14T01:05:00.000Z'),
          relationLimit: 10,
        }),
      ).toHaveLength(1);
      restarted.storage.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps SQLite records intact when the AI endpoint fails', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'jianyuan-ai-failure-'));
    const path = join(directory, 'core.sqlite');
    const provider = providerWith(
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'do not expose this body' }), {
          status: 500,
        }),
      ) as unknown as typeof fetch,
    );

    try {
      const graph = createCoreSqliteComposition(path, {
        ids: new AIFlowIds(),
        hash: (value) => 'ai-failure:' + value,
        aiRuntime: { provider, judgment: provider },
      });
      const first = await executeCapture(graph.ingestion, {
        verbatim: '前一条记录提供有限的候选上下文。',
        submissionId: '123e4567-e89b-42d3-a456-426614174204',
        submittedAt: new Date('2026-09-14T01:59:00.000Z'),
        capturedAt: new Date('2026-09-14T01:59:01.000Z'),
      });
      const capture = await executeCapture(graph.ingestion, {
        verbatim: '这条原始记录不能因 AI 失败而丢失。',
        submissionId: '123e4567-e89b-42d3-a456-426614174203',
        submittedAt: new Date('2026-09-14T02:00:00.000Z'),
        capturedAt: new Date('2026-09-14T02:00:01.000Z'),
      });
      if (!first.ok || !capture.ok) throw new Error('capture failed');

      const failed = await suggestRelationsAfterCapture(
        graph,
        capture.value.recordId,
        new RelationCandidateRegistry(),
      );
      expect(failed).toMatchObject({ status: 'unavailable', candidates: [] });
      graph.storage.close();

      const restarted = createCoreSqliteComposition(path);
      expect(
        await restarted.records.getById(recordId(capture.value.recordId)),
      ).not.toBeNull();
      restarted.storage.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
