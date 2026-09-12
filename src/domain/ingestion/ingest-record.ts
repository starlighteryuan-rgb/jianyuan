/**
 * Ingestion planning (ENGINEERING_CONTRACT §4, §4.1, §4.2, §5, §6, §8 Gate 1,
 * §26; docs/architecture.md §4 Patch 1/Patch 2, §6 Patch 7).
 *
 * This module is PURE. It performs no I/O: it receives the results of lookups
 * already done by the caller and returns a PLAN describing what should happen.
 * The application layer executes that plan. Keeping the decision pure is what
 * makes each of the following enforceable in a unit test with no database:
 *
 *   - Dedup: the same raw source re-ingested yields the SAME Record, and
 *     therefore mints no additional Evidence Unit (INV-16).
 *   - Reclassification: adding epistemic roles to an already-stored source is
 *     a role-table write ONLY. It never re-mints identity (INV-16).
 *   - Gate 1: `allow_storage` is checked BEFORE a Record is created, and
 *     `allow_analysis` is tracked separately so "只记录，不分析" works (§26,
 *     INV-17).
 *   - Evidence independence: delegated wholesale to `resolveEvidenceUnit`,
 *     which fails closed on relations the contract leaves undecided
 *     (docs/architecture.md §6 Patch 7).
 *   - Time semantics travel unmodified from capture into the Record (§5).
 *   - Raw wording is copied verbatim, never normalized (§4.2).
 */

import {
  type EvidenceUnitError,
  type NewIndependentContentDetermination,
  resolveEvidenceUnit,
} from '../record/evidence-unit';
import { normalizeRoles } from '../record/epistemic-role';
import type { PersonalRecord, RawExpression } from '../record/record';
import type { EffectivePermissions } from '../directive/directive-resolution';
import { permitsStorage } from '../directive/directive-resolution';
import type {
  EpistemicRole,
  LineageRelation,
  ProvenanceActor,
  ProvenanceOrigin,
} from '../shared/enums';
import {
  type EvidenceUnitId,
  type LineageEdgeId,
  type RecordId,
  type SourceFingerprint,
  evidenceUnitId as brandEvidenceUnitId,
  lineageEdgeId as brandLineageEdgeId,
  recordId as brandRecordId,
} from '../shared/ids';
import type { TimeAssertion } from '../shared/time-semantics';
import { type Result, err, ok } from '../shared/result';

/** Lineage context for a capture that derives from an existing Record. */
export interface DerivationContext {
  readonly parentRecordId: RecordId;
  readonly parentEvidenceUnitId: EvidenceUnitId;
  readonly relationToParent: LineageRelation;
  /**
   * Present only when an explicit, audited determination says this derived
   * capture supplies genuinely new independent factual content. Absent means
   * "take the default", which for inheriting relations is to inherit.
   */
  readonly determination?: NewIndependentContentDetermination;
}

export interface CaptureInput {
  readonly origin: ProvenanceOrigin;
  readonly actor: ProvenanceActor;
  readonly sourceRef: string;
  /** User's original wording. Modal markers must already be intact here. */
  readonly verbatim: string | null;
  readonly language: string | null;
  readonly time: TimeAssertion;
  readonly epistemicRoles: readonly EpistemicRole[];
  readonly capturedAt: Date;
  readonly derivedFrom: DerivationContext | null;
}

/** Minted identifiers, injected so planning stays deterministic and pure. */
export interface MintedIds {
  readonly recordId: string;
  readonly evidenceUnitId: string;
  readonly lineageEdgeId: string;
}

export interface LineageEdgePlan {
  readonly id: LineageEdgeId;
  readonly childId: RecordId;
  readonly parentId: RecordId;
  readonly relationToParent: LineageRelation;
}

export type IngestionPlan =
  /**
   * The source is already stored. No Record is created and NO Evidence Unit is
   * minted. Any roles not yet attached are added to the existing Record, which
   * cannot change its Evidence Unit (INV-16).
   */
  | {
      readonly kind: 'deduplicated';
      readonly recordId: RecordId;
      readonly evidenceUnitId: EvidenceUnitId;
      readonly rolesToAdd: readonly EpistemicRole[];
    }
  | {
      readonly kind: 'create';
      readonly record: PersonalRecord;
      readonly rolesToAdd: readonly EpistemicRole[];
      /** Null unless the capture derives from a parent Record. */
      readonly lineageEdge: LineageEdgePlan | null;
      readonly evidenceUnitInherited: boolean;
      /** Set only when an explicit determination minted a new unit. */
      readonly evidenceUnitDeterminationReason: string | null;
    };

export type IngestionRefusal =
  /** Gate 1 / §26: the user forbade storing this. */
  | {
      readonly kind: 'storage_not_permitted';
      readonly appliedDirectiveIds: readonly string[];
    }
  /** Evidence independence is undecidable without an explicit determination. */
  | { readonly kind: 'evidence_unit_unresolved'; readonly cause: EvidenceUnitError };

export interface PlanIngestionArgs {
  readonly capture: CaptureInput;
  readonly fingerprint: SourceFingerprint;
  /**
   * Result of the dedup lookup. Non-null means this exact source is already
   * stored (docs/architecture.md §4: same raw source re-ingested → same Record).
   */
  readonly existing: PersonalRecord | null;
  /** Roles already attached to `existing`; ignored when `existing` is null. */
  readonly existingRoles: readonly EpistemicRole[];
  readonly permissions: EffectivePermissions;
  readonly ids: MintedIds;
}

const buildRawExpression = (capture: CaptureInput): RawExpression | null =>
  capture.verbatim === null
    ? null
    : {
        // Copied through untouched. §4.2 forbids stripping 可能 / 好像 /
        // 我觉得 / 不知道 / 也许, and forbids normalizing "我可能是因为……"
        // into "用户是因为……".
        verbatim: capture.verbatim,
        // 'und' = BCP-47 undetermined, rather than guessing a language.
        language: capture.language ?? 'und',
      };

export const planIngestion = (
  args: PlanIngestionArgs,
): Result<IngestionPlan, IngestionRefusal> => {
  const { capture, fingerprint, existing, existingRoles, permissions, ids } =
    args;

  const requestedRoles = normalizeRoles(capture.epistemicRoles);

  // ── Gate 1 / §26: storage permission precedes ANY write ─────────────────
  // Checked first, before both creation and reclassification, so a forbidden
  // capture leaves no trace at all. Attaching a role to an already-stored
  // Record is still a storage write, so it is gated here too rather than
  // slipping through the dedup path.
  //
  // `allow_analysis` is deliberately NOT consulted: "只记录，不分析" must
  // still store (§26, INV-17).
  if (!permitsStorage(permissions)) {
    return err({
      kind: 'storage_not_permitted',
      appliedDirectiveIds: permissions.appliedDirectiveIds.map(String),
    });
  }

  // ── Already stored: reclassify only, never re-mint identity ──────────────
  if (existing !== null) {
    const rolesToAdd = requestedRoles.filter((r) => !existingRoles.includes(r));

    return ok({
      kind: 'deduplicated',
      recordId: existing.id,
      // Unchanged, by construction. This is the structural half of INV-16.
      evidenceUnitId: existing.evidenceUnitId,
      rolesToAdd,
    });
  }

  // ── Evidence independence ───────────────────────────────────────────────
  const resolution = capture.derivedFrom
    ? resolveEvidenceUnit({
        kind: 'derived',
        parent: {
          parentEvidenceUnitId: capture.derivedFrom.parentEvidenceUnitId,
          relationToParent: capture.derivedFrom.relationToParent,
        },
        ...(capture.derivedFrom.determination
          ? { determination: capture.derivedFrom.determination }
          : {}),
      })
    : resolveEvidenceUnit({
        kind: 'root',
        mintedEvidenceUnitId: brandEvidenceUnitId(ids.evidenceUnitId),
      });

  if (!resolution.ok) {
    // Fails closed. A reply to AI prompting, a reaction to an external
    // reference, or a meaning revision never silently mints evidence
    // (docs/architecture.md §6 Patch 7, INV-03).
    return err({ kind: 'evidence_unit_unresolved', cause: resolution.error });
  }

  const newRecordId = brandRecordId(ids.recordId);

  const record: PersonalRecord = {
    id: newRecordId,
    sourceFingerprint: fingerprint,
    evidenceUnitId: resolution.value.evidenceUnitId,
    epistemicRoles: requestedRoles,
    provenance: {
      origin: capture.origin,
      actor: capture.actor,
      sourceRef: capture.sourceRef,
      capturedAt: capture.capturedAt,
    },
    // Passed through unchanged: no semantic upgrade (§5, INV-07, INV-08).
    time: capture.time,
    rawExpression: buildRawExpression(capture),
    createdAt: capture.capturedAt,
  };

  const lineageEdge: LineageEdgePlan | null = capture.derivedFrom
    ? {
        id: brandLineageEdgeId(ids.lineageEdgeId),
        childId: newRecordId,
        parentId: capture.derivedFrom.parentRecordId,
        relationToParent: capture.derivedFrom.relationToParent,
      }
    : null;

  return ok({
    kind: 'create',
    record,
    rolesToAdd: requestedRoles,
    lineageEdge,
    evidenceUnitInherited: resolution.value.inheritedFromParent,
    evidenceUnitDeterminationReason:
      resolution.value.determinationReason ?? null,
  });
};
