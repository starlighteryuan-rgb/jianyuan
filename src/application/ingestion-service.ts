/**
 * Ingestion orchestration.
 *
 * The application layer is the only place where I/O and pure decision-making
 * meet. It performs lookups, hands the results to the PURE planner
 * (src/domain/ingestion/ingest-record.ts), then executes whatever plan comes
 * back. It contains no epistemic rules of its own — every refusal originates in
 * the domain.
 *
 * Ordering matters here and is deliberate:
 *
 *   1. Compute the fingerprint (identifies the SOURCE).
 *   2. Dedup lookup by fingerprint.
 *   3. Resolve directives for the subject (Gate 1, §26) — computed on read so a
 *      revoked directive stops applying immediately.
 *   4. Plan (pure).
 *   5. Execute: Record first, then roles, then lineage.
 *
 * Roles are written AFTER the Record so a role row can never reference a
 * Record that does not exist. Nothing here re-derives identity: the plan
 * already decided it.
 */

import {
  type CaptureInput,
  type DerivationContext,
  type IngestionPlan,
  type IngestionRefusal,
  planIngestion,
} from '../domain/ingestion/ingest-record';
import {
  computeSourceFingerprint,
  type HashFn,
} from '../domain/ingestion/source-fingerprint';
import {
  type DirectiveSubject,
  type EffectivePermissions,
  resolveEffectivePermissions,
} from '../domain/directive/directive-resolution';
import type {
  DirectiveRepository,
  LineageRepository,
  RecordEpistemicRoleRepository,
  RecordRepository,
} from '../domain/ports/repositories';
import type { EpistemicRole, LineageRelation } from '../domain/shared/enums';
import type { NewIndependentContentDetermination } from '../domain/record/evidence-unit';
import type { RecordId } from '../domain/shared/ids';
import type { TimeAssertion } from '../domain/shared/time-semantics';
import type { ProvenanceActor, ProvenanceOrigin } from '../domain/shared/enums';
import { type Result, err, ok } from '../domain/shared/result';

/** Injected id minting, so ingestion stays deterministic under test. */
export interface IdGenerator {
  nextRecordId(): string;
  nextEvidenceUnitId(): string;
  nextLineageEdgeId(): string;
}

/**
 * Caller-facing derivation request.
 *
 * Note it carries only the PARENT RECORD ID — not the parent's Evidence Unit.
 * The service looks that up, so a caller cannot pass a mismatched
 * record/evidence-unit pair and thereby smuggle in a wrong independence
 * decision.
 */
export interface DerivationRequest {
  readonly parentRecordId: RecordId;
  readonly relationToParent: LineageRelation;
  readonly determination?: NewIndependentContentDetermination;
}

export interface CaptureRequest {
  readonly origin: ProvenanceOrigin;
  readonly actor: ProvenanceActor;
  readonly sourceRef: string;
  readonly verbatim: string | null;
  readonly language: string | null;
  readonly time: TimeAssertion;
  readonly epistemicRoles: readonly EpistemicRole[];
  readonly capturedAt: Date;
  readonly derivation: DerivationRequest | null;
  /** Attributes directive scopes are matched against (never inferred). */
  readonly subject: Omit<DirectiveSubject, 'createdAt'>;
}

export type IngestionOutcome = {
  readonly recordId: RecordId;
  readonly deduplicated: boolean;
  readonly rolesAdded: readonly EpistemicRole[];
  readonly permissions: EffectivePermissions;
};

export type IngestionError =
  | IngestionRefusal
  | { readonly kind: 'parent_record_not_found'; readonly parentRecordId: RecordId };

export interface IngestionDeps {
  readonly records: RecordRepository;
  readonly roles: RecordEpistemicRoleRepository;
  readonly lineage: LineageRepository;
  readonly directives: DirectiveRepository;
  readonly hash: HashFn;
  readonly ids: IdGenerator;
}

export class IngestionService {
  constructor(private readonly deps: IngestionDeps) {}

  async ingest(
    request: CaptureRequest,
  ): Promise<Result<IngestionOutcome, IngestionError>> {
    const { records, roles, lineage, directives, hash, ids } = this.deps;

    // ── Resolve the parent, when this capture derives from one ─────────────
    let derivedFrom: DerivationContext | null = null;

    if (request.derivation !== null) {
      const parent = await records.findById(request.derivation.parentRecordId);

      if (parent === null) {
        return err({
          kind: 'parent_record_not_found',
          parentRecordId: request.derivation.parentRecordId,
        });
      }

      derivedFrom = {
        parentRecordId: parent.id,
        // Taken from the stored parent, never from caller input.
        parentEvidenceUnitId: parent.evidenceUnitId,
        relationToParent: request.derivation.relationToParent,
        ...(request.derivation.determination
          ? { determination: request.derivation.determination }
          : {}),
      };
    }

    const capture: CaptureInput = {
      origin: request.origin,
      actor: request.actor,
      sourceRef: request.sourceRef,
      verbatim: request.verbatim,
      language: request.language,
      time: request.time,
      epistemicRoles: request.epistemicRoles,
      capturedAt: request.capturedAt,
      derivedFrom,
    };

    // ── Identify the source, then look for an existing Record ──────────────
    const fingerprint = computeSourceFingerprint(
      {
        origin: capture.origin,
        actor: capture.actor,
        sourceRef: capture.sourceRef,
        verbatim: capture.verbatim,
        time: capture.time,
      },
      hash,
    );

    const existing = await records.findBySourceFingerprint(fingerprint);
    const existingRoles =
      existing === null ? [] : await roles.listRoles(existing.id);

    // ── Directives, resolved on read (§26 revocability) ────────────────────
    const activeDirectives = await directives.listActive();
    const permissions = resolveEffectivePermissions(activeDirectives, {
      ...request.subject,
      createdAt: request.capturedAt,
    });

    // ── Pure decision ─────────────────────────────────────────────────────
    const planned = planIngestion({
      capture,
      fingerprint,
      existing,
      existingRoles,
      permissions,
      ids: {
        recordId: ids.nextRecordId(),
        evidenceUnitId: ids.nextEvidenceUnitId(),
        lineageEdgeId: ids.nextLineageEdgeId(),
      },
    });

    if (!planned.ok) return err(planned.error);

    return ok(await this.execute(planned.value, permissions));
  }

  private async execute(
    plan: IngestionPlan,
    permissions: EffectivePermissions,
  ): Promise<IngestionOutcome> {
    const { records, roles, lineage } = this.deps;

    if (plan.kind === 'deduplicated') {
      // Reclassification only. The Record — and therefore its Evidence Unit —
      // is left exactly as it was (INV-16).
      for (const role of plan.rolesToAdd) {
        await roles.addRole({ recordId: plan.recordId, role });
      }

      return {
        recordId: plan.recordId,
        deduplicated: true,
        rolesAdded: plan.rolesToAdd,
        permissions,
      };
    }

    // Pass the determination reason through when one exists, so a minted
    // Evidence Unit stays auditable (§42, arch §13).
    await records.save(
      plan.record,
      plan.evidenceUnitDeterminationReason === null
        ? {}
        : { evidenceUnitReason: plan.evidenceUnitDeterminationReason },
    );

    for (const role of plan.rolesToAdd) {
      await roles.addRole({ recordId: plan.record.id, role });
    }

    if (plan.lineageEdge !== null) {
      await lineage.save({
        ...plan.lineageEdge,
        createdAt: plan.record.createdAt,
      });
    }

    return {
      recordId: plan.record.id,
      deduplicated: false,
      rolesAdded: plan.rolesToAdd,
      permissions,
    };
  }
}
