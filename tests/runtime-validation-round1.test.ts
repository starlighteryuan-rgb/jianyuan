/**
 * Runtime Validation Round 1.
 *
 * These are execution-level checks over the existing in-memory application
 * graph. They deliberately do not change production code or the existing test
 * suite. The fixtures are local copies of the approved RV1 Dataset
 * Specification because the repository contains no separate fixture module.
 */

import { describe, expect, it } from 'vitest';

import type { CaptureRequest } from '@/application/ingestion-service';
import type { EvaluateRequest } from '@/application/relation-service';
import type { HypothesisEvaluateRequest } from '@/application/hypothesis-service';
import type { DeterministicScript } from '@/infra/fake/deterministic-semantic-judgment';
import { DeterministicSemanticJudgment } from '@/infra/fake/deterministic-semantic-judgment';
import type { PersonalRecord } from '@/domain/record/record';
import type { StoredRelationClaim } from '@/domain/relation/relation-claim';
import type { StateAssignment } from '@/domain/state/state-assignment';
import type { Directive } from '@/domain/directive/directive';
import { buildStoredClaim } from '@/domain/relation/relation-claim';
import { buildStoredHypothesis, type HypothesisCandidate } from '@/domain/hypothesis/hypothesis';
import { deriveStableKey } from '@/domain/discovery/discovery';
import { createMemoryServices } from '@/server/container';
import {
  directiveId,
  discoveryId,
  evidenceUnitId,
  hypothesisId,
  recordId,
  relationClaimId,
  sourceFingerprint,
  stateAssignmentId,
} from '@/domain/shared/ids';

const T0 = new Date('2026-09-13T10:00:00.000Z');
const T1 = new Date('2026-09-13T10:05:00.000Z');

const rootCapture = (over: Partial<CaptureRequest> = {}): CaptureRequest => ({
  origin: 'user_reported',
  actor: 'user',
  sourceRef: 'capture-ui:rv1-capture-001',
  verbatim: '最近我在开始任务前经常先整理很久。',
  language: null,
  time: { semantic: 'capture_time', at: T0 },
  epistemicRoles: ['user_expression'],
  capturedAt: T0,
  derivation: null,
  subject: {
    topicTags: [],
    source: 'capture_ui',
    relationAxes: [],
    userSelectedRefs: [],
  },
  ...over,
});

const retryCapture = (over: Partial<CaptureRequest> = {}): CaptureRequest =>
  rootCapture({
    sourceRef: 'capture-ui:rv1-retry-002',
    verbatim: '我在压力大时会反复检查已经完成的内容。',
    ...over,
  });

const externalRecord: PersonalRecord = {
  id: recordId('rec-external-rv1'),
  sourceFingerprint: sourceFingerprint('fp-external-rv1'),
  evidenceUnitId: evidenceUnitId('eu-external-rv1'),
  epistemicRoles: ['external_reference'],
  provenance: {
    origin: 'imported',
    actor: 'platform',
    sourceRef: 'external:article:rv1',
    capturedAt: T0,
  },
  time: { semantic: 'capture_time', at: T0 },
  rawExpression: { verbatim: '外部文章中的经验描述。', language: 'zh' },
  createdAt: T0,
};

const personalRecord = (
  id: string,
  unit: string,
  text: string,
  at: Date,
): PersonalRecord => ({
  id: recordId(id),
  sourceFingerprint: sourceFingerprint(`fp-${id}`),
  evidenceUnitId: evidenceUnitId(unit),
  epistemicRoles: ['user_expression'],
  provenance: {
    origin: 'user_reported',
    actor: 'user',
    sourceRef: `capture-ui:${id}`,
    capturedAt: at,
  },
  time: { semantic: 'capture_time', at },
  rawExpression: { verbatim: text, language: 'zh' },
  createdAt: at,
});

const relationFixture = (id: string, createdAt = T0): StoredRelationClaim =>
  buildStoredClaim({
    id: relationClaimId(id),
    candidate: {
      recordRefs: [],
      comparisonAxis: {
        question: '开始任务前是否反复准备而推迟执行？',
        dimension: 'task_start_behavior',
      },
      relationType: 'pattern',
      evidenceSummary: '两条记录都描述了准备行为后实际执行被推迟。',
      assertsTemporalOrdering: false,
    },
    assessment: null,
    createdAt,
  });

const supportedRelationFixture = (
  records: readonly PersonalRecord[],
): StoredRelationClaim => ({
  ...relationFixture('rel-hyp-rv1', T1),
  recordRefs: records.map((record) => record.id),
  supportLevel: 'strong',
});

const hypothesisCandidate = (
  relation: StoredRelationClaim,
  records: readonly PersonalRecord[],
): HypothesisCandidate => ({
  explanation: '这可能只是逻辑上可能的解释，并没有证据主动指向它。',
  anchorRefs: [relation.id],
  anchorPath: 'supported_relation',
  patterns: [],
  supportBasis: 'compatibility_only',
  supportingRecordRefs: records.map((record) => record.id),
  explanatoryGain: {
    mechanism: '任务开始前的准备行为可能提供了一种暂时的安全感。',
    discriminatingPredictions: ['结构更强的任务应当更早开始。'],
  },
  alternatives: ['任务本身的模糊性可能比压力更重要。'],
  discriminatingEvidence: {
    wouldStrengthen: ['在结构清晰的任务中更早开始。'],
    wouldWeaken: ['在结构清晰的任务中仍然同样延迟。'],
  },
});

const directive = (
  id: string,
  targetRef: string,
  allowPassivePresentation: boolean,
): Directive => ({
  id: directiveId(id),
  allowAnalysis: true,
  allowStorage: true,
  allowPassivePresentation,
  allowProactivePresentation: false,
  appliesToFutureSimilar: false,
  scope: { kind: 'user_selected', value: targetRef },
  revokedAt: null,
  createdAt: new Date('2026-09-13T12:00:00.000Z'),
});

const relationState = (
  targetRef: string,
  over: Partial<StateAssignment> = {},
): StateAssignment => ({
  id: stateAssignmentId(`state-${targetRef}`),
  targetType: 'relation_claim',
  targetRef,
  userPosition: 'none',
  workflowState: 'active',
  presentationState: 'active',
  updatedAt: T1,
  ...over,
});

describe('Runtime Validation Round 1', () => {
  describe('RV1-CAPTURE-001', () => {
    it('creates one root Record with preserved wording and one Evidence Unit', async () => {
      const services = createMemoryServices();
      const result = await services.ingestion.ingest(rootCapture());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(!result.value.deduplicated).toBe(true);
      expect(result.value.deduplicated).toBe(false);

      const stored = await services.repositories.records.findById(result.value.recordId);
      expect(stored?.rawExpression?.verbatim).toBe(rootCapture().verbatim);
      expect(stored?.epistemicRoles).toEqual(['user_expression']);
      expect(stored?.evidenceUnitId).toBeDefined();
      expect(await services.repositories.lineage.directParents(result.value.recordId)).toEqual([]);
      expect(await services.repositories.claims.listAll(50)).toEqual([]);
      expect(await services.repositories.hypotheses.listAll()).toEqual([]);
    });
  });

  describe('RV1-RETRY-002', () => {
    it('reuses the same Record and Evidence identity for the same submission envelope', async () => {
      const services = createMemoryServices();
      const first = await services.ingestion.ingest(retryCapture());
      expect(first.ok).toBe(true);
      if (!first.ok) return;

      const storedFirst = await services.repositories.records.findById(first.value.recordId);
      const retry = await services.ingestion.ingest(
        retryCapture({ capturedAt: new Date('2026-09-13T10:05:30.000Z') }),
      );

      expect(retry.ok).toBe(true);
      if (!retry.ok || storedFirst === null) return;

      expect(!retry.value.deduplicated).toBe(false);
      expect(retry.value.deduplicated).toBe(true);
      expect(retry.value.recordId).toBe(first.value.recordId);

      const storedRetry = await services.repositories.records.findById(retry.value.recordId);
      expect(storedRetry?.sourceFingerprint).toBe(storedFirst.sourceFingerprint);
      expect(storedRetry?.evidenceUnitId).toBe(storedFirst.evidenceUnitId);
      expect(await services.repositories.records.listRecent(50)).toHaveLength(1);
      expect(await services.repositories.records.countDistinctEvidenceUnits([retry.value.recordId])).toBe(1);
    });
  });

  describe('RV1-RELATION-003', () => {
    it('rejects an External Reference at Gate 2 before semantic scoring', async () => {
      const judgment = new DeterministicSemanticJudgment({
        candidates: [{
          recordRefs: [externalRecord.id],
          comparisonAxis: { question: '用户是否表现出该模式？', dimension: 'behavioral_pattern' },
          relationType: 'pattern',
          evidenceSummary: '候选描述。',
          assertsTemporalOrdering: false,
        }],
      } satisfies DeterministicScript);
      const services = createMemoryServices({ judgment });
      await services.repositories.records.save(externalRecord);

      const request: EvaluateRequest = {
        recordRefs: [externalRecord.id],
        subject: {
          topicTags: [],
          source: 'runtime-validation',
          relationAxes: ['behavioral_pattern'],
          userSelectedRefs: [],
          createdAt: T1,
        },
        baselineContext: {
          hasReliablePersonalBaseline: false,
          recordSuppliesInternalBaseline: false,
        },
        now: T1,
      };

      const result = await services.relations.evaluate(request);
      expect(result.persisted).toEqual([]);
      expect(result.outcome.rejected).toHaveLength(1);
      expect(result.outcome.rejected[0]?.failures.some((failure) => failure.gate === 'epistemic_eligibility')).toBe(true);
      expect(judgment.calls.judgeComparability).toBe(0);
      expect(judgment.calls.judgeEvidenceDimensions).toBe(0);
      expect(await services.repositories.claims.listAll(50)).toEqual([]);
      expect(await services.repositories.hypotheses.listAll()).toEqual([]);
    });
  });

  describe('RV1-HYPOTHESIS-004', () => {
    it('rejects compatibility-only support at H2 without persisting a Hypothesis', async () => {
      const records = [
        personalRecord('rec-hyp-1', 'eu-hyp-1', '我花了很久整理，但没有开始任务。', T0),
        personalRecord('rec-hyp-2', 'eu-hyp-2', '这次我先列了很多计划，实际执行又推迟了。', T1),
      ] as const;
      const relation = supportedRelationFixture(records);
      const candidate = hypothesisCandidate(relation, records);
      const judgment = new DeterministicSemanticJudgment({
        hypotheses: [candidate],
        hypothesisAbstraction: { prohibitedClaimDetected: false, category: null },
      } satisfies DeterministicScript);
      const services = createMemoryServices({ judgment });

      for (const record of records) await services.repositories.records.save(record);
      await services.repositories.claims.save(relation);

      const request: HypothesisEvaluateRequest = {
        anchorClaimRefs: [relation.id],
        supportingRecordRefs: records.map((record) => record.id),
        now: new Date('2026-09-13T10:20:00.000Z'),
      };
      const result = await services.hypotheses.evaluate(request);

      expect(result.persisted).toEqual([]);
      expect(result.outcome.rejected).toHaveLength(1);
      expect(result.outcome.rejected[0]?.failures.some((failure) => failure.gate === 'positive_directional_support')).toBe(true);
      expect(result.outcome.rejected[0]?.failures.some((failure) => failure.code === 'support_basis_compatibility_only')).toBe(true);
      expect(judgment.calls.generateHypotheses).toBe(1);
      expect(await services.repositories.hypotheses.listAll()).toEqual([]);
    });
  });

  describe('RV1-DISCOVERY-005', () => {
    it('applies Directive, archive, and suspend presentation gating', async () => {
      const services = createMemoryServices();
      const claims = [
        relationFixture('rel-passive-forbidden'),
        relationFixture('rel-suspended'),
        relationFixture('rel-archived'),
        relationFixture('rel-visible'),
      ];
      for (const claim of claims) await services.repositories.claims.save(claim);

      await services.repositories.directives.save(
        directive('dir-passive-forbidden', 'rel-passive-forbidden', false),
      );
      await services.repositories.directives.save(
        directive('dir-suspended', 'rel-suspended', true),
      );
      await services.repositories.directives.save(
        directive('dir-archived', 'rel-archived', true),
      );
      await services.repositories.directives.save(
        directive('dir-visible', 'rel-visible', true),
      );

      await services.repositories.states.save(
        relationState('rel-suspended', { workflowState: 'suspended' }),
      );
      await services.repositories.states.save(
        relationState('rel-archived', {
          id: stateAssignmentId('state-disc-archived'),
          targetType: 'discovery',
          targetRef: discoveryId('disc-archived'),
          presentationState: 'archived',
        }),
      );

      await services.repositories.discoveries.ensure({
        id: discoveryId('disc-archived'),
        subjectRef: { type: 'relation_claim', id: 'rel-archived' },
        discoveryKind: 'relation_discovery',
        stableKey: deriveStableKey(
          { type: 'relation_claim', id: 'rel-archived' },
          'relation_discovery',
        ),
        createdAt: T0,
      });

      const stream = await services.discovery.listStream({ now: T1, relationLimit: 50 });
      const byId = new Map(
        stream.map((item) => [String(item.subject.id), item.projection]),
      );

      expect(byId.has('rel-passive-forbidden')).toBe(false);
      expect(byId.get('rel-visible')?.presentation.passiveEligible).toBe(true);
      expect(byId.get('rel-visible')?.presentation.proactiveEligible).toBe(false);

      expect(byId.has('rel-suspended')).toBe(false);
      expect(byId.has('rel-archived')).toBe(false);
      expect(await services.repositories.claims.findById(relationClaimId('rel-suspended'))).not.toBeNull();
      expect(await services.repositories.claims.findById(relationClaimId('rel-archived'))).not.toBeNull();
      expect(await services.repositories.discoveries.findById(discoveryId('disc-archived'))).not.toBeNull();
    });
  });
});
