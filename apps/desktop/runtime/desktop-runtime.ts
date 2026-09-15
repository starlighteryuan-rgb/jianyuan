import { randomUUID } from 'node:crypto';

import { recordId } from '../../../packages/core/index';
import type { RelationSuggestion } from '../../../packages/providers/ai/index';
import {
  analysisPermissionFor,
  createDesktopComposition,
  type DesktopComposition,
  type DesktopCompositionOptions,
} from './composition-root';

export interface DesktopAIInsightAuditEntry {
  readonly timestamp: string;
  readonly provider: string;
  readonly model: string | null;
  readonly inputRecordIds: readonly string[];
  readonly outcome: string;
  readonly errorType?: string;
}

const MAX_RELATION_CONTEXT_RECORDS = 5;
const MAX_RECORD_CONTEXT_CHARS = 2_000;
const MAX_RELATION_CONTEXT_CHARS = 8_000;

// Desktop has its own Composition Root, so keep a Provider-agnostic backstop
// here as well as in the Web orchestration. A new Provider must not gain trust
// merely by returning an object that satisfies the TypeScript contract.
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
  if (typeof candidate.comparisonAxis !== 'object' || candidate.comparisonAxis === null) return true;
  const axis = candidate.comparisonAxis as {
    readonly question?: unknown;
    readonly dimension?: unknown;
  };
  return [axis.question, axis.dimension, candidate.relationType, candidate.evidenceSummary]
    .some((value) => typeof value !== 'string' || containsObservationBoundaryRisk(value));
};

export type DesktopObservationMeaning =
  | 'connected'
  | 'different_understanding'
  | 'not_my_experience';

export class DesktopRuntime {
  readonly composition: DesktopComposition;
  private readonly insightAudit: DesktopAIInsightAuditEntry[] = [];
  private readonly suggestionRequests = new Map<
    string,
    Promise<readonly RelationSuggestion[]>
  >();

  constructor(options: DesktopCompositionOptions) {
    this.composition = createDesktopComposition(options);
  }

  status() {
    return {
      product: '见渊',
      databasePath: this.composition.storage.databasePath,
      schemaVersion: this.composition.storage.schemaVersion,
      encryption: this.composition.storage.encryptionStatus,
      ai: this.composition.ai.snapshot(),
    };
  }

  configureAI(input: {
    readonly providerId: string;
    readonly baseUrl: string;
    readonly model: string;
    readonly apiKey?: string;
  }) {
    return this.composition.ai.configure(input);
  }

  selectModel(model: string) {
    return this.composition.ai.selectModel(model);
  }

  discoverModels(refresh = false) {
    return this.composition.ai.discoverModels(refresh);
  }

  testAIConnection() {
    return this.composition.ai.testConnection();
  }

  async capture(verbatim: string) {
    const now = new Date();
    return this.composition.ingestion.ingest({
      origin: 'user_reported',
      actor: 'user',
      sourceRef: `desktop:capture:${randomUUID()}`,
      verbatim,
      language: null,
      time: { semantic: 'capture_time', at: now },
      epistemicRoles: ['user_expression'],
      capturedAt: now,
      derivation: null,
      subject: {
        topicTags: [],
        source: 'desktop_ui',
        relationAxes: [],
        userSelectedRefs: [],
      },
    });
  }

  listRecords(query = '') {
    return query.trim().length > 0
      ? this.composition.records.search({ query, limit: 100 })
      : this.composition.records.listRecent({ limit: 100 });
  }

  suggestRelations(selectedRecordIds: readonly string[]): Promise<readonly RelationSuggestion[]> {
    const requestKey = [...selectedRecordIds].join('\u0000');
    const existing = this.suggestionRequests.get(requestKey);
    if (existing !== undefined) return existing;
    const pending = this.suggestRelationsInternal(selectedRecordIds).finally(() => {
      if (this.suggestionRequests.get(requestKey) === pending) {
        this.suggestionRequests.delete(requestKey);
      }
    });
    this.suggestionRequests.set(requestKey, pending);
    return pending;
  }

  private async suggestRelationsInternal(selectedRecordIds: readonly string[]) {
    const boundedIds = [...new Set(selectedRecordIds)].slice(
      0,
      MAX_RELATION_CONTEXT_RECORDS,
    );
    if (boundedIds.length < 2) {
      throw new Error('At least two Records are required for AI awareness.');
    }
    const records = await Promise.all(
      boundedIds.map((id) => this.composition.records.getById(id)),
    );
    if (records.some((record) => record === null)) {
      throw new Error('One or more selected Records are unavailable.');
    }
    const resolved = records.filter((item) => item !== null);
    const permitted: typeof resolved = [];
    for (const item of resolved) {
      const permissions = await analysisPermissionFor(this.composition, {
        source: 'desktop_ui',
        relationAxes: [],
        userSelectedRefs: [item.id],
        createdAt: item.createdAt,
      });
      if (permissions.allowAnalysis) permitted.push(item);
    }
    if (permitted.length < 2 || permitted[0]?.id !== boundedIds[0]) {
      throw new Error('The active Directive does not permit this AI context.');
    }
    const contextChars = permitted.reduce(
      (total, item) => total + Math.min(item.verbatim?.length ?? 0, MAX_RECORD_CONTEXT_CHARS),
      0,
    );
    if (contextChars > MAX_RELATION_CONTEXT_CHARS) {
      throw new Error('The selected AI context exceeds the local size limit.');
    }
    const createdAt = resolved.reduce(
      (latest, item) =>
        item.createdAt.getTime() > latest.getTime() ? item.createdAt : latest,
      new Date(0),
    );
    const permissions = await analysisPermissionFor(this.composition, {
      source: 'desktop_ui',
      relationAxes: [],
      userSelectedRefs: permitted.map((item) => item.id),
      createdAt,
    });
    const context = permitted.map((item) => ({
      recordId: item.id,
      verbatim: item.verbatim?.slice(0, MAX_RECORD_CONTEXT_CHARS) ?? null,
      timeDescription: item.createdAt.toISOString(),
    }));
    const auditBase = {
      timestamp: new Date().toISOString(),
      provider: this.composition.ai.providerId,
      model: this.composition.ai.getManualModelId(),
      inputRecordIds: context.map((item) => item.recordId),
    };
    const result = await this.composition.ai.suggestRelations({
      authorization: {
        userEnabledAI: this.composition.ai.enabled,
        directiveAllowsAI: permissions.allowAnalysis,
        selectedRecordIds: context.map((item) => item.recordId),
        reason: 'desktop_relation_suggestion',
      },
      records: context,
    });
    if (!result.ok) {
      this.insightAudit.push({ ...auditBase, outcome: 'error', errorType: result.error.kind });
      throw new Error(result.error.message);
    }
    if (
      result.value.language !== 'zh-CN' ||
      !Array.isArray(result.value.suggestions) ||
      result.value.suggestions.some(suggestionContainsObservationBoundaryRisk)
    ) {
      this.insightAudit.push({
        ...auditBase,
        outcome: 'error',
        errorType: 'malformed_response',
      });
      throw new Error('The AI provider returned an observation that cannot be safely shown.');
    }
    if (result.value.status === 'NO_OBSERVATION') {
      this.insightAudit.push({ ...auditBase, outcome: 'no_observation' });
      return [];
    }
    const suggestions = result.value.suggestions;
    this.insightAudit.push({
      ...auditBase,
      outcome: suggestions.length > 0 ? 'candidates' : 'no_candidate',
    });
    return suggestions;
  }

  listAIInsightAudit(): readonly DesktopAIInsightAuditEntry[] {
    return [...this.insightAudit];
  }

  async admitRelation(suggestion: RelationSuggestion, reflectionText?: string) {
    if (reflectionText === undefined || reflectionText.trim().length === 0) {
      throw new Error('A user Reflection is required before Core evaluation.');
    }
    const now = new Date();
    return this.composition.relations.evaluate({
      recordRefs: suggestion.recordRefs.map(recordId),
      subject: {
        topicTags: [],
        source: 'desktop_ui',
        relationAxes: [suggestion.comparisonAxis.dimension],
        userSelectedRefs: suggestion.recordRefs,
        createdAt: now,
      },
      baselineContext: {
        hasReliablePersonalBaseline: true,
        recordSuppliesInternalBaseline: false,
      },
      now,
    });
  }

  /**
   * Meaning-making is the only UI path allowed to reach Core evaluation. The
   * quick choice is a stance about whether to continue understanding the
   * Observation; it is never sent as an approval and never persisted alone.
   */
  async submitObservationReflection(input: {
    readonly suggestion: RelationSuggestion;
    readonly meaning: DesktopObservationMeaning;
    readonly reflectionText?: string;
  }) {
    if (input.meaning === 'not_my_experience') {
      return {
        status: 'discarded' as const,
        message: '已放下这次观察。没有保存长期联系或你的理解。',
      };
    }
    if (
      input.reflectionText === undefined ||
      input.reflectionText.trim().length === 0
    ) {
      return {
        status: 'reflection_required' as const,
        message: '请先写下你的理解；快捷选择本身不会形成长期联系。',
      };
    }

    const evaluation = await this.admitRelation(
      input.suggestion,
      input.reflectionText,
    );
    const target = evaluation.persisted[0]?.id;
    if (target === undefined) {
      return {
        status: 'not_admitted' as const,
        message: '这次理解没有通过必要的边界检查，因此没有保存长期联系。',
      };
    }

    try {
      const reflection = await this.composition.reflectionFlow.respondToRelation({
        targetRef: target,
        feedback: {
          response: null,
          freeText: input.reflectionText,
          leaveForNow: false,
          userInitiatedContinuation: false,
        },
        now: new Date(),
      });
      if (reflection === null || reflection.recordId === null) {
        return {
          status: 'unavailable' as const,
          message: '你的理解没有保存完成；请重试。',
        };
      }
      return {
        status: 'discovery' as const,
        message: '你的理解已保存。系统已完成这次联系评估；它仍不是对你的定义。',
        targetRef: target,
        reflectionRecordId: reflection.recordId,
      };
    } catch {
      return {
        status: 'unavailable' as const,
        message: '你的理解没有保存完成；请重试。',
      };
    }
  }

  listDiscoveries() {
    return this.composition.discovery.listStream({
      now: new Date(),
      relationLimit: 100,
    });
  }

  getReflectionTarget(targetRef: string) {
    return this.composition.reflectionFlow.getRelationTarget(targetRef, new Date());
  }

  async createReflectionInvitation(targetRef: string) {
    const target = await this.getReflectionTarget(targetRef);
    if (target === null) throw new Error('Reflection target is unavailable.');
    const records = await Promise.all(
      target.relation.recordRefs.map((id) => this.composition.records.getById(id)),
    );
    if (records.some((record) => record === null)) {
      throw new Error('Reflection source Records are unavailable.');
    }
    const resolved = records.filter((item) => item !== null);
    const permissions = await analysisPermissionFor(this.composition, {
      source: 'desktop_ui',
      relationAxes: [target.relation.dimension],
      userSelectedRefs: [targetRef, ...target.relation.recordRefs],
      createdAt: target.relation.createdAt,
    });
    const auditBase = {
      timestamp: new Date().toISOString(),
      provider: this.composition.ai.providerId,
      model: this.composition.ai.getManualModelId(),
      inputRecordIds: resolved.map((item) => item.id),
    };
    const result = await this.composition.ai.createReflectionPrompt({
      authorization: {
        userEnabledAI: this.composition.ai.enabled,
        directiveAllowsAI: permissions.allowAnalysis,
        selectedRecordIds: resolved.map((item) => item.id),
        reason: 'desktop_reflection_invitation',
      },
      records: resolved.map((item) => ({
        recordId: item.id,
        verbatim: item.verbatim,
        timeDescription: item.createdAt.toISOString(),
      })),
      focus: target.relation.question,
    });
    if (!result.ok) {
      this.insightAudit.push({ ...auditBase, outcome: 'error', errorType: result.error.kind });
      throw new Error(result.error.message);
    }
    this.insightAudit.push({ ...auditBase, outcome: 'reflection_invitation' });
    return result.value;
  }

  respondToReflection(input: {
    readonly targetRef: string;
    readonly response?: 'accepted' | 'rejected' | 'questioned' | 'uncertain';
    readonly freeText?: string;
    readonly leaveForNow?: boolean;
  }) {
    return this.composition.reflectionFlow.respondToRelation({
      targetRef: input.targetRef,
      feedback: {
        response: input.response ?? null,
        freeText: input.freeText ?? null,
        leaveForNow: input.leaveForNow ?? false,
        userInitiatedContinuation: false,
      },
      now: new Date(),
    });
  }

  exportData(): string {
    return this.composition.storage.exportData();
  }

  restoreData(serialized: string): void {
    this.composition.storage.restoreData(serialized);
  }

  close(): void {
    this.composition.storage.close();
  }
}
