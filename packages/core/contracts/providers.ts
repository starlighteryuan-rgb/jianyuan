import type {
  ExternalReferenceKind,
  RetrievedExternalReference,
} from '../domain/external/external-reference';
import type { Result } from '../domain/shared/result';

export type {
  AbstractionCeilingJudgment,
  CandidateGenerationRequest,
  CandidateGenerationResult,
  ComparabilityJudgment,
  DimensionJudgmentResult,
  EvidenceJudgmentRequest,
  EvidenceJudgmentResult,
  HypothesisAnchorView,
  HypothesisGenerationRequest,
  HypothesisGenerationResult,
  RecordView,
  SemanticJudgmentPort,
} from '../domain/ports/semantic-judgment';

/** Provider-neutral request for outside perspective. */
export interface ExternalReferenceSearchRequest {
  readonly query: string;
  readonly kind: ExternalReferenceKind;
  readonly limit?: number;
}

export interface ExternalReferenceSearchResult {
  readonly references: readonly RetrievedExternalReference[];
  readonly continuationToken: string | null;
}

export type ExternalReferenceProviderError =
  | { readonly kind: 'invalid_request'; readonly detail: string }
  | { readonly kind: 'unavailable'; readonly detail: string }
  | { readonly kind: 'invalid_response'; readonly detail: string };

/**
 * External Reference retrieval seam. Provider adapters only retrieve and map;
 * importing remains an explicit ExternalReferenceService operation.
 */
export interface ExternalReferenceProvider {
  readonly providerId: string;
  search(
    request: ExternalReferenceSearchRequest,
  ): Promise<Result<ExternalReferenceSearchResult, ExternalReferenceProviderError>>;
}
