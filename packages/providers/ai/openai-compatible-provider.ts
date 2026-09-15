import type {
  AIInvocationAuthorization,
  AIProviderError,
  AIProviderResult,
  AwarenessAIProvider,
  ModelDiscovery,
  ModelDiscoveryRequest,
  OpenAICompatibleConfig,
  ProviderModel,
  ReflectionPromptRequest,
  ReflectionPromptSuggestion,
  RelationSuggestion,
  RelationSuggestionRequest,
} from './contracts';
import {
  EVIDENCE_DIMENSIONS,
  isDimensionScore,
  recordId,
  type AbstractionCeilingJudgment,
  type CandidateGenerationRequest,
  type CandidateGenerationResult,
  type ComparabilityJudgment,
  type DimensionJudgmentResult,
  type EvidenceDimension,
  type EvidenceJudgmentRequest,
  type EvidenceJudgmentResult,
  type HypothesisGenerationRequest,
  type HypothesisGenerationResult,
  type SemanticJudgmentPort,
} from '../../core/index';
import { PROHIBITED_ABSTRACTION_CATEGORIES } from '../../core/domain/ports/semantic-judgment';

type FetchLike = typeof fetch;

interface CacheIdentity {
  readonly providerId: string;
  readonly baseUrl: string;
  readonly apiKey: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const containsIdentityOrDiagnosisClaim = (value: string): boolean =>
  /\b(?:you are|your personality|your identity|diagnos(?:e|is)|proves? that you)\b/i.test(
    value,
  ) ||
  /你就是|说明你|证明你|你的人格|你的身份|心理诊断|本质上是|你本质上|你(?:总是|永远|天生|一定是)|你(?:害怕|担心|在逃避|逃避|潜意识|内心)/.test(
    value,
  );

const fail = (
  kind: AIProviderError['kind'],
  message: string,
  retryable: boolean,
  statusCode?: number,
): AIProviderResult<never> => ({
  ok: false,
  error:
    statusCode === undefined
      ? { kind, message, retryable }
      : { kind, message, retryable, statusCode },
});

const safeStatusError = (status: number): AIProviderResult<never> => {
  if (status === 401 || status === 403) {
    return fail(
      'unauthorized',
      'The AI provider rejected the credentials.',
      false,
      status,
    );
  }
  if (status === 404) {
    return fail(
      'endpoint_not_found',
      'The configured AI endpoint was not found.',
      false,
      status,
    );
  }
  if (status === 429) {
    return fail(
      'rate_limited',
      'The AI provider rate limit was reached.',
      true,
      status,
    );
  }
  return fail(
    'upstream_error',
    `The AI provider returned HTTP ${status}.`,
    status >= 500,
    status,
  );
};

const validateAuthorization = (
  authorization: AIInvocationAuthorization,
  contextRecordIds: readonly string[],
  minimumRecords: number,
): AIProviderResult<true> => {
  if (!authorization.userEnabledAI) {
    return fail('disabled', 'AI is disabled. No personal data was sent.', false);
  }
  if (!authorization.directiveAllowsAI) {
    return fail(
      'privacy_boundary',
      'The active directive does not allow this AI request.',
      false,
    );
  }
  if (authorization.reason.trim().length === 0) {
    return fail(
      'privacy_boundary',
      'An explicit reason is required before sending context to AI.',
      false,
    );
  }

  const selected = new Set(authorization.selectedRecordIds);
  const context = new Set(contextRecordIds);
  if (
    selected.size < minimumRecords ||
    selected.size !== authorization.selectedRecordIds.length ||
    context.size !== contextRecordIds.length ||
    selected.size !== context.size ||
    [...context].some((id) => !selected.has(id))
  ) {
    return fail(
      'privacy_boundary',
      'AI context must exactly match the explicitly selected records.',
      false,
    );
  }

  return { ok: true, value: true };
};

const primitiveMetadata = (
  row: Record<string, unknown>,
): Readonly<Record<string, string | number | boolean | null>> | undefined => {
  const metadata: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id' || key === 'name' || key === 'display_name' || key === 'owned_by') {
      continue;
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      metadata[key] = value;
    }
  }
  return Object.keys(metadata).length === 0 ? undefined : metadata;
};

/** Direct-HTTP OpenAI-compatible provider. HTTP paths and auth stay here. */
export class OpenAICompatibleProvider
  implements AwarenessAIProvider, SemanticJudgmentPort
{
  private config: OpenAICompatibleConfig;
  private readonly fetcher: FetchLike;
  private cachedDiscovery: ModelDiscovery | null = null;
  private cacheIdentity: CacheIdentity | null = null;

  constructor(config: OpenAICompatibleConfig, fetcher: FetchLike = fetch) {
    this.config = config;
    this.fetcher = fetcher;
  }

  get providerId(): string {
    return this.config.providerId;
  }

  readonly enabled = true;

  getManualModelId(): string | null {
    const model = this.config.model.trim();
    return model.length === 0 ? null : model;
  }

  /** Runtime settings can replace configuration without retaining stale models. */
  updateConfig(config: OpenAICompatibleConfig): void {
    const identityChanged =
      config.providerId !== this.config.providerId ||
      config.baseUrl !== this.config.baseUrl ||
      config.apiKey !== this.config.apiKey;
    this.config = config;
    if (identityChanged) this.clearModelCache();
  }

  clearModelCache(): void {
    this.cachedDiscovery = null;
    this.cacheIdentity = null;
  }

  async listModels(
    request: ModelDiscoveryRequest = {},
  ): Promise<AIProviderResult<ModelDiscovery>> {
    const validation = this.validateConfiguration(false);
    if (!validation.ok) return validation;

    if (
      !request.refresh &&
      this.cachedDiscovery !== null &&
      this.cacheIdentity !== null &&
      this.identityMatches(this.cacheIdentity)
    ) {
      return {
        ok: true,
        value: { ...this.cachedDiscovery, source: 'cache' },
      };
    }

    const response = await this.requestJson(this.endpoint('models'), {
      method: 'GET',
    });
    if (!response.ok) {
      if (
        response.error.statusCode === 404 ||
        response.error.statusCode === 405 ||
        response.error.statusCode === 501
      ) {
        const unsupported: ModelDiscovery = {
          modelDiscoverySupported: false,
          models: [],
          reason: 'upstream_unsupported',
          source: 'upstream',
        };
        this.saveDiscovery(unsupported);
        return { ok: true, value: unsupported };
      }
      return response;
    }

    if (!isObject(response.value) || !Array.isArray(response.value.data)) {
      return fail(
        'malformed_response',
        'The AI provider returned a malformed model list.',
        false,
      );
    }

    const models: ProviderModel[] = [];
    for (const item of response.value.data) {
      if (!isObject(item) || !nonEmptyString(item.id)) {
        return fail(
          'malformed_response',
          'The AI provider returned a malformed model entry.',
          false,
        );
      }
      const displayName = nonEmptyString(item.display_name)
        ? item.display_name
        : nonEmptyString(item.name)
          ? item.name
          : undefined;
      const ownedBy = nonEmptyString(item.owned_by) ? item.owned_by : undefined;
      const metadata = primitiveMetadata(item);
      models.push({
        id: item.id,
        provider: this.config.providerId,
        ...(displayName === undefined ? {} : { displayName }),
        ...(ownedBy === undefined ? {} : { ownedBy }),
        ...(metadata === undefined ? {} : { metadata }),
      });
    }

    const discovery: ModelDiscovery = {
      modelDiscoverySupported: true,
      models,
      source: 'upstream',
    };
    this.saveDiscovery(discovery);
    return { ok: true, value: discovery };
  }

  async suggestRelations(
    request: RelationSuggestionRequest,
  ): Promise<AIProviderResult<readonly RelationSuggestion[]>> {
    const authorized = validateAuthorization(
      request.authorization,
      request.records.map((record) => record.recordId),
      2,
    );
    if (!authorized.ok) return authorized;

    const result = await this.completeJson(
      'You suggest tentative, descriptive relations between selected personal records. Do not diagnose, infer personality or identity, assert hidden motives, or answer for the user. Return JSON only: {"suggestions":[{"recordRefs":["..."],"comparisonAxis":{"question":"...","dimension":"..."},"relationType":"...","evidenceSummary":"...","assertsTemporalOrdering":false}]}. Every item is only a candidate for later deterministic gates.',
      {
        purpose: request.authorization.reason,
        selectedRecords: request.records,
      },
    );
    if (!result.ok) return result;
    if (!isObject(result.value) || !Array.isArray(result.value.suggestions)) {
      return fail(
        'malformed_response',
        'The AI provider returned malformed relation suggestions.',
        false,
      );
    }

    const allowed = new Set(request.authorization.selectedRecordIds);
    const suggestions: RelationSuggestion[] = [];
    for (const item of result.value.suggestions) {
      if (
        !isObject(item) ||
        !Array.isArray(item.recordRefs) ||
        item.recordRefs.length < 2 ||
        !item.recordRefs.every(nonEmptyString) ||
        new Set(item.recordRefs).size !== item.recordRefs.length ||
        item.recordRefs.some((id) => !allowed.has(id)) ||
        !isObject(item.comparisonAxis) ||
        !nonEmptyString(item.comparisonAxis.question) ||
        !nonEmptyString(item.comparisonAxis.dimension) ||
        !nonEmptyString(item.relationType) ||
        !nonEmptyString(item.evidenceSummary) ||
        typeof item.assertsTemporalOrdering !== 'boolean' ||
        containsIdentityOrDiagnosisClaim(item.comparisonAxis.question) ||
        containsIdentityOrDiagnosisClaim(item.comparisonAxis.dimension) ||
        containsIdentityOrDiagnosisClaim(item.relationType) ||
        containsIdentityOrDiagnosisClaim(item.evidenceSummary)
      ) {
        return fail(
          'malformed_response',
          'The AI provider returned malformed relation suggestions.',
          false,
        );
      }
      suggestions.push({
        kind: 'relation_candidate',
        recordRefs: item.recordRefs,
        comparisonAxis: {
          question: item.comparisonAxis.question,
          dimension: item.comparisonAxis.dimension,
        },
        relationType: item.relationType,
        evidenceSummary: item.evidenceSummary,
        assertsTemporalOrdering: item.assertsTemporalOrdering,
      });
    }
    return { ok: true, value: suggestions };
  }

  async createReflectionPrompt(
    request: ReflectionPromptRequest,
  ): Promise<AIProviderResult<ReflectionPromptSuggestion>> {
    const authorized = validateAuthorization(
      request.authorization,
      request.records.map((record) => record.recordId),
      1,
    );
    if (!authorized.ok) return authorized;

    const result = await this.completeJson(
      'Create one brief reflection invitation about the selected personal records. Ask a question; never answer for the user, diagnose them, define their identity, or state a conclusion. Return JSON only: {"question":"..."}.',
      {
        purpose: request.authorization.reason,
        selectedRecords: request.records,
        ...(request.focus === undefined ? {} : { focus: request.focus }),
      },
    );
    if (!result.ok) return result;
    if (
      !isObject(result.value) ||
      !nonEmptyString(result.value.question) ||
      containsIdentityOrDiagnosisClaim(result.value.question)
    ) {
      return fail(
        'malformed_response',
        'The AI provider returned a malformed reflection invitation.',
        false,
      );
    }
    return {
      ok: true,
      value: {
        kind: 'reflection_invitation',
        question: result.value.question,
      },
    };
  }

  /**
   * Core semantic-port bridge. Relation suggestions enter only as candidates;
   * Core still owns permission gates, admissibility, scoring, and persistence.
   */
  async generateCandidates(
    request: CandidateGenerationRequest,
  ): Promise<CandidateGenerationResult> {
    const result = await this.suggestRelations({
      authorization: {
        userEnabledAI: true,
        directiveAllowsAI: true,
        selectedRecordIds: request.records.map((item) => item.recordId),
        reason: 'relation_candidate_generation_after_core_directive_gate',
      },
      records: request.records.map((item) => ({
        recordId: item.recordId,
        verbatim: item.verbatim,
        timeDescription: item.timeDescription,
      })),
    });
    if (!result.ok) return { candidates: [] };
    return {
      candidates: result.value.map((suggestion) => ({
        recordRefs: suggestion.recordRefs.map(recordId),
        comparisonAxis: suggestion.comparisonAxis,
        relationType: suggestion.relationType,
        evidenceSummary: suggestion.evidenceSummary,
        assertsTemporalOrdering: suggestion.assertsTemporalOrdering,
      })),
    };
  }

  async judgeComparability(request: {
    readonly records: CandidateGenerationRequest['records'];
    readonly comparisonAxis: { readonly question: string; readonly dimension: string };
    readonly relationType: string;
  }): Promise<ComparabilityJudgment> {
    const authorized = validateAuthorization(
      {
        userEnabledAI: true,
        directiveAllowsAI: true,
        selectedRecordIds: request.records.map((item) => item.recordId),
        reason: 'relation_comparability_after_core_directive_gate',
      },
      request.records.map((item) => item.recordId),
      2,
    );
    if (!authorized.ok) return this.conservativeComparability();
    const result = await this.completeJson(
      'Judge only operational comparability for a tentative relation. Return JSON only: {"operationallySpecific":boolean,"sameNature":boolean,"onlySharedCategory":boolean,"explanation":"..."}. Do not diagnose or infer identity.',
      {
        purpose: 'relation_comparability_after_core_directive_gate',
        ...request,
      },
    );
    if (
      !result.ok ||
      !isObject(result.value) ||
      typeof result.value.operationallySpecific !== 'boolean' ||
      typeof result.value.sameNature !== 'boolean' ||
      typeof result.value.onlySharedCategory !== 'boolean' ||
      !nonEmptyString(result.value.explanation)
    ) {
      return this.conservativeComparability();
    }
    return {
      operationallySpecific: result.value.operationallySpecific,
      sameNature: result.value.sameNature,
      onlySharedCategory: result.value.onlySharedCategory,
      explanation: result.value.explanation,
    };
  }

  async judgeAbstractionCeiling(request: {
    readonly relationType: string;
    readonly comparisonAxis: { readonly question: string; readonly dimension: string };
    readonly evidenceSummary: string;
  }): Promise<AbstractionCeilingJudgment> {
    return this.abstractionJudgment(
      'Check whether this tentative descriptive relation crosses the abstraction ceiling. Return JSON only: {"prohibitedClaimDetected":boolean,"category":null|"personality"|"identity"|"permanent_trait"|"hidden_motive"|"certain_causal_explanation","explanation":"..."}. When uncertain, prohibit it.',
      {
        purpose: 'relation_abstraction_check_after_core_directive_gate',
        ...request,
      },
    );
  }

  async judgeEvidenceDimensions(
    request: EvidenceJudgmentRequest,
  ): Promise<EvidenceJudgmentResult> {
    const authorized = validateAuthorization(
      {
        userEnabledAI: true,
        directiveAllowsAI: true,
        selectedRecordIds: request.records.map((item) => item.recordId),
        reason: 'relation_evidence_judgment_after_core_directive_gate',
      },
      request.records.map((item) => item.recordId),
      2,
    );
    if (!authorized.ok) return this.unavailableDimensions();
    const result = await this.completeJson(
      `Judge the six evidence dimensions for a descriptive relation on the integer scale 0..3. Return JSON only: {"judgments":[{"dimension":"...","status":"scored"|"unavailable","score":0|1|2|3,"reason":"..."}]}. Include each of: ${EVIDENCE_DIMENSIONS.join(', ')}. Never diagnose, infer identity, or turn user agreement into evidence.`,
      {
        purpose: 'relation_evidence_judgment_after_core_directive_gate',
        ...request,
      },
    );
    if (!result.ok || !isObject(result.value) || !Array.isArray(result.value.judgments)) {
      return this.unavailableDimensions();
    }

    const judgments: DimensionJudgmentResult[] = [];
    const seen = new Set<EvidenceDimension>();
    for (const item of result.value.judgments) {
      if (
        !isObject(item) ||
        !EVIDENCE_DIMENSIONS.includes(item.dimension as EvidenceDimension) ||
        seen.has(item.dimension as EvidenceDimension) ||
        !nonEmptyString(item.reason)
      ) {
        return this.unavailableDimensions();
      }
      const dimension = item.dimension as EvidenceDimension;
      seen.add(dimension);
      if (item.status === 'unavailable') {
        judgments.push({ dimension, status: 'unavailable', reason: item.reason });
      } else if (
        item.status === 'scored' &&
        typeof item.score === 'number' &&
        isDimensionScore(item.score)
      ) {
        judgments.push({
          dimension,
          status: 'scored',
          score: item.score,
          reason: item.reason,
        });
      } else {
        return this.unavailableDimensions();
      }
    }
    return seen.size === EVIDENCE_DIMENSIONS.length
      ? { judgments }
      : this.unavailableDimensions();
  }

  /** Hypothesis generation is intentionally outside the V1 AI capability. */
  async generateHypotheses(
    _request: HypothesisGenerationRequest,
  ): Promise<HypothesisGenerationResult> {
    return { candidates: [] };
  }

  async judgeHypothesisAbstractionCeiling(request: {
    readonly explanation: string;
    readonly mechanism: string;
  }): Promise<AbstractionCeilingJudgment> {
    return this.abstractionJudgment(
      'Check whether this possible explanation crosses the abstraction ceiling. Return JSON only: {"prohibitedClaimDetected":boolean,"category":null|"personality"|"identity"|"permanent_trait"|"hidden_motive"|"certain_causal_explanation","explanation":"..."}. When uncertain, prohibit it.',
      {
        purpose: 'hypothesis_abstraction_check_after_core_directive_gate',
        ...request,
      },
    );
  }

  private validateConfiguration(requireModel: boolean): AIProviderResult<true> {
    if (
      this.config.providerId.trim().length === 0 ||
      this.config.baseUrl.trim().length === 0 ||
      this.config.apiKey.trim().length === 0 ||
      (requireModel && this.config.model.trim().length === 0)
    ) {
      return fail(
        'invalid_configuration',
        'The AI provider configuration is incomplete.',
        false,
      );
    }
    try {
      const url = new URL(this.config.baseUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    } catch {
      return fail(
        'invalid_configuration',
        'The AI provider Base URL is invalid.',
        false,
      );
    }
    return { ok: true, value: true };
  }

  private endpoint(resource: 'models' | 'chat/completions'): string {
    const base = this.config.baseUrl.replace(/\/+$/, '');
    return /\/v1$/i.test(base)
      ? `${base}/${resource}`
      : `${base}/v1/${resource}`;
  }

  private async completeJson(
    system: string,
    input: unknown,
  ): Promise<AIProviderResult<unknown>> {
    const validation = this.validateConfiguration(true);
    if (!validation.ok) return validation;
    const response = await this.requestJson(this.endpoint('chat/completions'), {
      method: 'POST',
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(input) },
        ],
      }),
    });
    if (!response.ok) return response;
    if (
      !isObject(response.value) ||
      !Array.isArray(response.value.choices) ||
      !isObject(response.value.choices[0]) ||
      !isObject(response.value.choices[0].message) ||
      !nonEmptyString(response.value.choices[0].message.content)
    ) {
      return fail(
        'malformed_response',
        'The AI provider returned a malformed completion.',
        false,
      );
    }
    try {
      return {
        ok: true,
        value: JSON.parse(response.value.choices[0].message.content) as unknown,
      };
    } catch {
      return fail(
        'malformed_response',
        'The AI provider returned malformed structured output.',
        false,
      );
    }
  }

  private conservativeComparability(): ComparabilityJudgment {
    return {
      operationallySpecific: false,
      sameNature: false,
      onlySharedCategory: true,
      explanation: 'AI judgment unavailable; candidate rejected conservatively.',
    };
  }

  private unavailableDimensions(): EvidenceJudgmentResult {
    return {
      judgments: EVIDENCE_DIMENSIONS.map((dimension) => ({
        dimension,
        status: 'unavailable' as const,
        reason: 'AI judgment unavailable; no score was imputed.',
      })),
    };
  }

  private async abstractionJudgment(
    system: string,
    request: unknown,
  ): Promise<AbstractionCeilingJudgment> {
    const result = await this.completeJson(system, request);
    if (
      !result.ok ||
      !isObject(result.value) ||
      typeof result.value.prohibitedClaimDetected !== 'boolean' ||
      !nonEmptyString(result.value.explanation) ||
      !(
        result.value.category === null ||
        PROHIBITED_ABSTRACTION_CATEGORIES.includes(
          result.value.category as (typeof PROHIBITED_ABSTRACTION_CATEGORIES)[number],
        )
      )
    ) {
      return {
        prohibitedClaimDetected: true,
        category: null,
        explanation: 'AI judgment unavailable; candidate rejected conservatively.',
      };
    }
    return {
      prohibitedClaimDetected: result.value.prohibitedClaimDetected,
      category: result.value.category as AbstractionCeilingJudgment['category'],
      explanation: result.value.explanation,
    };
  }

  private async requestJson(
    url: string,
    init: Pick<RequestInit, 'method' | 'body'>,
  ): Promise<AIProviderResult<unknown>> {
    const timeoutMs = this.config.timeoutMs ?? 30_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetcher(url, {
        ...init,
        signal: controller.signal,
        headers: {
          ...this.config.headers,
          authorization: `Bearer ${this.config.apiKey}`,
          'content-type': 'application/json',
        },
      });
      if (!response.ok) return safeStatusError(response.status);
      try {
        return { ok: true, value: (await response.json()) as unknown };
      } catch {
        return fail(
          'malformed_response',
          'The AI provider returned malformed JSON.',
          false,
        );
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return fail('timeout', 'The AI provider request timed out.', true);
      }
      return fail(
        'upstream_error',
        'The AI provider could not be reached at the configured endpoint.',
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private identityMatches(identity: CacheIdentity): boolean {
    return (
      identity.providerId === this.config.providerId &&
      identity.baseUrl === this.config.baseUrl &&
      identity.apiKey === this.config.apiKey
    );
  }

  private saveDiscovery(discovery: ModelDiscovery): void {
    this.cachedDiscovery = discovery;
    this.cacheIdentity = {
      providerId: this.config.providerId,
      baseUrl: this.config.baseUrl,
      apiKey: this.config.apiKey,
    };
  }
}
