import {
  EVIDENCE_DIMENSIONS,
  IngestionService,
  ReflectionService,
  assessEvidence,
  buildStoredClaim,
  relationClaimId,
  type CoreStoragePorts,
  type DimensionJudgments,
} from '../../../core/index';

type UseCaseStorage = Pick<
  CoreStoragePorts,
  | 'records'
  | 'roles'
  | 'lineage'
  | 'directives'
  | 'ingestion'
  | 'relationClaims'
  | 'stateAssignments'
  | 'reflectionPreferences'
  | 'reflectionEpisodes'
  | 'userReflectionRecords'
>;

const runAwarenessUseCase = async (storage: UseCaseStorage) => {
  let recordSequence = 0;
  let reflectionSequence = 0;

  const ingestion = new IngestionService({
    records: storage.records,
    roles: storage.roles,
    lineage: storage.lineage,
    directives: storage.directives,
    commit: storage.ingestion,
    hash: (value) => `memory-hash:${value}`,
    ids: {
      nextRecordId: () => `memory-record-${++recordSequence}`,
      nextEvidenceUnitId: () => `memory-evidence-${recordSequence}`,
      nextLineageEdgeId: () => `memory-lineage-${recordSequence}`,
    },
  });

  const capturedAt = new Date('2026-09-13T00:00:00.000Z');
  const captured = await ingestion.ingest({
    origin: 'user_reported',
    actor: 'user',
    sourceRef: 'phase-3.2:record-1',
    verbatim: '我先把任务拆成一个具体动作。',
    language: 'zh',
    time: { semantic: 'capture_time', at: capturedAt },
    epistemicRoles: ['user_expression'],
    capturedAt,
    derivation: null,
    subject: {
      topicTags: [],
      source: 'phase-3.2',
      relationAxes: [],
      userSelectedRefs: [],
    },
  });
  if (!captured.ok) throw new Error(`capture failed: ${captured.error.kind}`);

  const storedRecord = await storage.records.findById(captured.value.recordId);
  if (storedRecord === null) throw new Error('record was not stored');

  const judgments = Object.fromEntries(
    EVIDENCE_DIMENSIONS.map((dimension) => [
      dimension,
      { status: 'scored' as const, score: 2 as const, reason: 'storage contract' },
    ]),
  ) as DimensionJudgments;
  const assessment = assessEvidence(judgments);
  if (!assessment.ok) throw new Error('assessment failed');

  const relation = buildStoredClaim({
    id: relationClaimId('memory-relation-1'),
    candidate: {
      recordRefs: [storedRecord.id],
      comparisonAxis: {
        question: '记录是否描述从具体动作开始？',
        dimension: '行动启动顺序',
      },
      relationType: 'action_sequence',
      evidenceSummary: '原话描述了从具体动作开始。',
      assertsTemporalOrdering: false,
    },
    assessment: assessment.value,
    createdAt: new Date('2026-09-13T00:01:00.000Z'),
  });
  await storage.relationClaims.save(relation);
  const storedRelation = await storage.relationClaims.findById(relation.id);

  const reflection = new ReflectionService({
    episodes: storage.reflectionEpisodes,
    reflectionRecords: storage.userReflectionRecords,
    preferences: storage.reflectionPreferences,
    states: storage.stateAssignments,
    ingestion,
    ids: {
      nextReflectionEpisodeId: () => `memory-episode-${++reflectionSequence}`,
      nextUserReflectionRecordId: () => `memory-reflection-${reflectionSequence}`,
      nextStateAssignmentId: () => `memory-state-${reflectionSequence}`,
    },
  });
  const invitation = await reflection.invite({
    target: {
      targetType: 'relation_claim',
      targetRef: relation.id,
      relation,
      hypotheses: [],
    },
    now: new Date('2026-09-13T00:02:00.000Z'),
  });
  const response = await reflection.respond({
    episode: invitation.episode,
    feedback: {
      response: 'questioned',
      freeText: '我想继续观察这是不是稳定做法。',
      leaveForNow: false,
      userInitiatedContinuation: false,
    },
    subject: {
      topicTags: [],
      source: 'phase-3.2',
      relationAxes: ['行动启动顺序'],
      userSelectedRefs: [relation.id],
    },
    targetType: 'relation_claim',
    targetRef: relation.id,
    now: new Date('2026-09-13T00:03:00.000Z'),
  });
  if (response.recordId === null || response.reflectionRecord === null) {
    throw new Error('reflection was not stored');
  }
  const storedReflections = await storage.userReflectionRecords.listByRecord(
    response.recordId,
  );

  return {
    recordText: storedRecord.rawExpression?.verbatim ?? null,
    relationId: storedRelation?.id ?? null,
    reflectionText:
      (await storage.records.findById(response.recordId))?.rawExpression
        ?.verbatim ?? null,
    reflectionCount: storedReflections.length,
  };
};

export { runAwarenessUseCase, type UseCaseStorage };
