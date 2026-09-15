import type {
  AIProviderResult,
  AwarenessAIProvider,
  ModelDiscovery,
  ReflectionPromptRequest,
  ReflectionPromptSuggestion,
  RelationSuggestion,
  RelationSuggestionRequest,
  RelationSuggestionResult,
} from './contracts';
import {
  EVIDENCE_DIMENSIONS,
  type AbstractionCeilingJudgment,
  type CandidateGenerationRequest,
  type CandidateGenerationResult,
  type ComparabilityJudgment,
  type EvidenceJudgmentRequest,
  type EvidenceJudgmentResult,
  type HypothesisGenerationRequest,
  type HypothesisGenerationResult,
  type SemanticJudgmentPort,
} from '../../core/index';

const disabled = <T>(): AIProviderResult<T> => ({
  ok: false,
  error: {
    kind: 'disabled',
    message: 'AI is disabled. No personal data was sent.',
    retryable: false,
  },
});

/** AI-disabled is a supported product mode, not a startup failure. */
export class DisabledAIProvider
  implements AwarenessAIProvider, SemanticJudgmentPort
{
  readonly providerId = 'disabled';
  readonly enabled = false;

  async listModels(): Promise<AIProviderResult<ModelDiscovery>> {
    return {
      ok: true,
      value: {
        modelDiscoverySupported: false,
        models: [],
        reason: 'ai_disabled',
        source: 'disabled',
      },
    };
  }

  async suggestRelations(
    _request: RelationSuggestionRequest,
  ): Promise<AIProviderResult<RelationSuggestionResult>> {
    return disabled();
  }

  async createReflectionPrompt(
    _request: ReflectionPromptRequest,
  ): Promise<AIProviderResult<ReflectionPromptSuggestion>> {
    return disabled();
  }

  getManualModelId(): null {
    return null;
  }

  async generateCandidates(
    _request: CandidateGenerationRequest,
  ): Promise<CandidateGenerationResult> {
    return { candidates: [] };
  }

  async judgeComparability(): Promise<ComparabilityJudgment> {
    return {
      operationallySpecific: false,
      sameNature: false,
      onlySharedCategory: true,
      explanation: 'AI is disabled; candidate rejected conservatively.',
    };
  }

  async judgeAbstractionCeiling(): Promise<AbstractionCeilingJudgment> {
    return {
      prohibitedClaimDetected: true,
      category: null,
      explanation: 'AI is disabled; candidate rejected conservatively.',
    };
  }

  async judgeEvidenceDimensions(
    _request: EvidenceJudgmentRequest,
  ): Promise<EvidenceJudgmentResult> {
    return {
      judgments: EVIDENCE_DIMENSIONS.map((dimension) => ({
        dimension,
        status: 'unavailable' as const,
        reason: 'AI is disabled; no score was imputed.',
      })),
    };
  }

  async generateHypotheses(
    _request: HypothesisGenerationRequest,
  ): Promise<HypothesisGenerationResult> {
    return { candidates: [] };
  }

  async judgeHypothesisAbstractionCeiling(): Promise<AbstractionCeilingJudgment> {
    return {
      prohibitedClaimDetected: true,
      category: null,
      explanation: 'AI is disabled; hypothesis rejected conservatively.',
    };
  }
}
