/**
 * Hypothesis Engine (ENGINEERING_CONTRACT §13, §14, §15, §16.2).
 *
 * Pipeline: Generation → Admission Gates → Admit / Reject.
 *
 * Deliberately simpler than the Relation Engine: there is no scoring stage,
 * because a Hypothesis has no evidence score of its own. §9's Evidence Support
 * belongs to the descriptive Relation Claim, and INV-09 keeps it from being read
 * as hypothesis probability. A hypothesis is admitted or it is not.
 *
 * Like the Relation Engine, this depends on a port and on NO repository: it
 * receives resolved claims, records, and states, and returns hypotheses for the
 * application layer to persist. That keeps the whole layer verifiable with a
 * deterministic double and no database.
 */

import {
  type AdmissionFailure,
  type AdmissionInputs,
  runAdmissionGates,
} from './admission-gates';
import {
  type HypothesisCandidate,
  type StoredHypothesis,
  buildStoredHypothesis,
} from './hypothesis';
import type { SemanticJudgmentPort } from '../ports/semantic-judgment';
import type { PersonalRecord } from '../record/record';
import type { StoredRelationClaim } from '../relation/relation-claim';
import type { WorkflowState } from '../shared/enums';
import { hypothesisId } from '../shared/ids';

/**
 * Maximum hypotheses admitted from one evaluation.
 *
 * MVP IMPLEMENTATION RULE (mine, flagged as such — the contract fixes the
 * principle but not the number).
 *
 * §13 states the layer's purpose is to propose 少量 (a small number of)
 * competing explanations. Three matches the "2–3 competing hypotheses" the
 * product may present, and keeps the layer restrained by default.
 *
 * Applied AFTER gating, so the gates decide legality and the cap only limits
 * volume. Excess candidates are reported as capped rather than silently dropped.
 */
export const MAX_ADMITTED_HYPOTHESES = 3;

export interface HypothesisAnchorState {
  readonly targetRef: string;
  readonly workflowState: WorkflowState;
}

export interface HypothesisIdGenerator {
  nextHypothesisId(): string;
}

export interface HypothesisEvaluationInput {
  /** Claims the hypotheses may anchor to. */
  readonly anchorClaims: readonly StoredRelationClaim[];
  /** Records available as directional support (H2). */
  readonly availableRecords: readonly PersonalRecord[];
  /** Workflow state per anchor, for the §16.2 suspension check. */
  readonly anchorStates: readonly HypothesisAnchorState[];
  readonly now: Date;
  readonly ids: HypothesisIdGenerator;
}

export interface RejectedHypothesis {
  readonly candidate: HypothesisCandidate;
  readonly failures: readonly AdmissionFailure[];
}

export interface HypothesisEvaluationOutcome {
  readonly admitted: readonly StoredHypothesis[];
  readonly rejected: readonly RejectedHypothesis[];
  /**
   * Candidates that passed every gate but exceeded MAX_ADMITTED_HYPOTHESES.
   * Surfaced rather than discarded silently, so the cap is auditable (§42).
   */
  readonly capped: readonly HypothesisCandidate[];
  readonly evaluatedAt: Date;
}

const selectRecords = (
  all: readonly PersonalRecord[],
  refs: readonly string[],
): readonly PersonalRecord[] => {
  const wanted = new Set(refs);
  return all.filter((r) => wanted.has(r.id));
};

const selectClaims = (
  all: readonly StoredRelationClaim[],
  refs: readonly string[],
): readonly StoredRelationClaim[] => {
  const wanted = new Set(refs);
  return all.filter((c) => wanted.has(c.id));
};

const selectStates = (
  all: readonly HypothesisAnchorState[],
  refs: readonly string[],
): readonly HypothesisAnchorState[] => {
  const wanted = new Set(refs);
  return all.filter((s) => wanted.has(s.targetRef));
};

export class HypothesisEngine {
  constructor(private readonly judgment: SemanticJudgmentPort) {}

  async evaluate(
    input: HypothesisEvaluationInput,
  ): Promise<HypothesisEvaluationOutcome> {
    const { anchorClaims, availableRecords, anchorStates, now, ids } = input;

    const generated = await this.judgment.generateHypotheses({
      claims: anchorClaims.map((claim) => ({
        claimId: claim.id,
        relationType: claim.relationType,
        axisQuestion: claim.comparisonAxis.question,
        evidenceSummary: claim.evidenceSummary,
        supportLevel: claim.supportLevel,
      })),
    });

    const admitted: StoredHypothesis[] = [];
    const rejected: RejectedHypothesis[] = [];
    const capped: HypothesisCandidate[] = [];

    for (const candidate of generated.candidates) {
      // Scope each gate's inputs to what THIS candidate actually cites, so one
      // candidate cannot borrow another's anchors or support.
      const scopedClaims = selectClaims(anchorClaims, candidate.anchorRefs);
      const scopedRecords = selectRecords(
        availableRecords,
        candidate.supportingRecordRefs,
      );
      const scopedStates = selectStates(anchorStates, candidate.anchorRefs);

      const ceiling = await this.judgment.judgeHypothesisAbstractionCeiling({
        explanation: candidate.explanation,
        mechanism: candidate.explanatoryGain.mechanism,
      });

      const inputs: AdmissionInputs = {
        candidate,
        anchorClaims: scopedClaims,
        supportingRecords: scopedRecords,
        abstractionCeiling: ceiling,
        anchorStates: scopedStates,
      };

      const failures = runAdmissionGates(inputs);

      if (failures.length > 0) {
        rejected.push({ candidate, failures });
        continue;
      }

      // §13 restraint. Note the cap keeps GENERATION ORDER rather than picking
      // the "best" candidates: ranking would require a confidence or
      // probability judgment, and the contract permits neither.
      if (admitted.length >= MAX_ADMITTED_HYPOTHESES) {
        capped.push(candidate);
        continue;
      }

      admitted.push(
        buildStoredHypothesis({
          id: hypothesisId(ids.nextHypothesisId()),
          candidate,
          createdAt: now,
        }),
      );
    }

    return { admitted, rejected, capped, evaluatedAt: now };
  }
}

/**
 * Initial state for an admitted hypothesis (§16).
 *
 * Neutral: the user has taken no position, and the hypothesis is active and
 * unarchived. Returned as data for the application layer to persist.
 *
 * As with a Relation Claim, no presentation level and no attention priority are
 * assigned here (§17, §18, INV-09).
 */
export const initialStateForHypothesis = (
  hypothesis: StoredHypothesis,
): {
  readonly targetType: 'hypothesis';
  readonly targetRef: string;
  readonly userPosition: 'none';
  readonly workflowState: 'active';
  readonly presentationState: 'active';
} => ({
  targetType: 'hypothesis',
  targetRef: hypothesis.id,
  userPosition: 'none',
  workflowState: 'active',
  presentationState: 'active',
});
