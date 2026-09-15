import { describe, expect, it } from 'vitest';

import {
  EVIDENCE_DIMENSIONS,
  IngestionService,
  assessEvidence,
  buildInvitation,
  buildStoredClaim,
  directiveId,
  evidenceUnitId,
  ok,
  projectSubject,
  relationClaimId,
  resolveEffectivePermissions,
  routeFeedback,
  type CoreEvent,
  type Directive,
  type DirectiveRepository,
  type DimensionJudgments,
  type ExternalReferenceProvider,
  type IngestionCommitRepository,
  type IngestionPlan,
  type LineageEdge,
  type LineageRepository,
  type PersonalRecord,
  type RecordEpistemicRoleRepository,
  type RecordRepository,
} from '../index';

class MemoryBoundaryStorage
  implements
    RecordRepository,
    RecordEpistemicRoleRepository,
    IngestionCommitRepository
{
  readonly records = new Map<string, PersonalRecord>();
  readonly roles = new Map<string, Set<PersonalRecord['epistemicRoles'][number]>>();
  readonly lineage: LineageEdge[] = [];
  readonly directives: Directive[] = [];

  async findById(id: PersonalRecord['id']): Promise<PersonalRecord | null> {
    return this.records.get(id) ?? null;
  }

  async findBySourceFingerprint(
    fingerprint: PersonalRecord['sourceFingerprint'],
  ): Promise<PersonalRecord | null> {
    return [...this.records.values()].find(
      (record) => record.sourceFingerprint === fingerprint,
    ) ?? null;
  }

  async findByEvidenceUnit(
    unitId: PersonalRecord['evidenceUnitId'],
  ): Promise<readonly PersonalRecord[]> {
    return [...this.records.values()].filter(
      (record) => record.evidenceUnitId === unitId,
    );
  }

  async countDistinctEvidenceUnits(
    ids: readonly PersonalRecord['id'][],
  ): Promise<number> {
    return new Set(
      ids.map((id) => this.records.get(id)?.evidenceUnitId).filter(Boolean),
    ).size;
  }

  async listRecent(limit: number): Promise<readonly PersonalRecord[]> {
    return [...this.records.values()]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit);
  }

  async searchText(
    query: string,
    limit: number,
  ): Promise<readonly PersonalRecord[]> {
    return (await this.listRecent(limit)).filter((record) =>
      (record.rawExpression?.verbatim ?? '').includes(query),
    );
  }

  async save(record: PersonalRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async listRoles(
    recordIdValue: PersonalRecord['id'],
  ): Promise<readonly PersonalRecord['epistemicRoles'][number][]> {
    return [...(this.roles.get(recordIdValue) ?? [])];
  }

  async addRole(assignment: {
    readonly recordId: PersonalRecord['id'];
    readonly role: PersonalRecord['epistemicRoles'][number];
  }): Promise<void> {
    const roles = this.roles.get(assignment.recordId) ?? new Set();
    roles.add(assignment.role);
    this.roles.set(assignment.recordId, roles);
  }

  async directParents(childId: PersonalRecord['id']): Promise<readonly LineageEdge[]> {
    return this.lineage.filter((edge) => edge.childId === childId);
  }

  async saveLineage(edge: LineageEdge): Promise<void> {
    this.lineage.push(edge);
  }

  async findByDirectiveId(id: Directive['id']): Promise<Directive | null> {
    return this.directives.find((directive) => directive.id === id) ?? null;
  }

  async listActive(): Promise<readonly Directive[]> {
    return this.directives.filter((directive) => directive.revokedAt === null);
  }

  async saveDirective(directive: Directive): Promise<void> {
    this.directives.push(directive);
  }

  async revoke(id: Directive['id'], at: Date): Promise<void> {
    const index = this.directives.findIndex((directive) => directive.id === id);
    const current = this.directives[index];
    if (current !== undefined) this.directives[index] = { ...current, revokedAt: at };
  }

  async commit(plan: IngestionPlan): Promise<void> {
    if (plan.kind === 'create') this.records.set(plan.record.id, plan.record);
    const recordIdValue =
      plan.kind === 'create' ? plan.record.id : plan.recordId;
    for (const role of plan.rolesToAdd) {
      await this.addRole({ recordId: recordIdValue, role });
    }
    if (plan.lineageEdge !== null) {
      this.lineage.push({
        ...plan.lineageEdge,
        createdAt:
          plan.kind === 'create' ? plan.record.createdAt : new Date(0),
      });
    }
  }
}

const sha256Double = (value: string): string => `hash:${value}`;

describe('formal Shared Core package boundary', () => {
  it('runs Record to Relation to Discovery to Reflection without platform dependencies', async () => {
    const storage = new MemoryBoundaryStorage();
    let sequence = 0;
    const ingestion = new IngestionService({
      records: storage,
      roles: storage,
      lineage: {
        directParents: storage.directParents.bind(storage),
        save: storage.saveLineage.bind(storage),
      },
      directives: {
        findById: storage.findByDirectiveId.bind(storage),
        listActive: storage.listActive.bind(storage),
        save: storage.saveDirective.bind(storage),
        revoke: storage.revoke.bind(storage),
      },
      commit: storage,
      hash: sha256Double,
      ids: {
        nextRecordId: () => `record-${++sequence}`,
        nextEvidenceUnitId: () => `evidence-${sequence}`,
        nextLineageEdgeId: () => `lineage-${sequence}`,
      },
    });

    const capture = async (text: string, at: Date) => ingestion.ingest({
      origin: 'user_reported',
      actor: 'user',
      sourceRef: `core-test:${text}`,
      verbatim: text,
      language: 'zh',
      time: { semantic: 'capture_time', at },
      epistemicRoles: ['user_expression'],
      capturedAt: at,
      derivation: null,
      subject: {
        topicTags: [],
        source: 'core-test',
        relationAxes: [],
        userSelectedRefs: [],
      },
    });

    const first = await capture(
      '我先把任务拆成一个具体的下一步。',
      new Date('2026-01-01T00:00:00.000Z'),
    );
    const second = await capture(
      '面对新的任务时，我又先写下了最小动作。',
      new Date('2026-02-01T00:00:00.000Z'),
    );
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('capture failed');

    const judgments = Object.fromEntries(
      EVIDENCE_DIMENSIONS.map((dimension) => [
        dimension,
        { status: 'scored' as const, score: 2 as const, reason: 'boundary test' },
      ]),
    ) as DimensionJudgments;
    const assessment = assessEvidence(judgments);
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) throw new Error('assessment failed');

    const relation = buildStoredClaim({
      id: relationClaimId('relation-1'),
      candidate: {
        recordRefs: [first.value.recordId, second.value.recordId],
        comparisonAxis: {
          question: '两次记录是否都从具体下一步开始行动？',
          dimension: '行动启动顺序',
        },
        relationType: 'repeated_action_sequence',
        evidenceSummary: '两条原话都描述了从拆分下一步开始行动。',
        assertsTemporalOrdering: false,
      },
      assessment: assessment.value,
      createdAt: new Date('2026-02-02T00:00:00.000Z'),
    });
    const discovery = projectSubject({
      subject: {
        subjectRef: { type: 'relation_claim', id: relation.id },
        discoveryKind: 'relation_discovery',
        identityExistedBefore: false,
        resolvedTimePoints: [
          new Date('2026-01-01T00:00:00.000Z'),
          new Date('2026-02-01T00:00:00.000Z'),
        ],
        archived: false,
        suspended: false,
        allowPassivePresentation: true,
        allowProactivePresentation: false,
      },
      discoveryId: 'discovery-1',
      focusContexts: [],
      now: new Date('2026-02-02T00:00:00.000Z'),
    });
    const invitation = buildInvitation({
      targetRef: relation.id,
      relation,
      hypotheses: [],
      visibility: 'shown',
      density: 'brief',
    });
    const reflection = routeFeedback({
      response: 'questioned',
      freeText: '我想先继续观察。',
      leaveForNow: false,
      userInitiatedContinuation: false,
    });

    expect(relation.assessment?.supportLevel).toBe('observed');
    expect(discovery.discovery.subjectRef.type).toBe('relation_claim');
    expect(invitation.exits).toHaveLength(3);
    expect(reflection.createsReflectionRecord).toBe(true);
  });

  it('keeps storage, AI, and external reference behind Core-owned interfaces', async () => {
    const directive: Directive = {
      id: directiveId('directive-1'),
      allowAnalysis: true,
      allowStorage: true,
      allowPassivePresentation: false,
      allowProactivePresentation: false,
      appliesToFutureSimilar: true,
      scope: null,
      revokedAt: null,
      createdAt: new Date(0),
    };
    const permissions = resolveEffectivePermissions([directive], {
      topicTags: [],
      source: 'core-test',
      relationAxes: ['行动启动顺序'],
      userSelectedRefs: ['relation-1'],
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
    });

    const provider: ExternalReferenceProvider = {
      providerId: 'memory-external-reference',
      search: async () => ok({ references: [], continuationToken: null }),
    };
    const providerResult = await provider.search({
      query: '如何面对卡住',
      kind: 'experience',
    });
    const event: CoreEvent<'record.captured', { readonly evidenceUnitId: string }> = {
      id: 'event-1',
      type: 'record.captured',
      occurredAt: new Date(0),
      payload: { evidenceUnitId: evidenceUnitId('evidence-1') },
    };

    expect(permissions.allowPassivePresentation).toBe(false);
    expect(providerResult.ok).toBe(true);
    expect(event.type).toBe('record.captured');
  });
});
