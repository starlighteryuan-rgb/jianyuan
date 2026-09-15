/**
 * Relation orchestration (ENGINEERING_CONTRACT §7, §8, §9, §16, §26, §42;
 * docs/architecture.md §4 Patch 8, §11 Patch 9).
 *
 * Follows the established split: lookups and execution here, every rule in the
 * pure pipeline (`src/domain/relation/relation-engine.ts`). This layer decides
 * nothing epistemic — it resolves inputs, hands them to the engine, and persists
 * what comes back.
 *
 * Ordering is deliberate:
 *
 *   1. Resolve records by id. A claim may not be evaluated against records that
 *      could not be loaded (§42) — the engine already refuses such candidates,
 *      and this layer reports the unresolved ids rather than narrowing silently.
 *   2. Resolve directives for the subject (Gate 1, §26) — computed on read, so a
 *      revoked directive stops applying immediately.
 *   3. Evaluate (the engine; pure apart from the judgment port).
 *   4. Persist admitted claims, then their initial state.
 *
 * WHAT THIS SERVICE NEVER DOES:
 *
 *   - It never scores. Weighting, summation, and thresholding are the domain's
 *     (§9, §31), and nothing here can reach a dimension score.
 *   - It never writes a support level without the judgments behind it. Patch 8
 *     couples them, and `hasAuditableEvidence` is re-checked before every write
 *     because SQL cannot express "level implies six scored children".
 *   - It never resets a user's state. If a target already carries a
 *     StateAssignment, the existing row stands: §16 binds the user's position,
 *     suspension, and archival to the target, and a recomputation must not
 *     overwrite a decision the user made.
 *   - It never discards a rejection or an unscorable candidate. Both are
 *     returned, because §42 requires the outcome explain itself and Patch 9
 *     forbids an unscored claim being mistaken for a weak one.
 */

import {
  type BaselineContext,
  type RelationEvaluationOutcome,
  RelationEngine,
  initialStateForClaim,
} from '../domain/relation/relation-engine';
import {
  type StoredRelationClaim,
  hasAuditableEvidence,
} from '../domain/relation/relation-claim';
import {
  type DirectiveSubject,
  type EffectivePermissions,
  resolveEffectivePermissions,
} from '../domain/directive/directive-resolution';
import type { PersonalRecord } from '../domain/record/record';
import type {
  DirectiveRepository,
  RecordRepository,
  RelationClaimRepository,
  StateAssignmentRepository,
} from '../domain/ports/repositories';
import { stateAssignmentId, type RecordId } from '../domain/shared/ids';

/**
 * Ids minted while persisting an evaluation.
 *
 * `nextStateAssignmentId` sits here rather than being borrowed from the
 * reflection generator because a claim's initial state is this service's write.
 */
export interface RelationIdGenerator {
  nextRelationClaimId(): string;
  nextStateAssignmentId(): string;
}

export interface RelationDeps {
  readonly engine: RelationEngine;
  readonly records: RecordRepository;
  readonly claims: RelationClaimRepository;
  readonly states: StateAssignmentRepository;
  readonly directives: DirectiveRepository;
  readonly ids: RelationIdGenerator;
}

export interface EvaluateRequest {
  /** Records to consider. Candidate generation is open over these (§34). */
  readonly recordRefs: readonly RecordId[];

  /** Attributes directive scopes are matched against (never inferred, §13). */
  readonly subject: DirectiveSubject;

  /**
   * Baseline context for Specificity (§10.4).
   *
   * Required, and supplied by the CALLER rather than derived here: INV-15
   * forbids inventing a baseline, so there is no default this service could
   * safely pick. The domain additionally clamps the resulting score.
   */
  readonly baselineContext: BaselineContext;

  readonly now: Date;
}

export interface EvaluateResult {
  readonly outcome: RelationEvaluationOutcome;

  /** Claims actually written. Equals `outcome.admitted` unless a write was refused. */
  readonly persisted: readonly StoredRelationClaim[];

  /**
   * Ids in `recordRefs` that no longer resolve to a stored Record.
   *
   * Surfaced rather than ignored: evaluating over a narrowed record set would
   * change what the evaluation was about (§42).
   */
  readonly unresolvedRecordRefs: readonly RecordId[];

  /** The permissions the evaluation actually ran under, for audit (§42). */
  readonly permissions: EffectivePermissions;
}

export class RelationService {
  constructor(private readonly deps: RelationDeps) {}

  /**
   * Evaluate candidate relations over a record set and persist what is admitted.
   *
   * Gate 1 is enforced inside the engine, which short-circuits before asking the
   * model anything: if analysis is forbidden, performing the analysis to discover
   * that would be incoherent (§8 Gate 1, §26, INV-17).
   */
  async evaluate(request: EvaluateRequest): Promise<EvaluateResult> {
    const { records, claims, states, directives, engine, ids } = this.deps;

    // ── Resolve records ────────────────────────────────────────────────────
    const resolved: PersonalRecord[] = [];
    const unresolvedRecordRefs: RecordId[] = [];

    for (const ref of request.recordRefs) {
      const record = await records.findById(ref);
      if (record === null) {
        unresolvedRecordRefs.push(ref);
        continue;
      }
      resolved.push(record);
    }

    // ── Directives, resolved on read (§26 revocability) ────────────────────
    const activeDirectives = await directives.listActive();
    const permissions = resolveEffectivePermissions(
      activeDirectives,
      request.subject,
    );

    // ── Evaluate (all rules live in the engine) ────────────────────────────
    const outcome = await engine.evaluate({
      records: resolved,
      permissions,
      baselineContext: request.baselineContext,
      now: request.now,
      ids: { nextRelationClaimId: () => ids.nextRelationClaimId() },
    });

    // ── Persist ────────────────────────────────────────────────────────────
    const persisted: StoredRelationClaim[] = [];

    for (const claim of outcome.admitted) {
      // Patch 8, last line of defence before a write. A claim presenting a
      // support level without the six scored judgments and their reasons is
      // inadmissible, and the coupling cannot be expressed declaratively in SQL.
      if (!hasAuditableEvidence(claim)) {
        continue;
      }

      await claims.save(claim);
      await this.ensureInitialState(claim);
      persisted.push(claim);
    }

    return { outcome, persisted, unresolvedRecordRefs, permissions };
  }

  /**
   * Write the neutral initial state for a newly admitted claim (§16).
   *
   * Idempotent and non-destructive: if a row already exists for this target it
   * is left exactly as it is. A recomputation must never reset a user's
   * position, suspension, or archival — those are the user's decisions, bound to
   * the target rather than to a transient evaluation (§16, §16.1–16.3).
   */
  private async ensureInitialState(claim: StoredRelationClaim): Promise<void> {
    const initial = initialStateForClaim(claim);

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
      updatedAt: claim.createdAt,
    });
  }
}
