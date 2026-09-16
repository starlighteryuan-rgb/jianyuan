/**
 * Mobile Awareness orchestration — the platform-agnostic form of the Desktop /
 * Web pipeline in `src/server/ai-core-experience.ts`.
 *
 * WHY THIS FILE EXISTS RATHER THAN IMPORTING THE SERVER MODULE
 * That module imports Next.js server composition types and `node:crypto`. Both
 * are unavailable in a React Native bundle, so importing it directly would drag
 * the web server graph into the iOS app. The orchestration itself is not
 * platform-specific: it reads Records, resolves Directive permissions, calls the
 * shared Provider contract, and hands user-authored text to the existing Core
 * services. This file keeps that behaviour and changes nothing about the rules.
 *
 * THE SEMANTICS THAT MUST NOT DRIFT
 *   - Opening Awareness never calls AI; only an explicit user action does.
 *   - An Observation is transient. It lives in memory with a 15-minute TTL and
 *     is never written as a Relation.
 *   - A quick choice is a stance, not an approval. `not_my_experience` discards
 *     the Observation and writes nothing.
 *   - Free text is persisted as a User Reflection BEFORE the Relation Gate runs.
 *     The Gate decides whether a long-lived Relation is admitted; it never
 *     decides whether the user's own words are saved.
 */

import {
  recordId,
  resolveEffectivePermissions,
  type Directive,
  type RecordReadModel,
} from '../../../../packages/core/index';
import type {
  AIProviderErrorKind,
  RelationSuggestion,
  RelationSuggestionResult,
} from '../../../../packages/providers/ai/index';

import type { MobileComposition } from './composition-root';

const MAX_RELATION_CONTEXT_RECORDS = 5;
const MAX_RELATION_CONTEXT_CHARS = 8_000;
const MAX_RECORD_CONTEXT_CHARS = 2_000;
const MAX_VISIBLE_CANDIDATES = 2;
const CANDIDATE_TTL_MS = 15 * 60 * 1000;
const MAX_TRANSIENT_CANDIDATES = 50;

/** The space that owns this orchestration, used for Directive scoping. */
const MOBILE_SOURCE = 'mobile_ui';

export interface CandidateRecordView {
  readonly id: string;
  readonly verbatim: string;
  readonly createdAt: string;
}

export interface AIObservationView {
  readonly observation: string;
  readonly referencedRecords: readonly CandidateRecordView[];
  readonly possibleExplanation?: string;
  readonly uncertainty?: string;
  readonly reflectionQuestion?: string;
}

export interface RelationCandidateView extends AIObservationView {
  readonly candidateId: string;
  readonly currentRecord: CandidateRecordView;
  readonly relatedRecords: readonly CandidateRecordView[];
  readonly question: string;
  readonly dimension: string;
  readonly explanation: string;
  /** Retained so presentation history can be persisted and rehydrated. */
  readonly suggestion: RelationSuggestion;
}

export type AwarenessHistoryStatus =
  | 'pending'
  | 'viewed'
  | 'reflected'
  | 'dismissed';

/**
 * One durable Awareness item. It is presentation history, not a Core Relation.
 *
 * The transient registry still owns response processing for the current
 * session. This record exists so the user can leave and return without losing
 * what was already surfaced.
 */
export interface AwarenessHistoryItem {
  readonly candidateId: string;
  readonly status: AwarenessHistoryStatus;
  /** Stable automatic check boundary; absent for user-initiated observations. */
  readonly automationJobId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly currentRecordId: string;
  readonly suggestion: RelationSuggestion;
  readonly candidate: RelationCandidateView;
  readonly meaning: ObservationMeaning | null;
  readonly reflectionText: string | null;
  readonly targetRef: string | null;
  readonly reflectionRecordId: string | null;
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

export type ObservationMeaning =
  | 'connected'
  | 'different_understanding'
  | 'not_my_experience';

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
      /**
       * The user's free text is durably saved, but the Core Gate did not admit
       * a Relation. This is a successful user outcome, not a failure: the text
       * is readable in Understanding and contains no long-lived relation.
       */
      readonly status: 'reflection_saved';
      readonly message: string;
      readonly targetRef: string;
      readonly reflectionRecordId: string;
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

export interface MobileAIInsightAuditEntry {
  readonly timestamp: string;
  readonly provider: string;
  readonly model: string | null;
  readonly inputRecordIds: readonly string[];
  readonly outcome: string;
  readonly errorType?: AIProviderErrorKind;
}

interface StoredRelationCandidate {
  readonly candidateId: string;
  readonly currentRecordId: string;
  readonly suggestion: RelationSuggestion;
  readonly createdAt: Date;
  readonly expiresAt: number;
}

export interface RelationCandidateRegistryHooks {
  readonly stored?: (candidate: StoredRelationCandidate) => void;
  readonly removed?: (candidateId: string) => void;
}

/**
 * In-memory registry for transient Observations.
 *
 * It is intentionally not persisted: an Observation that survived a restart
 * would look like a stored conclusion, which is exactly what the product
 * forbids. A restart therefore drops every unconfirmed Observation.
 */
export class RelationCandidateRegistry {
  private readonly candidates = new Map<string, StoredRelationCandidate>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly claimed = new Set<string>();
  private sequence = 0;

  constructor(private readonly hooks: RelationCandidateRegistryHooks = {}) {}

  store(input: Omit<StoredRelationCandidate, 'candidateId' | 'expiresAt'>): string {
    this.prune();
    while (this.candidates.size >= MAX_TRANSIENT_CANDIDATES) {
      const oldest = this.candidates.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.candidates.delete(oldest);
    }

    this.sequence += 1;
    const candidateId = `obs_${this.sequence}_${Date.now()}`;
    this.candidates.set(candidateId, {
      ...input,
      candidateId,
      expiresAt: Date.now() + CANDIDATE_TTL_MS,
    });
    const stored = this.candidates.get(candidateId);
    if (stored !== undefined) this.hooks.stored?.(stored);
    return candidateId;
  }

  get(candidateId: string): StoredRelationCandidate | null {
    this.prune();
    return this.candidates.get(candidateId) ?? null;
  }

  /**
   * Atomically claim a candidate for one terminal response.
   *
   * A duplicate tap must not create a second Reflection. The first caller owns
   * the candidate and every later caller sees it as already handled.
   */
  claim(candidateId: string): boolean {
    this.prune();
    if (!this.candidates.has(candidateId) || this.claimed.has(candidateId)) {
      return false;
    }
    this.claimed.add(candidateId);
    return true;
  }

  remove(candidateId: string): void {
    this.candidates.delete(candidateId);
    this.claimed.delete(candidateId);
    this.hooks.removed?.(candidateId);
  }

  runOnce<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing !== undefined) return existing as Promise<T>;
    const pending = operation().finally(() => {
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
    });
    this.inFlight.set(key, pending);
    return pending;
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, candidate] of this.candidates) {
      if (candidate.expiresAt <= now) {
        this.candidates.delete(id);
        this.claimed.delete(id);
      }
    }
  }
}

/** Per-runtime audit seam; stores metadata only, never user text. */
export class MobileAIInsightAuditLog {
  private readonly entries: MobileAIInsightAuditEntry[] = [];

  append(entry: MobileAIInsightAuditEntry): void {
    this.entries.push(entry);
    if (this.entries.length > 200) this.entries.splice(0, this.entries.length - 200);
  }

  list(): readonly MobileAIInsightAuditEntry[] {
    return [...this.entries];
  }
}

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
  observation: suggestion.observation,
  referencedRecords,
  ...(suggestion.explanation === undefined ? {} : { possibleExplanation: suggestion.explanation }),
  ...(suggestion.uncertainty === undefined ? {} : { uncertainty: suggestion.uncertainty }),
  ...(suggestion.question === undefined ? {} : { reflectionQuestion: suggestion.question }),
});

/**
 * Application-level backstop. The Provider contract is not a trust boundary:
 * every response must remain descriptive before it reaches Presentation.
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
    readonly observation?: unknown;
    readonly question?: unknown;
    readonly explanation?: unknown;
    readonly uncertainty?: unknown;
  };
  if (typeof candidate.comparisonAxis !== 'object' || candidate.comparisonAxis === null) {
    return true;
  }
  const axis = candidate.comparisonAxis as {
    readonly question?: unknown;
    readonly dimension?: unknown;
  };
  const required = [axis.question, axis.dimension, candidate.relationType, candidate.observation];
  if (required.some((value) => typeof value !== 'string' || containsObservationBoundaryRisk(value))) {
    return true;
  }
  return [candidate.question, candidate.explanation, candidate.uncertainty].some(
    (value) => value !== undefined && (typeof value !== 'string' || containsObservationBoundaryRisk(value)),
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
 * Explicit, user-initiated Awareness request.
 *
 * This is the ONLY path that sends Records to the Provider. It never writes a
 * Relation; it returns transient candidates the user may then respond to.
 */
export const suggestRelations = async (
  composition: MobileComposition,
  currentRecordId: string,
  registry: RelationCandidateRegistry,
  audit: MobileAIInsightAuditLog,
  options: { readonly batchRecordIds?: readonly string[] } = {},
): Promise<RelationSuggestionExperience> =>
  registry.runOnce(
    `auto:${[...(options.batchRecordIds ?? [currentRecordId])].sort().join(',')}`,
    async () => {
    if (!composition.ai.enabled) {
      return {
        status: 'disabled' as const,
        message: 'AI 当前未配置。记录已保存，你仍可继续记录。',
        candidates: [] as const,
      };
    }

    const current = await composition.records.getById(currentRecordId);
    if (current === null) {
      return {
        status: 'unavailable' as const,
        message: '记录已保存，但暂时无法读取它来生成观察。',
        candidates: [] as const,
      };
    }

    const directives = await composition.directives.listActive();
    if (unresolvedAnalysisDeny(directives, ['user_selected', 'source'])) {
      return {
        status: 'not_permitted' as const,
        message: '记录已保存。现有使用规则无法在当前读取模型中安全解析，因此没有发送历史记录。',
        candidates: [] as const,
      };
    }

    const recent = await composition.records.listRecent({
      limit: MAX_RELATION_CONTEXT_RECORDS,
    });
    const requested = options.batchRecordIds ?? [currentRecordId];
    const requestedRecords = (
      await Promise.all(requested.map((id) => composition.records.getById(id)))
    ).filter((record): record is RecordReadModel => record !== null);
    const available = [
      ...requestedRecords,
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

    const permitted = available.filter(
      (record) =>
        resolveEffectivePermissions(directives, {
          topicTags: [],
          source: MOBILE_SOURCE,
          relationAxes: [],
          userSelectedRefs: [record.id],
          createdAt: current.createdAt,
        }).allowAnalysis,
    );
    if (!permitted.some((record) => record.id === current.id)) {
      return {
        status: 'not_permitted' as const,
        message: '记录已保存。当前使用规则不允许把这条记录发送给 AI。',
        candidates: [] as const,
      };
    }

    const context: RecordReadModel[] = [];
    let contextChars = 0;
    for (const record of permitted) {
      const clippedLength = Math.min(record.verbatim?.length ?? 0, MAX_RECORD_CONTEXT_CHARS);
      if (context.length > 0 && contextChars + clippedLength > MAX_RELATION_CONTEXT_CHARS) {
        continue;
      }
      context.push(record);
      contextChars += clippedLength;
    }

    if (context.length < 2) {
      return {
        status: 'not_enough_context' as const,
        message: '记录已保存。至少有两条可用记录后，AI 才会提出可能联系。',
        candidates: [] as const,
      };
    }

    const permissions = resolveEffectivePermissions(directives, {
      topicTags: [],
      source: MOBILE_SOURCE,
      relationAxes: [],
      userSelectedRefs: context.map((record) => record.id),
      createdAt: current.createdAt,
    });
    if (!permissions.allowAnalysis) {
      return {
        status: 'not_permitted' as const,
        message: '记录已保存。当前使用规则不允许 AI 回看。',
        candidates: [] as const,
      };
    }

    const result = await composition.ai.suggestRelations({
      authorization: {
        userEnabledAI: composition.ai.enabled,
        directiveAllowsAI: permissions.allowAnalysis,
        selectedRecordIds: context.map((record) => record.id),
        reason: 'mobile_relation_suggestion',
      },
      records: context.map((record) => ({
        recordId: record.id,
        verbatim: record.verbatim?.slice(0, MAX_RECORD_CONTEXT_CHARS) ?? null,
        timeDescription: record.createdAt.toISOString(),
      })),
    });

    const auditBase = {
      timestamp: new Date().toISOString(),
      provider: composition.ai.providerId,
      model: composition.ai.getManualModelId(),
      inputRecordIds: context.map((record) => record.id),
    };

    if (!result.ok) {
      audit.append({ ...auditBase, outcome: 'error', errorType: result.error.kind });
      return {
        status: 'unavailable' as const,
        message: safeProviderMessage(result.error.kind),
        candidates: [] as const,
      };
    }

    if (
      result.value.language !== 'zh-CN' ||
      !Array.isArray(result.value.suggestions) ||
      result.value.suggestions.some(suggestionContainsObservationBoundaryRisk)
    ) {
      audit.append({ ...auditBase, outcome: 'error', errorType: 'malformed_response' });
      return {
        status: 'unavailable' as const,
        message: safeProviderMessage('malformed_response'),
        candidates: [] as const,
      };
    }

    if (result.value.status === 'NO_OBSERVATION') {
      audit.append({ ...auditBase, outcome: 'no_observation' });
      return {
        status: 'no_candidate' as const,
        message: '目前没有发现值得回看的明显联系。',
        candidates: [] as const,
      };
    }

    const recordById = new Map(context.map((record) => [record.id, record]));
    // The runtime checks above establish the provider contract. Re-state it
    // here because Array.isArray widens a readonly array in this TypeScript
    // version and would otherwise erase the element type.
    const providerResult = result.value as RelationSuggestionResult;
    const suggestions = providerResult.suggestions;
    const candidates = suggestions
      .filter((suggestion) => {
        const uniqueRefs = new Set(suggestion.recordRefs);
        return (
          uniqueRefs.size >= 2 &&
          [...uniqueRefs].every((id) => recordById.has(id)) &&
          (options.batchRecordIds === undefined ||
            [...uniqueRefs].some((id) => requested.includes(id)))
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
          explanation: suggestion.observation,
          suggestion,
          ...asAIObservation(suggestion, [currentRecord, ...relatedRecords]),
        };
      });

    const experience: RelationSuggestionExperience =
      candidates.length === 0
        ? {
            status: 'no_candidate',
            message: '目前没有发现值得回看的明显联系。',
            candidates: [],
          }
        : {
            status: 'candidates',
            message: '记录已保存。AI 提出了可能值得回看的联系；它们还不是长期联系。',
            candidates,
          };

    audit.append({ ...auditBase, outcome: experience.status });
    return experience;
    },
  );

/**
 * User's meaning-making response to one transient Observation.
 *
 * The user's free text is persisted before any Gate evaluation. A Relation is
 * optional; the Reflection is not.
 */
export const submitObservationReflection = async (
  composition: MobileComposition,
  input: {
    readonly candidateId: string;
    readonly meaning: ObservationMeaning;
    readonly reflectionText?: string;
    readonly now: Date;
  },
  registry: RelationCandidateRegistry,
): Promise<CandidateDecisionResult> => {
  const stored = registry.get(input.candidateId);
  if (stored === null) {
    return {
      status: 'expired',
      message: '这次临时观察已过期。它没有写入你的数据。',
    };
  }

  if (input.meaning === 'not_my_experience') {
    if (!registry.claim(input.candidateId)) {
      return {
        status: 'expired',
        message: '这次回应已经处理过，没有重复保存。',
      };
    }
    registry.remove(input.candidateId);
    return {
      status: 'discarded',
      message: '已放下这次观察。没有保存长期联系或你的理解。',
    };
  }

  if (input.reflectionText === undefined || input.reflectionText.trim().length === 0) {
    return {
      status: 'reflection_required',
      message: '请先写下你的理解；快捷选择本身不会创建关系。',
    };
  }

  if (!registry.claim(input.candidateId)) {
    return {
      status: 'expired',
      message: '这次回应已经处理过，没有重复保存。',
    };
  }

  const reflectionText = input.reflectionText.trim();
  let episode;
  let persisted;
  try {
    episode = await composition.reflection.recordSpontaneous({
      targetRef: null,
      now: input.now,
    });
    persisted = await composition.reflection.respond({
      episode,
      feedback: {
        response: null,
        freeText: reflectionText,
        leaveForNow: false,
        userInitiatedContinuation: false,
      },
      subject: {
        topicTags: [],
        source: MOBILE_SOURCE,
        relationAxes: [],
        userSelectedRefs: [stored.currentRecordId],
      },
      targetType: 'relation_claim',
      targetRef: `spontaneous:${episode.id}`,
      now: input.now,
    });
  } catch {
    registry.remove(input.candidateId);
    return {
      status: 'unavailable',
      message: '你的理解没有保存完成；请重试。',
    };
  }

  const reflectionRecordId = persisted.recordId;
  if (reflectionRecordId === null) {
    registry.remove(input.candidateId);
    return {
      status: 'unavailable',
      message: '你的理解没有保存完成；请重试。',
    };
  }

  const resolved = await Promise.all(
    stored.suggestion.recordRefs.map((id) => composition.records.getById(id)),
  );
  if (resolved.some((record) => record === null)) {
    registry.remove(input.candidateId);
    return {
      status: 'reflection_saved',
      message: '你的理解已保存。相关记录已不可用，因此没有继续形成长期联系。',
      targetRef: `record:${reflectionRecordId}`,
      reflectionRecordId,
    };
  }

  let evaluation;
  try {
    evaluation = await composition.relations.evaluate({
      recordRefs: stored.suggestion.recordRefs.map(recordId),
      subject: {
        topicTags: [],
        source: MOBILE_SOURCE,
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
    registry.remove(input.candidateId);
    return {
      status: 'reflection_saved',
      message: '你的理解已保存。这次观察暂时无法评估，因此没有形成长期联系。',
      targetRef: `record:${reflectionRecordId}`,
      reflectionRecordId,
    };
  }

  const target = evaluation.persisted[0];
  if (target !== undefined) {
    await composition.storage.reflectionEpisodes.save({
      ...episode,
      targetRef: target.id,
    });
  }
  if (target === undefined) {
    registry.remove(input.candidateId);
    return {
      status: 'reflection_saved',
      message: '你的理解已保存。目前没有形成长期联系。',
      targetRef: `record:${reflectionRecordId}`,
      reflectionRecordId,
    };
  }

  let discoveryId: string;
  try {
    const stream = await composition.discovery.listStream({
      now: input.now,
      relationLimit: 100,
    });
    const discovery = stream.find(
      (item) => item.kind === 'relation' && item.subject.id === target.id,
    );
    if (discovery === undefined) {
      registry.remove(input.candidateId);
      return {
        status: 'reflection_saved',
        message: '你的理解已保存。这条联系暂时不满足显示条件。',
        targetRef: `record:${reflectionRecordId}`,
        reflectionRecordId,
      };
    }
    discoveryId = discovery.projection.discovery.id;
  } catch {
    registry.remove(input.candidateId);
    return {
      status: 'reflection_saved',
      message: '你的理解已保存。这条联系暂时无法显示。',
      targetRef: `record:${reflectionRecordId}`,
      reflectionRecordId,
    };
  }

  registry.remove(input.candidateId);
  return {
    status: 'discovery',
    message: '你的理解已保存。Core 已完成这次关系评估；它仍不是对你的定义。',
    targetRef: target.id,
    discoveryId,
    reflectionRecordId,
  };
};
