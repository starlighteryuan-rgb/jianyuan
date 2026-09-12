/**
 * Deterministic `SemanticJudgmentPort` implementation for tests and local demos.
 *
 * This is NOT a model. It is a scriptable double that returns exactly what a
 * test tells it to, so every gate and every scoring path in the Relation Engine
 * is verifiable without an API key, a network call, or a database.
 *
 * Why this belongs in the repository rather than in a test file: the real LLM
 * adapter is a later, isolated addition behind the same interface, and the
 * end-to-end demo flow needs a judgment source that produces the same answer
 * every run. A non-deterministic demo cannot be a reliable acceptance test.
 *
 * It deliberately implements NO epistemic rule. Permission, eligibility,
 * lineage, arithmetic, and thresholds all stay in the domain — a double that
 * enforced them would let a test pass for the wrong reason.
 */

import type {
  AbstractionCeilingJudgment,
  CandidateGenerationRequest,
  CandidateGenerationResult,
  ComparabilityJudgment,
  DimensionJudgmentResult,
  EvidenceJudgmentRequest,
  EvidenceJudgmentResult,
  ProhibitedAbstractionCategory,
  SemanticJudgmentPort,
} from '../../domain/ports/semantic-judgment';
import {
  EVIDENCE_DIMENSIONS,
  type DimensionScore,
  type EvidenceDimension,
} from '../../domain/relation/evidence-dimensions';
import type {
  ComparisonAxis,
  RelationClaimCandidate,
} from '../../domain/relation/relation-claim';
import type { HypothesisCandidate } from '../../domain/hypothesis/hypothesis';

export interface ScriptedComparability {
  readonly operationallySpecific?: boolean;
  readonly sameNature?: boolean;
  readonly onlySharedCategory?: boolean;
  readonly explanation?: string;
}

export interface ScriptedAbstraction {
  readonly prohibitedClaimDetected?: boolean;
  readonly category?: ProhibitedAbstractionCategory | null;
  readonly explanation?: string;
}

/**
 * A dimension the double should decline to score, so the "unscorable" path is
 * exercisable (docs/architecture.md §11 Patch 9).
 */
export interface ScriptedUnavailableDimension {
  readonly dimension: EvidenceDimension;
  readonly reason: string;
}

export interface DeterministicScript {
  readonly candidates?: readonly RelationClaimCandidate[];
  /** Hypothesis candidates returned by `generateHypotheses`. */
  readonly hypotheses?: readonly HypothesisCandidate[];
  /**
   * Gate H6 judgment. Kept separate from `abstraction` so a test can allow a
   * Relation through while flagging the Hypothesis built on it.
   */
  readonly hypothesisAbstraction?: ScriptedAbstraction;
  readonly comparability?: ScriptedComparability;
  readonly abstraction?: ScriptedAbstraction;
  /** Uniform score for every dimension unless overridden below. */
  readonly defaultScore?: DimensionScore;
  /** Per-dimension score overrides. */
  readonly scores?: Partial<Record<EvidenceDimension, DimensionScore>>;
  readonly unavailable?: readonly ScriptedUnavailableDimension[];
  /** Dimensions to omit entirely, to test incomplete model output. */
  readonly omit?: readonly EvidenceDimension[];
  /**
   * Score the double reports for Specificity regardless of the ceiling, used to
   * prove the domain clamps rather than trusting the model (§10.4, INV-15).
   */
  readonly ignoreBaselineCeiling?: boolean;
}

export class DeterministicSemanticJudgment implements SemanticJudgmentPort {
  constructor(private readonly script: DeterministicScript = {}) {}

  /** Calls received, for asserting that a gate short-circuited before the model. */
  readonly calls: {
    generateCandidates: number;
    judgeComparability: number;
    judgeAbstractionCeiling: number;
    judgeEvidenceDimensions: number;
    generateHypotheses: number;
    judgeHypothesisAbstractionCeiling: number;
  } = {
    generateCandidates: 0,
    judgeComparability: 0,
    judgeAbstractionCeiling: 0,
    judgeEvidenceDimensions: 0,
    generateHypotheses: 0,
    judgeHypothesisAbstractionCeiling: 0,
  };

  async generateCandidates(
    _request: CandidateGenerationRequest,
  ): Promise<CandidateGenerationResult> {
    this.calls.generateCandidates += 1;
    return { candidates: this.script.candidates ?? [] };
  }

  async judgeComparability(_request: {
    readonly records: readonly unknown[];
    readonly comparisonAxis: ComparisonAxis;
    readonly relationType: string;
  }): Promise<ComparabilityJudgment> {
    this.calls.judgeComparability += 1;
    const s = this.script.comparability ?? {};

    return {
      operationallySpecific: s.operationallySpecific ?? true,
      sameNature: s.sameNature ?? true,
      onlySharedCategory: s.onlySharedCategory ?? false,
      explanation: s.explanation ?? 'scripted comparability judgment',
    };
  }

  async judgeAbstractionCeiling(_request: {
    readonly relationType: string;
    readonly comparisonAxis: ComparisonAxis;
    readonly evidenceSummary: string;
  }): Promise<AbstractionCeilingJudgment> {
    this.calls.judgeAbstractionCeiling += 1;
    const s = this.script.abstraction ?? {};

    return {
      prohibitedClaimDetected: s.prohibitedClaimDetected ?? false,
      category: s.category ?? null,
      explanation: s.explanation ?? 'scripted abstraction judgment',
    };
  }

  async judgeEvidenceDimensions(
    request: EvidenceJudgmentRequest,
  ): Promise<EvidenceJudgmentResult> {
    this.calls.judgeEvidenceDimensions += 1;

    const omitted = new Set<string>(this.script.omit ?? []);
    const unavailable = new Map(
      (this.script.unavailable ?? []).map((u) => [u.dimension, u.reason]),
    );

    const judgments = EVIDENCE_DIMENSIONS.flatMap<DimensionJudgmentResult>(
      (dimension) => {
        if (omitted.has(dimension)) return [];

        const declined = unavailable.get(dimension);
        if (declined !== undefined) {
          return [{ dimension, status: 'unavailable', reason: declined }];
        }

        return [
          {
            dimension,
            status: 'scored',
            score:
              this.script.scores?.[dimension] ?? this.script.defaultScore ?? 2,
            reason: `scripted reason for ${dimension}`,
          },
        ];
      },
    );

    // The double intentionally ignores `baselineContext` when scripted to, so a
    // test can confirm the DOMAIN applies the §10.4 ceiling rather than relying
    // on the model to respect it.
    void request.baselineContext;

    return { judgments };
  }

  /* ── Hypothesis stage ────────────────────────────────────────────────── */

  async generateHypotheses(_request: {
    readonly claims: readonly unknown[];
  }): Promise<{ readonly candidates: readonly HypothesisCandidate[] }> {
    this.calls.generateHypotheses += 1;
    return { candidates: this.script.hypotheses ?? [] };
  }

  async judgeHypothesisAbstractionCeiling(_request: {
    readonly explanation: string;
    readonly mechanism: string;
  }): Promise<AbstractionCeilingJudgment> {
    this.calls.judgeHypothesisAbstractionCeiling += 1;
    const s = this.script.hypothesisAbstraction ?? {};

    return {
      prohibitedClaimDetected: s.prohibitedClaimDetected ?? false,
      category: s.category ?? null,
      explanation: s.explanation ?? 'scripted hypothesis abstraction judgment',
    };
  }
}
