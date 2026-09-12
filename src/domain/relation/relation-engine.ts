/**
 * Relation Engine — the five-stage pipeline (ENGINEERING_CONTRACT §34).
 *
 *   Candidate Generation → Evidence Admissibility → Claim Validation
 *   → Evidence Scoring → State Transition
 *
 * §34's governing principle:
 *
 *   > 底层追求开放性，上层追求克制。 / 宽观察，严证据，少呈现。
 *
 * So generation is deliberately permissive and everything after it is strict.
 *
 * The engine depends on `SemanticJudgmentPort` (a port, so the domain still
 * owns the interface) but on NO repository. It receives already-resolved
 * records and returns claims to be persisted; the application layer does the
 * I/O. That keeps the whole pipeline verifiable with a deterministic judgment
 * double and no database.
 *
 * Stage ordering is contract-mandated, not stylistic:
 *   - Gates run BEFORE scoring (§8: "Before evidence scoring...").
 *   - Gate 4 precedes Temporal Adequacy scoring (§10.3: "Only scored AFTER
 *     Temporal Legibility passes").
 *   - Admissibility (code-only gates) runs before validation (model-informed
 *     gates), so an impermissible or ineligible candidate never reaches the
 *     model at all. That is both cheaper and safer: Gate 1 forbids the analysis,
 *     so performing it to decide whether it was allowed would be incoherent.
 */

import {
  type GateFailure,
  gateAbstractionCeiling,
  gateEpistemicEligibility,
  gateLineageIntegrity,
  gateOperationalComparability,
  gateTemporalLegibility,
  gateUsagePermission,
  missingRecordRefs,
} from './gates';
import {
  type DimensionJudgment,
  type DimensionJudgments,
  EVIDENCE_DIMENSIONS,
  type EvidenceDimension,
  specificityCeiling,
} from './evidence-dimensions';
import {
  type EvidenceScoringError,
  assessEvidence,
} from './evidence-score';
import {
  type RelationClaimCandidate,
  type StoredRelationClaim,
  buildStoredClaim,
} from './relation-claim';
import type {
  RecordView,
  SemanticJudgmentPort,
} from '../ports/semantic-judgment';
import type { EffectivePermissions } from '../directive/directive-resolution';
import type { PersonalRecord } from '../record/record';
import { relationClaimId } from '../shared/ids';
import type { RecordId } from '../shared/ids';
import { isReportedInterval } from '../shared/time-semantics';

/** Baseline context for Specificity (§10.4). Supplied by code (INV-15). */
export interface BaselineContext {
  readonly hasReliablePersonalBaseline: boolean;
  readonly recordSuppliesInternalBaseline: boolean;
}

export interface RelationClaimIdGenerator {
  nextRelationClaimId(): string;
}

export interface RelationEvaluationInput {
  readonly records: readonly PersonalRecord[];
  readonly permissions: EffectivePermissions;
  readonly baselineContext: BaselineContext;
  readonly now: Date;
  readonly ids: RelationClaimIdGenerator;
}

export interface RejectedCandidate {
  readonly candidate: RelationClaimCandidate;
  readonly failures: readonly GateFailure[];
}

export interface UnscoredCandidate {
  readonly candidate: RelationClaimCandidate;
  readonly cause: EvidenceScoringError;
}

/**
 * The result of one evaluation pass.
 *
 * `noSufficientRelation` is an EVALUATION OUTCOME (§7.2) — never a
 * `relationType` value, never a permanent classification. New records may
 * change a later evaluation while this historical evaluation remains
 * historically valid, which is why the outcome carries `evaluatedAt`.
 */
export interface RelationEvaluationOutcome {
  readonly admitted: readonly StoredRelationClaim[];
  readonly rejected: readonly RejectedCandidate[];
  /**
   * Candidates that passed every gate but could not be scored, because a
   * dimension judgment was unusable. Retained explicitly rather than dropped
   * or defaulted (docs/architecture.md §11 Patch 9).
   */
  readonly unscored: readonly UnscoredCandidate[];
  /** True iff no claim was admitted. An outcome, not a relation type. */
  readonly noSufficientRelation: boolean;
  readonly evaluatedAt: Date;
}

/* ── Record views handed to the model ─────────────────────────────────── */

/**
 * Project a Record for the model.
 *
 * `evidenceUnitId` and `sourceFingerprint` are withheld: independence identity
 * is code's concern (INV-16), and exposing it would invite the model to reason
 * about double counting rather than describe what it observes.
 */
export const toRecordView = (record: PersonalRecord): RecordView => ({
  recordId: record.id,
  epistemicRoles: record.epistemicRoles,
  verbatim: record.rawExpression?.verbatim ?? null,
  timeDescription: isReportedInterval(record.time)
    ? `user-reported interval: ${record.time.reportedAs}`
    : record.time.at.toISOString(),
  timeSemantic: record.time.semantic,
});

const selectRecords = (
  all: readonly PersonalRecord[],
  refs: readonly RecordId[],
): readonly PersonalRecord[] => {
  const wanted = new Set<string>(refs);
  return all.filter((r) => wanted.has(r.id));
};

/* ── Stage 4 helper: assemble dimension judgments ─────────────────────── */

/**
 * Convert the model's per-dimension results into a complete judgment set,
 * applying the §10.4 Specificity ceiling in CODE.
 *
 * Two deterministic protections:
 *
 *   1. A dimension the model omitted entirely becomes `needs_retry`, not a
 *      default number. Silence is not a score.
 *
 *   2. Specificity is CLAMPED to `specificityCeiling`. §10.4 states that
 *      without a reliable Personal Baseline — and without an internal baseline
 *      in the record — the dimension normally cannot exceed 1. INV-15 forbids
 *      inventing a baseline, so the ceiling is enforced here rather than
 *      trusted to the model's restraint. The clamp is recorded in the reason so
 *      it stays auditable (§42).
 */
export const assembleJudgments = (
  results: readonly {
    readonly dimension: EvidenceDimension;
    readonly status: 'scored' | 'unavailable';
    readonly score?: number;
    readonly reason: string;
  }[],
  baseline: BaselineContext,
): DimensionJudgments => {
  const ceiling = specificityCeiling(baseline);

  const entries = EVIDENCE_DIMENSIONS.map<
    readonly [EvidenceDimension, DimensionJudgment]
  >((dimension) => {
    const result = results.find((r) => r.dimension === dimension);

    if (result === undefined) {
      return [
        dimension,
        {
          status: 'needs_retry',
          reason: `No judgment returned for ${dimension}.`,
        },
      ];
    }

    if (result.status !== 'scored' || result.score === undefined) {
      return [dimension, { status: 'unavailable', reason: result.reason }];
    }

    // Validate the scale BEFORE clamping, so an out-of-range score is surfaced
    // as a defect rather than quietly absorbed by the ceiling.
    const score = result.score;
    const narrowed =
      score === 0 ? 0 : score === 1 ? 1 : score === 2 ? 2 : score === 3 ? 3 : null;

    if (narrowed === null) {
      return [
        dimension,
        {
          status: 'needs_retry',
          reason: `Score ${score} for ${dimension} is outside the 0–3 scale.`,
        },
      ];
    }

    if (dimension === 'specificity_baseline_contrast' && narrowed > ceiling) {
      // §10.4: without a reliable Personal Baseline and without an internal
      // baseline in the record, this dimension cannot exceed 1. Enforced here
      // in code because INV-15 forbids inventing a baseline, and the clamp is
      // recorded in the reason so it stays auditable (§42).
      return [
        dimension,
        {
          status: 'scored',
          score: 1,
          reason:
            `${result.reason} [clamped from ${narrowed} to ${ceiling} by ` +
            '§10.4: no reliable Personal Baseline and no internal baseline in ' +
            'the record; a baseline must not be invented (INV-15).]',
        },
      ];
    }

    return [dimension, { status: 'scored', score: narrowed, reason: result.reason }];
  });

  return Object.fromEntries(entries) as DimensionJudgments;
};

/* ── The pipeline ─────────────────────────────────────────────────────── */

export class RelationEngine {
  constructor(private readonly judgment: SemanticJudgmentPort) {}

  async evaluate(
    input: RelationEvaluationInput,
  ): Promise<RelationEvaluationOutcome> {
    const { records, permissions, baselineContext, now, ids } = input;

    // ── Gate 1 short-circuit ────────────────────────────────────────────
    // Checked before generation: if analysis is forbidden, we must not ask the
    // model to analyze in order to find out (§8 Gate 1, §26, INV-17).
    const permission = gateUsagePermission(permissions);
    if (!permission.passed) {
      return {
        admitted: [],
        rejected: [],
        unscored: [],
        noSufficientRelation: true,
        evaluatedAt: now,
      };
    }

    // ── Stage 1: Candidate Generation (open, §34) ───────────────────────
    const generated = await this.judgment.generateCandidates({
      records: records.map(toRecordView),
    });

    const admitted: StoredRelationClaim[] = [];
    const rejected: RejectedCandidate[] = [];
    const unscored: UnscoredCandidate[] = [];

    for (const candidate of generated.candidates) {
      const scoped = selectRecords(records, candidate.recordRefs);

      // A candidate referencing records we could not resolve is rejected
      // rather than silently narrowed: dropping a ref changes what the claim
      // is about (§42).
      const missing = missingRecordRefs(candidate, scoped);
      if (missing.length > 0) {
        rejected.push({
          candidate,
          failures: [
            {
              gate: 'epistemic_eligibility',
              code: 'unresolved_record_ref',
              detail: `Candidate references records not in scope: ${missing.join(', ')}.`,
            },
          ],
        });
        continue;
      }

      // ── Stage 2: Evidence Admissibility (code-only gates) ─────────────
      // Gates 2 and 5 need no model input, so they run first and keep
      // ineligible or lineage-collapsed candidates away from the model.
      const admissibility = [
        gateEpistemicEligibility(scoped),
        gateLineageIntegrity(scoped),
      ].flatMap((o) => (o.passed ? [] : [o.failure]));

      if (admissibility.length > 0) {
        rejected.push({ candidate, failures: admissibility });
        continue;
      }

      // ── Stage 3: Claim Validation (Gates 3, 4, 6) ─────────────────────
      const views = scoped.map(toRecordView);

      const [comparability, ceiling] = await Promise.all([
        this.judgment.judgeComparability({
          records: views,
          comparisonAxis: candidate.comparisonAxis,
          relationType: candidate.relationType,
        }),
        this.judgment.judgeAbstractionCeiling({
          relationType: candidate.relationType,
          comparisonAxis: candidate.comparisonAxis,
          evidenceSummary: candidate.evidenceSummary,
        }),
      ]);

      const validation = [
        gateOperationalComparability(comparability),
        gateTemporalLegibility(candidate, scoped),
        gateAbstractionCeiling(ceiling),
      ].flatMap((o) => (o.passed ? [] : [o.failure]));

      if (validation.length > 0) {
        rejected.push({ candidate, failures: validation });
        continue;
      }

      // ── Stage 4: Evidence Scoring ─────────────────────────────────────
      // Reached only after all six gates pass, satisfying §8's ordering and
      // §10.3's precondition on Temporal Adequacy.
      const dimensionResults = await this.judgment.judgeEvidenceDimensions({
        records: views,
        comparisonAxis: candidate.comparisonAxis,
        relationType: candidate.relationType,
        baselineContext,
      });

      const judgments = assembleJudgments(
        dimensionResults.judgments.map((j) =>
          j.status === 'scored'
            ? {
                dimension: j.dimension,
                status: 'scored' as const,
                score: j.score,
                reason: j.reason,
              }
            : {
                dimension: j.dimension,
                status: 'unavailable' as const,
                reason: j.reason,
              },
        ),
        baselineContext,
      );

      const assessment = assessEvidence(judgments);

      if (!assessment.ok) {
        // Passed every gate but is not scorable. Retained explicitly as
        // unscored — never partially scored, never user-edited (arch §11).
        unscored.push({ candidate, cause: assessment.error });
        continue;
      }

      admitted.push(
        buildStoredClaim({
          id: relationClaimId(ids.nextRelationClaimId()),
          candidate,
          assessment: assessment.value,
          createdAt: now,
        }),
      );
    }

    return {
      admitted,
      rejected,
      unscored,
      // §7.2 — an outcome of this evaluation, not a stored relation type and
      // not proof that no future relation will exist.
      noSufficientRelation: admitted.length === 0,
      evaluatedAt: now,
    };
  }
}

/**
 * Stage 5 — State Transition (§16).
 *
 * A newly admitted claim starts at the neutral target-scoped state: the user
 * has taken no position, the claim is active, and it is not archived. Returned
 * as data for the application layer to persist, so this module performs no I/O.
 *
 * Note what is NOT set here: no presentation LEVEL and no attention priority.
 * §17/§18 compute those separately, and INV-09 forbids deriving attention from
 * evidence strength.
 */
export const initialStateForClaim = (
  claim: StoredRelationClaim,
): {
  readonly targetType: 'relation_claim';
  readonly targetRef: string;
  readonly userPosition: 'none';
  readonly workflowState: 'active';
  readonly presentationState: 'active';
} => ({
  targetType: 'relation_claim',
  targetRef: claim.id,
  userPosition: 'none',
  workflowState: 'active',
  presentationState: 'active',
});
