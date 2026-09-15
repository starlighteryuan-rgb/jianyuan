import { resolveEffectivePermissions, type DirectiveSubject, type EffectivePermissions } from '../../src/domain/directive/directive-resolution';
import type { Directive } from '../../src/domain/directive/directive';
import { projectSubject, type DiscoveryProjection } from '../../src/domain/discovery/discovery-projection';
import type { Discovery } from '../../src/domain/discovery/discovery';
import { assessEvidence, type EvidenceAssessment } from '../../src/domain/relation/evidence-score';
import { EVIDENCE_DIMENSIONS, type DimensionJudgments } from '../../src/domain/relation/evidence-dimensions';
import { buildStoredClaim, type RelationClaimCandidate, type StoredRelationClaim } from '../../src/domain/relation/relation-claim';
import { buildInvitation, type ReflectionInvitation } from '../../src/domain/reflection/reflection-invitation';
import { routeFeedback, type ReflectionFeedback, type RoutingDecision } from '../../src/domain/reflection/response-routing';
import type { PersonalRecord } from '../../src/domain/record/record';
import type { UserReflectionRecord } from '../../src/domain/reflection/user-reflection-record';
import { directiveId, discoveryId, evidenceUnitId, recordId, relationClaimId, userReflectionRecordId } from '../../src/domain/shared/ids';

export interface CoreSpikeState {
  readonly records: Map<PersonalRecord['id'], PersonalRecord>;
  readonly relations: Map<StoredRelationClaim['id'], StoredRelationClaim>;
  readonly discoveries: Map<Discovery['id'], Discovery>;
  readonly reflections: UserReflectionRecord[];
  readonly directives: Directive[];
}

export const createCoreSpikeState = (): CoreSpikeState => ({ records: new Map(), relations: new Map(), discoveries: new Map(), reflections: [], directives: [] });

const assessmentForSpike = (): EvidenceAssessment => {
  const judgments = Object.fromEntries(EVIDENCE_DIMENSIONS.map((dimension) => [dimension, { status: 'scored' as const, score: 2 as const, reason: 'spike judgment' }])) as DimensionJudgments;
  const result = assessEvidence(judgments);
  if (!result.ok) throw new Error('Spike assessment failed');
  return result.value;
};

export const createRecord = (state: CoreSpikeState, input: { readonly id: string; readonly text: string; readonly at: Date }): PersonalRecord => {
  const record: PersonalRecord = {
    id: recordId(input.id), sourceFingerprint: input.id as PersonalRecord['sourceFingerprint'], evidenceUnitId: evidenceUnitId('unit:' + input.id),
    epistemicRoles: ['user_expression'], provenance: { origin: 'user_reported', actor: 'user', sourceRef: 'core-spike:' + input.id, capturedAt: input.at },
    time: { semantic: 'capture_time', at: input.at }, rawExpression: { verbatim: input.text, language: 'zh' }, createdAt: input.at,
  };
  state.records.set(record.id, record); return record;
};

export const createRelation = (state: CoreSpikeState, input: { readonly id: string; readonly recordRefs: readonly PersonalRecord['id'][] }): StoredRelationClaim => {
  const candidate: RelationClaimCandidate = { recordRefs: input.recordRefs, comparisonAxis: { question: '两次记录是否都从具体下一步开始行动？', dimension: '行动启动顺序' }, relationType: 'repeated_action_sequence', evidenceSummary: '两条原话都描述了从拆分下一步开始行动。', assertsTemporalOrdering: false };
  const claim = buildStoredClaim({ id: relationClaimId(input.id), candidate, assessment: assessmentForSpike(), createdAt: new Date() });
  state.relations.set(claim.id, claim); return claim;
};

export const generateDiscoveryCandidate = (state: CoreSpikeState, relation: StoredRelationClaim, now: Date): DiscoveryProjection => {
  const projection = projectSubject({ subject: { subjectRef: { type: 'relation_claim', id: relation.id }, discoveryKind: 'relation_discovery', identityExistedBefore: false, resolvedTimePoints: relation.recordRefs.map((ref) => state.records.get(ref)?.time).filter((time): time is { readonly semantic: 'capture_time'; readonly at: Date } => time?.semantic === 'capture_time').map((time) => time.at), archived: false, suspended: false, allowPassivePresentation: true, allowProactivePresentation: false }, discoveryId: 'discovery:' + relation.id, focusContexts: [], now });
  state.discoveries.set(projection.discovery.id, projection.discovery); return projection;
};

export const completeReflection = (state: CoreSpikeState, targetRef: string, feedback: ReflectionFeedback, now: Date): { readonly invitation: ReflectionInvitation; readonly decision: RoutingDecision; readonly reflection: UserReflectionRecord | null } => {
  const invitation = buildInvitation({ targetRef, relation: state.relations.get(relationClaimId(targetRef)) ?? null, hypotheses: [], visibility: 'shown', density: 'brief' });
  const decision = routeFeedback(feedback);
  const reflectionRecord = decision.captureText === null ? null : createRecord(state, { id: 'reflection-record:' + state.reflections.length, text: decision.captureText, at: now });
  const reflection = reflectionRecord === null ? null : { id: userReflectionRecordId('reflection:' + targetRef + ':' + state.reflections.length), recordId: reflectionRecord.id, meaningCommitment: decision.meaningCommitment, validAtTime: { semantic: 'observation_time' as const, at: now }, currentEffect: 'current' as const, supersededByRef: null, supersededAt: null, episodeRef: null, createdAt: now };
  if (reflection !== null) state.reflections.push(reflection);
  return { invitation, decision, reflection };
};

export const applyDirective = (state: CoreSpikeState, subject: DirectiveSubject): EffectivePermissions => resolveEffectivePermissions(state.directives, subject);

export const makeGlobalDirective = (id: string, permissions: Omit<Directive, 'id' | 'createdAt' | 'revokedAt' | 'scope' | 'appliesToFutureSimilar'>): Directive => ({ id: directiveId(id), ...permissions, appliesToFutureSimilar: true, scope: null, revokedAt: null, createdAt: new Date(0) });
