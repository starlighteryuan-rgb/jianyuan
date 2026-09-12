/**
 * Hypothesis orchestration (ENGINEERING_CONTRACT §13, §14, §15, §16.2, §42).
 *
 * Follows the established split: lookups and execution here, every rule in the
 * pure pipeline (`src/domain/hypothesis/hypothesis-engine.ts`). This layer
 * decides nothing epistemic.
 *
 * Deliberately simpler than `RelationService` in one specific way: there is no
 * scoring stage and no baseline context, because a Hypothesis has no evidence
 * score of its own. §9's Evidence Support belongs to the descriptive Relation
 * Claim, and INV-09 keeps it from being read as hypothesis probability. A
 * hypothesis is admitted or it is not.
 *
 * Ordering is deliberate:
 *
 *   1. Resolve anchor claims and available records by id.
 *   2. Resolve each anchor's workflow state — required for the §16.2 suspension
 *      check, read at evaluation time so a suspension takes effect immediately.
 *   3. Evaluate (the engine).
 *   4. Persist admitted hypotheses, then their initial state.
 *
 * WHAT THIS SERVICE NEVER DOES:
 *
 *   - It never ranks. §13 forbids a Hypothesis carrying a probability, so
 *     competing explanations are peers and generation order is preserved
 *     (`MAX_ADMITTED_HYPOTHESES` caps volume without picking winners).
 *   - It never writes a hypothesis that has lost its rivals or its falsifiers.
 *     `remainsCompetable` is re-checked before every write: H4 and H5 make
 *     alternatives and both discriminating-evidence directions structural, and
 *     SQL cannot express "these arrays are non-empty together".
 *   - It never resets a user's state, for the same reason as RelationService.
 *   - It never discards a rejection or a capped candidate (§42).
 */

import {
  type HypothesisAnchorState,
  type HypothesisEvaluationOutcome,
  HypothesisEngine,
  initialStateForHypothesis,
} from '../domain/hypothesis/hypothesis-engine';
import {
  type StoredHypothesis,
  remainsCompetable,
} from '../domain/hypothesis/hypothesis';
import type { PersonalRecord } from '../domain/record/record';
import type { StoredRelationClaim } from '../domain/relation/relation-claim';
import type {
  HypothesisRepository,
  RecordRepository,
  RelationClaimRepository,
  StateAssignmentRepository,
} from '../domain/ports/repositories';
import {
  stateAssignmentId,
  type RecordId,
  type RelationClaimId,
} from '../domain/shared/ids';

export interface HypothesisIdGenerator {
  nextHypothesisId(): string;
  nextStateAssignmentId(): string;
}

export interface HypothesisDeps {
  readonly engine: HypothesisEngine;
  readonly claims: RelationClaimRepository;
  readonly records: RecordRepository;
  readonly hypotheses: HypothesisRepository;
  readonly states: StateAssignmentRepository;
  readonly ids: HypothesisIdGenerator;
}

export interface HypothesisEvaluateRequest {
  /**
   * Claims the hypotheses may anchor to (§14 H1).
   *
   * Supplied by the caller rather than discovered here. Which claims are worth
   * explaining is a product decision, and H1's own requirements (a `supported`+
   * claim, or two independent patterns) are re-checked by the admission gates
   * regardless of what the caller passes.
   */
  readonly anchorClaimRefs: readonly RelationClaimId[];

  /** Records available as directional support (§14 H2). */
  readonly supportingRecordRefs: readonly RecordId[];

  readonly now: Date;
}

export interface HypothesisEvaluateResult {
  readonly outcome: HypothesisEvaluationOutcome;

  /** Hypotheses actually written. Equals `outcome.admitted` unless a write was refused. */
  readonly persisted: readonly StoredHypothesis[];

  /** Anchor refs that no longer resolve to a stored claim (§42). */
  readonly unresolvedAnchorRefs: readonly RelationClaimId[];

  /** Record refs that no longer resolve to a stored Record (§42). */
  readonly unresolvedRecordRefs: readonly RecordId[];
}

export class HypothesisService {
  constructor(private readonly deps: HypothesisDeps) {}

  async evaluate(
    request: HypothesisEvaluateRequest,
  ): Promise<HypothesisEvaluateResult> {
    const { engine, claims, records, hypotheses, states, ids } = this.deps;

    // ── Resolve anchor claims ──────────────────────────────────────────────
    const anchorClaims: StoredRelationClaim[] = [];
    const unresolvedAnchorRefs: RelationClaimId[] = [];

    for (const ref of request.anchorClaimRefs) {
      const claim = await claims.findById(ref);
      if (claim === null) {
        unresolvedAnchorRefs.push(ref);
        continue;
      }
      anchorClaims.push(claim);
    }

    // ── Resolve supporting records ─────────────────────────────────────────
    const availableRecords: PersonalRecord[] = [];
    const unresolvedRecordRefs: RecordId[] = [];

    for (const ref of request.supportingRecordRefs) {
      const record = await records.findById(ref);
      if (record === null) {
        unresolvedRecordRefs.push(ref);
        continue;
      }
      availableRecords.push(record);
    }

    // ── Anchor workflow states (§16.2) ─────────────────────────────────────
    // Read now rather than cached, so suspending an anchor takes effect on the
    // next evaluation. A target with no state row is `active` — the neutral
    // initial state, and the absence of a row is not a suspension.
    const anchorStates: HypothesisAnchorState[] = [];

    for (const claim of anchorClaims) {
      const state = await states.findByTarget('relation_claim', claim.id);

      anchorStates.push({
        targetRef: claim.id,
        workflowState: state?.workflowState ?? 'active',
      });
    }

    // ── Evaluate (all rules live in the engine) ────────────────────────────
    const outcome = await engine.evaluate({
      anchorClaims,
      availableRecords,
      anchorStates,
      now: request.now,
      ids: { nextHypothesisId: () => ids.nextHypothesisId() },
    });

    // ── Persist ────────────────────────────────────────────────────────────
    const persisted: StoredHypothesis[] = [];

    for (const hypothesis of outcome.admitted) {
      // H4/H5 last line of defence. A hypothesis that reached this point without
      // rivals, without a falsifier, or without a discriminating prediction is
      // not storable — §13 requires competing explanations stay competable.
      if (!remainsCompetable(hypothesis)) {
        continue;
      }

      await hypotheses.save(hypothesis);
      await this.ensureInitialState(hypothesis);
      persisted.push(hypothesis);
    }

    return {
      outcome,
      persisted,
      unresolvedAnchorRefs,
      unresolvedRecordRefs,
    };
  }

  /**
   * Write the neutral initial state for a newly admitted hypothesis (§16).
   *
   * Idempotent and non-destructive, for the same reason as RelationService: a
   * recomputation must not reset a position, suspension, or archival the user
   * chose.
   */
  private async ensureInitialState(
    hypothesis: StoredHypothesis,
  ): Promise<void> {
    const initial = initialStateForHypothesis(hypothesis);

    const existing = await this.deps.states.findByTarget(
      initial.targetType,
      initial.targetRef,
    );

    if (existing !== null) return;

    await this.deps.states.save({
      id: stateAssignmentId(this.deps.ids.nextStateAssignmentId()),
      targetType: initial.targetType,
      targetRef: initial.targetRef,
      userPosition: initial.userPosition,
      workflowState: initial.workflowState,
      presentationState: initial.presentationState,
      updatedAt: hypothesis.createdAt,
    });
  }
}
