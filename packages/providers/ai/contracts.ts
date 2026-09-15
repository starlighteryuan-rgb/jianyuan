export type AIProviderErrorKind =
  | 'disabled'
  | 'privacy_boundary'
  | 'invalid_configuration'
  | 'unauthorized'
  | 'endpoint_not_found'
  | 'rate_limited'
  | 'timeout'
  | 'upstream_error'
  | 'malformed_response';

export interface AIProviderError {
  readonly kind: AIProviderErrorKind;
  /** Safe for display. Never contains an API key or upstream response body. */
  readonly message: string;
  readonly retryable: boolean;
  readonly statusCode?: number;
}

export type AIProviderResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AIProviderError };

export interface ProviderModel {
  readonly id: string;
  readonly displayName?: string;
  readonly provider: string;
  readonly ownedBy?: string;
  /**
   * Provider-neutral metadata explicitly returned by the upstream only.
   * Model capabilities are deliberately absent when the upstream omits them.
   */
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface ModelDiscovery {
  readonly modelDiscoverySupported: boolean;
  readonly models: readonly ProviderModel[];
  readonly reason?: 'ai_disabled' | 'upstream_unsupported';
  readonly source: 'upstream' | 'cache' | 'disabled';
}

export interface ModelDiscoveryRequest {
  readonly refresh?: boolean;
}

export interface AIInvocationAuthorization {
  readonly userEnabledAI: boolean;
  readonly directiveAllowsAI: boolean;
  readonly selectedRecordIds: readonly string[];
  /** Human-readable audit purpose; required and sent only as request metadata. */
  readonly reason: string;
}

export interface AIRecordContext {
  readonly recordId: string;
  readonly verbatim: string | null;
  readonly timeDescription?: string;
}

export interface RelationSuggestion {
  /** A possibility for Core gates to inspect, never evidence or a conclusion. */
  readonly kind: 'relation_candidate';
  readonly recordRefs: readonly string[];
  readonly comparisonAxis: {
    readonly question: string;
    readonly dimension: string;
  };
  readonly relationType: string;
  /** The single required user-facing sentence when status is SURFACE. */
  readonly observation: string;
  /** Optional invitation for the user to look again. */
  readonly question?: string;
  /** Optional context that explains why this was noticed. Not a new inference. */
  readonly explanation?: string;
  /** Optional, only when a specific uncertainty matters to understanding. */
  readonly uncertainty?: string;
  readonly assertsTemporalOrdering: boolean;
}

export type RelationSuggestionStatus = 'SURFACE' | 'NO_OBSERVATION';

/**
 * Provider output for one explicit Awareness request.
 *
 * NO_OBSERVATION is a successful, conservative outcome: the provider saw no
 * relation strong enough to put in front of the user. It must not be treated
 * as an error or as a reason to synthesize a candidate from weak signals.
 */
export interface RelationSuggestionResult {
  /** `SURFACE` requires exactly one observation; all other copy is optional. */
  readonly status: RelationSuggestionStatus;
  readonly language: 'zh-CN';
  readonly suggestions: readonly RelationSuggestion[];
}

export interface RelationSuggestionRequest {
  readonly authorization: AIInvocationAuthorization;
  readonly records: readonly AIRecordContext[];
}

export interface ReflectionPromptSuggestion {
  /** An invitation for the user to answer, never a user answer. */
  readonly kind: 'reflection_invitation';
  readonly question: string;
}

export interface ReflectionPromptRequest {
  readonly authorization: AIInvocationAuthorization;
  readonly records: readonly AIRecordContext[];
  readonly focus?: string;
}

export interface AwarenessAIProvider {
  readonly providerId: string;
  readonly enabled: boolean;

  listModels(
    request?: ModelDiscoveryRequest,
  ): Promise<AIProviderResult<ModelDiscovery>>;

  suggestRelations(
    request: RelationSuggestionRequest,
  ): Promise<AIProviderResult<RelationSuggestionResult>>;

  createReflectionPrompt(
    request: ReflectionPromptRequest,
  ): Promise<AIProviderResult<ReflectionPromptSuggestion>>;

  /** Manual Model ID remains usable when model discovery is unsupported. */
  getManualModelId(): string | null;
}

export interface OpenAICompatibleConfig {
  readonly providerId: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs?: number;
  readonly headers?: Readonly<Record<string, string>>;
}
