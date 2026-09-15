/**
 * Offline, deterministic adapter for Core's SemanticJudgmentPort.
 *
 * It is not AI: production defaults return no semantic candidates. Tests may
 * provide explicit candidates to exercise the Core pipeline without a network.
 */
import {
  EVIDENCE_DIMENSIONS,
  type AbstractionCeilingJudgment,
  type CandidateGenerationRequest,
  type CandidateGenerationResult,
  type ComparabilityJudgment,
  type DimensionJudgmentResult,
  type DimensionScore,
  type EvidenceJudgmentRequest,
  type EvidenceJudgmentResult,
  type HypothesisCandidate,
  type HypothesisGenerationRequest,
  type HypothesisGenerationResult,
  type RelationClaimCandidate,
  type SemanticJudgmentPort,
} from '../../core/index';

export interface DeterministicJudgmentScript {
  readonly candidates?: readonly RelationClaimCandidate[];
  readonly hypotheses?: readonly HypothesisCandidate[];
  readonly defaultScore?: DimensionScore;
  readonly comparability?: Partial<ComparabilityJudgment>;
  readonly abstraction?: Partial<AbstractionCeilingJudgment>;
  readonly hypothesisAbstraction?: Partial<AbstractionCeilingJudgment>;
}

export class DeterministicSemanticJudgmentAdapter
  implements SemanticJudgmentPort
{
  constructor(private readonly script: DeterministicJudgmentScript = {}) {}

  async generateCandidates(
    _request: CandidateGenerationRequest,
  ): Promise<CandidateGenerationResult> {
    return { candidates: this.script.candidates ?? [] };
  }

  async judgeComparability(): Promise<ComparabilityJudgment> {
    return {
      operationallySpecific:
        this.script.comparability?.operationallySpecific ?? true,
      sameNature: this.script.comparability?.sameNature ?? true,
      onlySharedCategory:
        this.script.comparability?.onlySharedCategory ?? false,
      explanation:
        this.script.comparability?.explanation ??
        'deterministic comparability judgment',
    };
  }

  async judgeAbstractionCeiling(): Promise<AbstractionCeilingJudgment> {
    return {
      prohibitedClaimDetected:
        this.script.abstraction?.prohibitedClaimDetected ?? false,
      category: this.script.abstraction?.category ?? null,
      explanation:
        this.script.abstraction?.explanation ??
        'deterministic abstraction judgment',
    };
  }

  async judgeEvidenceDimensions(
    _request: EvidenceJudgmentRequest,
  ): Promise<EvidenceJudgmentResult> {
    const judgments: readonly DimensionJudgmentResult[] =
      EVIDENCE_DIMENSIONS.map((dimension) => ({
        dimension,
        status: 'scored' as const,
        score: this.script.defaultScore ?? 2,
        reason: `deterministic reason for ${dimension}`,
      }));

    return { judgments };
  }

  async generateHypotheses(
    _request: HypothesisGenerationRequest,
  ): Promise<HypothesisGenerationResult> {
    return { candidates: this.script.hypotheses ?? [] };
  }

  async judgeHypothesisAbstractionCeiling(): Promise<AbstractionCeilingJudgment> {
    return {
      prohibitedClaimDetected:
        this.script.hypothesisAbstraction?.prohibitedClaimDetected ?? false,
      category: this.script.hypothesisAbstraction?.category ?? null,
      explanation:
        this.script.hypothesisAbstraction?.explanation ??
        'deterministic hypothesis abstraction judgment',
    };
  }
}
