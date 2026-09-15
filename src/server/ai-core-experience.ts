import { randomUUID } from 'node:crypto';

import {
  recordId,
  resolveEffectivePermissions,
  type Directive,
  type RecordReadModel,
} from '../../packages/core/index';
import type {
  AIProviderErrorKind,
  RelationSuggestion,
  RelationSuggestionResult,
} from '../../packages/providers/ai/index';
import type { CoreComposition } from './capture-composition-root';

const MAX_RELATION_CONTEXT_RECORDS = 5;
const MAX_RELATION_CONTEXT_CHARS = 8_000;
const MAX_RECORD_CONTEXT_CHARS = 2_000;
const MAX_VISIBLE_CANDIDATES = 2;
const MAX_REFLECTION_CONTEXT_RECORDS = 6;
const MAX_REFLECTION_CONTEXT_CHARS = 8_000;
const CANDIDATE_TTL_MS = 15 * 60 * 1000;
const MAX_TRANSIENT_CANDIDATES = 50;

export interface CandidateRecordView {
  readonly id: string;
  readonly verbatim: string;
  readonly createdAt: string;
}

/** Presentation-only vocabulary for the user's view of a provider response. */
export interface AIObservationView {
  readonly observation: string;
  readonly referencedRecords: readonly CandidateRecordView[];
  readonly possibleExplanation: string;
  readonly uncertainty: string;
  readonly reflectionQuestion: string;
}

/**
 * Internal transport keeps the old name for compatibility, while exposing a
 * presentation-safe Observation view to Web/Desktop. The Provider contract is
 * intentionally unchanged.
 */
export interface RelationCandidateView extends AIObservationView {
  readonly candidateId: string;
  readonly currentRecord: CandidateRecordView;
  readonly relatedRecords: readonly CandidateRecordView[];
  readonly question: string;
  readonly dimension: string;
  readonly explanation: string;
}

export type RelationSuggestionExperience =
  | {
      readonly status: 'candidates';
      readonly message: string;
      readonly candidates: readonly RelationCandidateView[];
    }
  | {
      readonly status:
        | 'disabled'
        | 'not_permitted'
        | 'not_enough_context'
        | 'no_candidate'
        | 'unavailable';
      readonly message: string;
      readonly candidates: readonly [];
    };

/** Observation stays transient until user meaning reaches the existing Core gates. */
export type CandidateDecision =
  | 'worth_reviewing'
  | 'uncertain'
  | 'not_applicable'
  | 'later'
  /** Backward-compatible transport value used by older clients. */
  | 'ignore';

/** A user's meaning-making stance, never an approval of the AI. */
export type ObservationMeaning =
  | 'connected'
  | 'different_understanding'
  | 'not_my_experience';

export interface AIInsightAuditEntry {
  readonly timestamp: string;
  readonly provider: string;
  readonly model: string | null;
  readonly inputRecordIds: readonly string[];
  readonly outcome: string;
  readonly errorType?: AIProviderErrorKind;
}

/** Small in-memory audit seam; it intentionally stores metadata, never text. */
export class AIInsightAuditLog {
  private readonly entries: AIInsightAuditEntry[] = [];

  append(entry: AIInsightAuditEntry): void {
    this.entries.push(entry);
    if (this.entries.length > 200) this.entries.splice(0, this.entries.length - 200);
  }

  list(): readonly AIInsightAuditEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }
}

const globalForAIInsightAudit = globalThis as unknown as {
  jianyuanAIInsightAudit: AIInsightAuditLog | undefined;
};

export const getAIInsightAuditLog = (): AIInsightAuditLog => {
  const existing = globalForAIInsightAudit.jianyuanAIInsightAudit;
  if (existing !== undefined) return existing;
  const created = new AIInsightAuditLog();
  globalForAIInsightAudit.jianyuanAIInsightAudit = created;
  return created;
};

export type CandidateDecisionResult =
  | { readonly status: 'idle' }
  | {
      readonly status: 'uncertain' | 'ignored' | 'not_applicable' | 'later';
      readonly message: string;
    }
  | {
      readonly status: 'discovery';
      readonly message: string;
      readonly targetRef: string;
      readonly discoveryId: string;
      readonly reflectionRecordId?: string;
    }
  | {
      readonly status:
        | 'reflection_required'
        | 'discarded'
        | 'not_admitted'
        | 'expired'
        | 'unavailable';
      readonly message: string;
    };

export type AIReflectionInvitation =
  | {
      readonly status: 'ready';
      readonly question: string;
      readonly message: string;
    }
  | {
      readonly status:
        | 'disabled'
        | 'preference_disabled'
        | 'not_permitted'
        | 'unavailable';
      readonly question: null;
      readonly message: string;
    };

interface StoredRelationCandidate {
  readonly candidateId: string;
  readonly currentRecordId: string;
  readonly suggestion: RelationSuggestion;
  readonly createdAt: Date;
  readonly expiresAt: number;
}

export class RelationCandidateRegistry {
  private readonly candidates = new Map<string, StoredRelationCandidate>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly nextId: () => string = randomUUID,
    private readonly now: () => number = Date.now,
  ) {}

  store(input: Omit<StoredRelationCandidate, 'candidateId' | 'expiresAt'>): string {
    this.prune();
    while (this.candidates.size >= MAX_TRANSIENT_CANDIDATES) {
      const oldest = this.candidates.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.candidates.delete(oldest);
    }

    const candidateId = this.nextId();
    this.candidates.set(candidateId, {
      ...input,
      candidateId,
      expiresAt: this.now() + CANDIDATE_TTL_MS,
    });
    return candidateId;
  }

  get(candidateId: string): StoredRelationCandidate | null {
    this.prune();
    return this.candidates.get(candidateId) ?? null;
  }

  remove(candidateId: string): void {
    this.candidates.delete(candidateId);
  }

  /** Coalesce concurrent explicit requests for the same Record. */
  runOnce<T>(recordId: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(recordId);
    if (existing !== undefined) return existing as Promise<T>;
    const pending = operation().finally(() => {
      if (this.inFlight.get(recordId) === pending) this.inFlight.delete(recordId);
    });
    this.inFlight.set(recordId, pending);
    return pending;
  }

  private prune(): void {
    const now = this.now();
    for (const [id, candidate] of this.candidates) {
      if (candidate.expiresAt <= now) this.candidates.delete(id);
    }
  }
}

const globalForAIExperience = globalThis as unknown as {
  jianyuanRelationCandidates: RelationCandidateRegistry | undefined;
};

export const getRelationCandidateRegistry = (): RelationCandidateRegistry => {
  const existing = globalForAIExperience.jianyuanRelationCandidates;
  if (existing !== undefined) return existing;
  const created = new RelationCandidateRegistry();
  globalForAIExperience.jianyuanRelationCandidates = created;
  return created;
};

const safeProviderMessage = (kind: AIProviderErrorKind): string => {
  switch (kind) {
    case 'disabled':
      return 'AI 当前未配置。记录已保存，你仍可继续记录。';
    case 'invalid_configuration':
      return 'AI 配置还不完整。记录已保存，可在设置中检查。';
    case 'unauthorized':
      return 'AI 服务拒绝了当前凭据。记录已保存。';
    case 'rate_limited':
      return 'AI 服务当前请求过多。记录已保存，可以稍后再试。';
    case 'timeout':
      return 'AI 响应超时。记录已保存。';
    case 'endpoint_not_found':
    case 'upstream_error':
      return 'AI 服务暂时不可用。记录已保存。';
    case 'malformed_response':
      return 'AI 服务返回的观察无法安全读取。记录已保存。';
    case 'privacy_boundary':
      return '当前数据权限不允许这次 AI 请求。记录已保存。';
  }
};

const asCandidateRecord = (record: RecordReadModel): CandidateRecordView => ({
  id: record.id,
  verbatim: record.verbatim ?? '（没有可显示的原话）',
  createdAt: record.createdAt.toISOString(),
});

const asAIObservation = (
  suggestion: RelationSuggestion,
  referencedRecords: readonly CandidateRecordView[],
): Pick<
  AIObservationView,
  'observation' | 'referencedRecords' | 'possibleExplanation' | 'uncertainty' | 'reflectionQuestion'
> => ({
  // `evidenceSummary` is the Provider's descriptive observation field. It is
  // deliberately not presented as evidence or as a conclusion.
  observation: suggestion.evidenceSummary,
  referencedRecords,
  possibleExplanation:
    `一种可能是，这些记录在“${suggestion.comparisonAxis.dimension}”上呈现了相似的安排。`,
  uncertainty: '我无法判断这是长期模式，还是这几次经历恰好相似。',
  reflectionQuestion: suggestion.comparisonAxis.question,
});

/**
 * Application-level backstop for providers other than the bundled OpenAI
 * adapter. A provider contract is not a trust boundary: every model response
 * must still remain descriptive before it reaches Presentation or Core.
 */
const containsObservationBoundaryRisk = (value: string): boolean =>
  /\b(?:you are|your personality|your identity|diagnos(?:e|is)|proves? that you|you always|you never|you must be|you are fundamentally)\b/i.test(
    value,
  ) ||
  /你就是|说明你|证明你|你的人格|你的身份|心理诊断|本质上是|你本质上|你(?:总是|永远|天生|一定是)|你(?:害怕|担心|在逃避|逃避|潜意识|内心)/.test(
    value,
  );

const suggestionContainsObservationBoundaryRisk = (suggestion: unknown): boolean => {
  if (typeof suggestion !== 'object' || suggestion === null) return true;
  const candidate = suggestion as {
    readonly comparisonAxis?: unknown;
    readonly relationType?: unknown;
    readonly evidenceSummary?: unknown;
  };
  if (
    typeof candidate.comparisonAxis !== 'object' ||
    candidate.comparisonAxis === null
  ) {
    return true;
  }
  const axis = candidate.comparisonAxis as {
    readonly question?: unknown;
    readonly dimension?: unknown;
  };
  const fields = [
    axis.question,
    axis.dimension,
    candidate.relationType,
    candidate.evidenceSummary,
  ];
  return fields.some(
    (value) => typeof value !== 'string' || containsObservationBoundaryRisk(value),
  );
};


const unresolvedAnalysisDeny = (
  directives: readonly Directive[],
  knownScopeKinds: readonly string[],
): boolean =>
  directives.some(
    (directive) =>
      !directive.allowAnalysis &&
      directive.scope !== null &&
      !knownScopeKinds.includes(directive.scope.kind),
  );

/**
 * Post-capture suggestion only. This does not call RelationService and cannot
 * write a RelationClaim, evidence assessment, or Discovery.
 */
const suggestRelationsAfterCaptureInternal = async (
  core: CoreComposition,
  currentRecordId: string,
  registry = getRelationCandidateRegistry(),
): Promise<RelationSuggestionExperience> => {
  if (!core.ai.enabled) {
    return {
      status: 'disabled',
      message: 'AI 当前未配置。记录已保存，你仍可继续记录。',
      candidates: [],
    };
  }

  const current = await core.records.getById(currentRecordId);
  if (current === null) {
    return {
      status: 'unavailable',
      message: '记录已保存，但暂时无法读取它来生成观察。',
      candidates: [],
    };
  }

  const directives = await core.directives.listActive();
  if (unresolvedAnalysisDeny(directives, ['user_selected', 'source'])) {
    return {
      status: 'not_permitted',
      message: '记录已保存。现有使用规则无法在当前读取模型中安全解析，因此没有发送历史记录。',
      candidates: [],
    };
  }

  const recent = await core.records.listRecent({
    limit: MAX_RELATION_CONTEXT_RECORDS,
  });
  const available = [
    current,
    ...recent.filter((item) => item.id !== current.id),
  ]
    .filter(
      (record, index, all) =>
        record.verbatim !== null &&
        record.epistemicRoles.includes('user_expression') &&
        all.findIndex((candidate) => candidate.id === record.id) === index,
    )
    .slice(0, MAX_RELATION_CONTEXT_RECORDS);

  // Resolve permissions per Record. A scoped user_selected denial must remove
  // only that Record, while a global/source denial still protects everything.
  const permitted = available.filter((record) =>
    resolveEffectivePermissions(directives, {
      topicTags: [],
      source: 'capture_ui',
      relationAxes: [],
      userSelectedRefs: [record.id],
      createdAt: current.createdAt,
    }).allowAnalysis,
  );
  if (!permitted.some((record) => record.id === current.id)) {
    return {
      status: 'not_permitted',
      message: '记录已保存。当前使用规则不允许把这条记录发送给 AI。',
      candidates: [],
    };
  }

  const context: RecordReadModel[] = [];
  let contextChars = 0;
  for (const record of permitted) {
    const clippedLength = Math.min(
      record.verbatim?.length ?? 0,
      MAX_RECORD_CONTEXT_CHARS,
    );
    if (context.length > 0 && contextChars + clippedLength > MAX_RELATION_CONTEXT_CHARS) {
      continue;
    }
    context.push(record);
    contextChars += clippedLength;
  }

  if (context.length < 2) {
    return {
      status: 'not_enough_context',
      message: '记录已保存。至少有两条可用记录后，AI 才会提出可能联系。',
      candidates: [],
    };
  }

  const permissions = resolveEffectivePermissions(directives, {
    topicTags: [],
    source: 'capture_ui',
    relationAxes: [],
    userSelectedRefs: context.map((record) => record.id),
    createdAt: current.createdAt,
  });
  if (!permissions.allowAnalysis) {
    return {
      status: 'not_permitted',
      message: '记录已保存。当前使用规则不允许 AI 回看。',
      candidates: [],
    };
  }

  const result = await core.ai.suggestRelations({
    authorization: {
      userEnabledAI: core.ai.enabled,
      directiveAllowsAI: permissions.allowAnalysis,
      selectedRecordIds: context.map((record) => record.id),
      reason: 'relation_suggestion',
    },
    records: context.map((record) => ({
      recordId: record.id,
      verbatim: record.verbatim?.slice(0, MAX_RECORD_CONTEXT_CHARS) ?? null,
      timeDescription: record.createdAt.toISOString(),
    })),
  });

  const auditBase = {
    timestamp: new Date().toISOString(),
    provider: core.ai.providerId,
    model: core.ai.getManualModelId(),
    inputRecordIds: context.map((record) => record.id),
  };

  if (!result.ok) {
    getAIInsightAuditLog().append({
      ...auditBase,
      outcome: 'error',
      errorType: result.error.kind,
    });
    return {
      status: 'unavailable',
      message: safeProviderMessage(result.error.kind),
      candidates: [],
    };
  }

  // Keep this guard in orchestration as well as in the OpenAI adapter. A
  // future provider may satisfy the TypeScript contract while still drifting
  // into identity, diagnosis, motive, or certainty language.
  if (
    result.value.language !== 'zh-CN' ||
    !Array.isArray(result.value.suggestions) ||
    result.value.suggestions.some(suggestionContainsObservationBoundaryRisk)
  ) {
    getAIInsightAuditLog().append({
      ...auditBase,
      outcome: 'error',
      errorType: 'malformed_response',
    });
    return {
      status: 'unavailable',
      message: safeProviderMessage('malformed_response'),
      candidates: [],
    };
  }

  if (result.value.status === 'NO_OBSERVATION') {
    getAIInsightAuditLog().append({ ...auditBase, outcome: 'no_observation' });
    return {
      status: 'no_candidate',
      message: '目前没有发现值得回看的明显联系。',
      candidates: [],
    };
  }

  const providerResult = result.value as RelationSuggestionResult;
  const recordById = new Map(context.map((record) => [record.id, record]));
  const candidates = providerResult.suggestions
    .filter((suggestion) => {
      const uniqueRefs = new Set(suggestion.recordRefs);
      return (
        uniqueRefs.size >= 2 &&
        uniqueRefs.has(current.id) &&
        [...uniqueRefs].every((id) => recordById.has(id))
      );
    })
    .slice(0, MAX_VISIBLE_CANDIDATES)
    .map((suggestion): RelationCandidateView => {
      const candidateId = registry.store({
        currentRecordId: current.id,
        suggestion,
        createdAt: new Date(),
      });

      const currentRecord = asCandidateRecord(current);
      const relatedRecords = suggestion.recordRefs
        .filter((id) => id !== current.id)
        .flatMap((id) => {
          const record = recordById.get(id);
          return record === undefined ? [] : [asCandidateRecord(record)];
        });

      return {
        candidateId,
        currentRecord,
        relatedRecords,
        question: suggestion.comparisonAxis.question,
        dimension: suggestion.comparisonAxis.dimension,
        explanation: suggestion.evidenceSummary,
        ...asAIObservation(suggestion, [currentRecord, ...relatedRecords]),
      };
    });

  const experience: RelationSuggestionExperience = candidates.length === 0
    ? {
        status: 'no_candidate',
        message:
          '目前没有发现值得回看的明显联系。',
        candidates: [],
      }
    : {
        status: 'candidates',
        message: '记录已保存。AI 提出了可能值得回看的联系；它们还不是长期联系。',
        candidates,
      };
  getAIInsightAuditLog().append({
    ...auditBase,
    outcome: experience.status,
  });
  return experience;
};

export const suggestRelationsAfterCapture = (
  core: CoreComposition,
  currentRecordId: string,
  registry = getRelationCandidateRegistry(),
): Promise<RelationSuggestionExperience> =>
  registry.runOnce(currentRecordId, () =>
    suggestRelationsAfterCaptureInternal(core, currentRecordId, registry),
  );

export const respondToRelationCandidate = async (
  core: CoreComposition,
  input: {
    readonly candidateId: string;
    readonly decision: CandidateDecision;
    /** Required before a worth_reviewing request can reach Core gates. */
    readonly reflectionText?: string;
    readonly now: Date;
  },
  registry = getRelationCandidateRegistry(),
): Promise<CandidateDecisionResult> => {
  const stored = registry.get(input.candidateId);
  if (stored === null) {
    return {
      status: 'expired',
      message: '这次临时观察已过期。它没有写入你的数据。',
    };
  }

  if (
    input.decision === 'worth_reviewing' &&
    (input.reflectionText === undefined || input.reflectionText.trim().length === 0)
  ) {
    return {
      status: 'reflection_required',
      message: '先写下你对这个观察的理解，才会继续评估。',
    };
  }

  if (input.decision === 'uncertain') {
    registry.remove(input.candidateId);
    return {
      status: 'uncertain',
      message: '已暂时放下。这个操作没有创建记录或长期联系。',
    };
  }
  if (input.decision === 'ignore' || input.decision === 'not_applicable') {
    registry.remove(input.candidateId);
    return {
      status: input.decision === 'ignore' ? 'ignored' : 'not_applicable',
      message: '已暂时标记为不适用。这次临时观察没有写入长期数据。',
    };
  }
  if (input.decision === 'later') {
    registry.remove(input.candidateId);
    return {
      status: 'later',
      message: '已留到稍后。这次临时观察没有写入长期数据。',
    };
  }

  const resolved = await Promise.all(
    stored.suggestion.recordRefs.map((id) => core.records.getById(id)),
  );
  if (resolved.some((record) => record === null)) {
    registry.remove(input.candidateId);
    return {
      status: 'expired',
      message: '这次观察引用的记录已不可用，因此没有继续处理。',
    };
  }

  let evaluation;
  try {
    evaluation = await core.relations.evaluate({
      recordRefs: stored.suggestion.recordRefs.map(recordId),
      subject: {
        topicTags: [],
        source: 'capture_ui',
        relationAxes: [stored.suggestion.comparisonAxis.dimension],
        userSelectedRefs: [
          stored.currentRecordId,
          ...stored.suggestion.recordRefs,
        ],
        createdAt: stored.createdAt,
      },
      baselineContext: {
        hasReliablePersonalBaseline: false,
        recordSuppliesInternalBaseline: false,
      },
      now: input.now,
    });
  } catch {
    return {
      status: 'unavailable',
      message: '这次观察暂时无法评估；没有把它当成已确认联系。',
    };
  }

  if (evaluation.persisted.length === 0) {
    registry.remove(input.candidateId);
    return {
      status: 'not_admitted',
      message: '这次观察没有通过必要的边界检查，因此没有形成长期联系。',
    };
  }

  registry.remove(input.candidateId);
  const target = evaluation.persisted[0];
  if (target === undefined) {
    return {
      status: 'not_admitted',
      message: '这次观察没有产生可展示的长期联系。',
    };
  }

  try {
    const stream = await core.discovery.listStream({
      now: input.now,
      relationLimit: 100,
    });
    const discovery = stream.find(
      (item) => item.kind === 'relation' && item.subject.id === target.id,
    );
    if (discovery === undefined) {
      return {
        status: 'not_admitted',
        message: '这条联系已通过评估，但当前使用规则不允许显示它。',
      };
    }
    return {
      status: 'discovery',
      message: '这条联系已通过评估，现在可以在探索空间中回看。',
      targetRef: target.id,
      discoveryId: discovery.projection.discovery.id,
    };
  } catch {
    return {
      status: 'not_admitted',
      message: '这条联系已通过评估，但暂时无法显示。',
    };
  }
};

/**
 * Complete the human-centered Observation flow.
 *
 * Quick choices express whether the user wants to keep understanding the
 * observation; they are not approvals and never reach Core on their own. Only
 * free text crosses the application boundary. The existing target-bound
 * ReflectionFlow persists that text after Core admits the Relation.
 */
export const submitAIObservationReflection = async (
  core: CoreComposition,
  input: {
    readonly candidateId: string;
    readonly meaning: ObservationMeaning;
    readonly reflectionText?: string;
    readonly now: Date;
  },
  registry = getRelationCandidateRegistry(),
): Promise<CandidateDecisionResult> => {
  if (input.meaning === 'not_my_experience') {
    const discarded = await respondToRelationCandidate(
      core,
      {
        candidateId: input.candidateId,
        decision: 'not_applicable',
        now: input.now,
      },
      registry,
    );
    if (discarded.status === 'not_applicable') {
      return {
        status: 'discarded',
        message: '已放下这次观察。没有保存长期联系或你的理解。',
      };
    }
    return discarded;
  }

  if (
    input.reflectionText === undefined ||
    input.reflectionText.trim().length === 0
  ) {
    return {
      status: 'reflection_required',
      message: '请先写下你的理解；快捷选择本身不会创建关系。',
    };
  }

  const decision = await respondToRelationCandidate(
    core,
    {
      candidateId: input.candidateId,
      decision: 'worth_reviewing',
      reflectionText: input.reflectionText,
      now: input.now,
    },
    registry,
  );
  if (decision.status !== 'discovery') return decision;

  try {
    const reflected = await core.reflectionFlow.respondToRelation({
      targetRef: decision.targetRef,
      feedback: {
        response: null,
        freeText: input.reflectionText,
        leaveForNow: false,
        userInitiatedContinuation: false,
      },
      now: input.now,
    });
    if (reflected === null || reflected.recordId === null) {
      return {
        status: 'unavailable',
        message: '你的理解没有保存完成；当前关系仍未被当作你的结论。',
      };
    }
    return {
      ...decision,
      reflectionRecordId: reflected.recordId,
      message: '你的理解已保存。Core 已完成这次关系评估；它仍不是对你的定义。',
    };
  } catch {
    return {
      status: 'unavailable',
      message: '你的理解没有保存完成；请重试，当前关系不会被当作你的结论。',
    };
  }
};

export const createAIReflectionInvitation = async (
  core: CoreComposition,
  targetRef: string,
): Promise<AIReflectionInvitation> => {
  const target = await core.reflectionFlow.getRelationTarget(
    targetRef,
    new Date(),
  );
  if (target === null) {
    return {
      status: 'unavailable',
      question: null,
      message: '当前回看线索已不可用，你仍可返回列表。',
    };
  }
  if (target.preference.interventionLevel !== 'standard') {
    return {
      status: 'preference_disabled',
      question: null,
      message: '你已关闭回看问题。仍可直接写下自己的理解。',
    };
  }
  if (!core.ai.enabled) {
    return {
      status: 'disabled',
      question: null,
      message: 'AI 当前不可用。你仍可直接写下自己的理解。',
    };
  }
  if (target.relation.recordRefs.length > MAX_REFLECTION_CONTEXT_RECORDS) {
    return {
      status: 'not_permitted',
      question: null,
      message: '这条回看线索的上下文超过当前 AI 数据上限，没有发送记录。',
    };
  }

  const records = await Promise.all(
    target.relation.recordRefs.map((id) => core.records.getById(id)),
  );
  if (records.some((record) => record === null)) {
    return {
      status: 'unavailable',
      question: null,
      message: '无法完整读取这条回看线索的来源记录，因此没有发送部分上下文。',
    };
  }
  const resolved = records.filter(
    (record): record is RecordReadModel => record !== null,
  );
  const reflectionContextChars = resolved.reduce(
    (total, record) =>
      total + Math.min(record.verbatim?.length ?? 0, MAX_RECORD_CONTEXT_CHARS),
    0,
  );
  if (reflectionContextChars > MAX_REFLECTION_CONTEXT_CHARS) {
    return {
      status: 'not_permitted',
      question: null,
      message: '这条回看线索的文字上下文超过当前 AI 数据上限，没有发送记录。',
    };
  }

  const directives = await core.directives.listActive();
  if (unresolvedAnalysisDeny(directives, ['relation_axis', 'user_selected'])) {
    return {
      status: 'not_permitted',
      question: null,
      message: '当前使用规则无法安全解析这次上下文，因此没有发送记录。',
    };
  }
  const permissions = resolveEffectivePermissions(directives, {
    topicTags: [],
    source: null,
    relationAxes: [target.relation.dimension],
    userSelectedRefs: [target.relation.id, ...target.relation.recordRefs],
    createdAt: target.relation.createdAt,
  });
  if (!permissions.allowAnalysis) {
    return {
      status: 'not_permitted',
      question: null,
      message: '当前使用规则不允许 AI 读取这条回看线索的记录。',
    };
  }

  const result = await core.ai.createReflectionPrompt({
    authorization: {
      userEnabledAI: core.ai.enabled,
      directiveAllowsAI: permissions.allowAnalysis,
      selectedRecordIds: resolved.map((record) => record.id),
      reason: 'reflection_invitation',
    },
    records: resolved.map((record) => ({
      recordId: record.id,
      verbatim: record.verbatim?.slice(0, MAX_RECORD_CONTEXT_CHARS) ?? null,
      timeDescription: record.createdAt.toISOString(),
    })),
    focus: target.relation.question,
  });
  const auditBase = {
    timestamp: new Date().toISOString(),
    provider: core.ai.providerId,
    model: core.ai.getManualModelId(),
    inputRecordIds: resolved.map((record) => record.id),
  };
  if (!result.ok) {
    getAIInsightAuditLog().append({
      ...auditBase,
      outcome: 'error',
      errorType: result.error.kind,
    });
    return {
      status: 'unavailable',
      question: null,
      message:
        safeProviderMessage(result.error.kind).replace('记录已保存。', '') +
        ' 你仍可直接写自己的理解。',
    };
  }

  getAIInsightAuditLog().append({ ...auditBase, outcome: 'reflection_invitation' });

  return {
    status: 'ready',
    question: result.value.question,
    message: '这是 AI 提出的回看问题，不是你的理解，也不是结论。',
  };
};
