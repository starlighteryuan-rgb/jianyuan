/**
 * Evidence Unit identity — the load-bearing no-double-counting mechanism.
 *
 * Contract basis:
 *   - ENGINEERING_CONTRACT §4  : one original information source remains ONE
 *                                Evidence Unit, however it is reclassified.
 *   - ENGINEERING_CONTRACT §6.1: same information lineage cannot manufacture
 *                                additional independent evidence.
 *   - INV-03, INV-16
 *   - docs/architecture.md §4 (Patch 2), §6 (Patch 7)
 *
 * Design notes:
 *   - `evidence_unit_id` is FIRST-CLASS and distinct from `source_fingerprint`.
 *     The fingerprint is ingestion dedup. The evidence unit is independence
 *     identity. They are separate branded types so they cannot be swapped.
 *   - Epistemic roles never participate in this computation. Attaching more
 *     roles to one source cannot change its Evidence Unit (INV-16).
 *   - docs/architecture.md §13 leaves the precise criteria for "does a derived
 *     record introduce new independent factual content" UNRESOLVED. This module
 *     therefore FAILS CLOSED: it never invents that judgment. A new Evidence
 *     Unit for a derived record requires an explicit caller-supplied
 *     determination.
 */

import type { EvidenceUnitId } from '../shared/ids';
import type { LineageRelation } from '../shared/enums';
import { type Result, err, ok } from '../shared/result';

/**
 * Lineage relations that INHERIT the parent's Evidence Unit by default.
 *
 * The list carries TWO distinct rationales, and they are worth keeping apart
 * because they answer different questions:
 *
 *   1. THE DERIVATION FAMILY — `derived_from`, `summarizes`, `reformats`.
 *      docs/architecture.md §4 (Patch 2) names exactly these three. They inherit
 *      because the derived record IS the same information as its parent, wearing
 *      different clothes. A summary of an event is not another event (INV-02).
 *
 *   2. THE REFERENCE RELATION — `references`.
 *      Inherits for the opposite-facing reason: not because it restates the
 *      parent, but because a record that merely POINTS AT something is not
 *      thereby a new independent source about the user. §27 requires that when
 *      the user relates an external reference back to themselves, the reference
 *      "still does not become proof about the user", and §38 states external
 *      material "may widen interpretation. It cannot define the user."
 *      Inheriting is precisely the statement "this adds no independent support" —
 *      so the default that satisfies §27 is to inherit, not to refuse.
 *
 * WHY `references` MOVED HERE. It previously failed closed, which looked
 * conservative but was the wrong instrument: refusing to resolve an evidence unit
 * blocks the Record entirely, and with it the user's own meaning
 * (`UserReflectionRecord`, INV-18). That traded away something the contract
 * grants the user in order to withhold something the contract already denies.
 * Inheriting withholds ONLY the evidentiary claim, which is the one thing §27
 * actually forbids, while leaving the user's meaning theirs.
 *
 * Inheriting is also strictly MORE conservative than the alternative it replaces:
 * the previous path admitted such a record only by minting a NEW unit via an
 * explicit determination. Repeated reactions to one article now collapse to one
 * unit instead of accumulating, which is INV-03 working as intended.
 *
 * `responds_to`, `revises`, and `supersedes` deliberately still fail closed —
 * see `resolveEvidenceUnit`.
 */
export const EVIDENCE_INHERITING_RELATIONS: readonly LineageRelation[] = [
  'derived_from',
  'summarizes',
  'reformats',
  'references',
] as const;

export const inheritsEvidenceUnitByDefault = (
  relation: LineageRelation,
): boolean => EVIDENCE_INHERITING_RELATIONS.includes(relation);

/**
 * An explicit, auditable determination that a derived record supplied
 * genuinely new independent factual content.
 *
 * This type exists so the override can never be an implicit boolean flag
 * buried in a call. The criteria themselves remain a deferred open question
 * (docs/architecture.md §13); the caller must state a reason, and that reason
 * is stored for audit.
 */
export interface NewIndependentContentDetermination {
  readonly newIndependentFactualContent: true;
  /** Recorded for auditability. Never parsed to make the decision. */
  readonly reason: string;
  readonly mintedEvidenceUnitId: EvidenceUnitId;
}

export interface EvidenceUnitParentContext {
  readonly parentEvidenceUnitId: EvidenceUnitId;
  readonly relationToParent: LineageRelation;
}

export type EvidenceUnitResolutionInput =
  | {
      /** No parent: a genuinely new, independent source. */
      readonly kind: 'root';
      readonly mintedEvidenceUnitId: EvidenceUnitId;
    }
  | {
      readonly kind: 'derived';
      readonly parent: EvidenceUnitParentContext;
      /** Omit to take the default (inherit). */
      readonly determination?: NewIndependentContentDetermination;
    };

export type EvidenceUnitResolution = {
  readonly evidenceUnitId: EvidenceUnitId;
  readonly inheritedFromParent: boolean;
  /** Present only when an explicit determination minted a new unit. */
  readonly determinationReason?: string;
};

export type EvidenceUnitError = {
  readonly kind: 'independence_determination_required';
  readonly relationToParent: LineageRelation;
  readonly detail: string;
};

/**
 * Resolve the Evidence Unit for a record.
 *
 * - root                          → the minted unit
 * - inheriting relation, no override → parent's unit (the default, §4 Patch 2)
 * - inheriting relation, explicit override → newly minted unit, reason stored
 * - non-inheriting relation, no override → ERROR (fail closed)
 *
 * The last case is deliberate. `responds_to`, `revises`, and `supersedes` cover
 * the situations the contract is most anxious about: replies to AI prompting and
 * meaning revision. docs/architecture.md §6 (Patch 7) states that creating a
 * new Record does NOT by itself grant a new evidence_unit_id or independent
 * support status. Rather than silently pick inherit-or-mint for these, the
 * domain refuses and forces an explicit, auditable decision.
 *
 * Note that failing closed and inheriting reach the same evidentiary OUTCOME —
 * neither yields new independent support. They differ in what else they cost:
 * refusal also blocks the Record. So refusal is reserved for the relations where
 * the contract wants a human decision on the record's very admissibility
 * (`responds_to` — §23/§37 prompt contamination; `revises`/`supersedes` — §25
 * meaning lifecycle), while `references` inherits, because §27 wants the user's
 * meaning kept and only the evidentiary claim withheld.
 */
export const resolveEvidenceUnit = (
  input: EvidenceUnitResolutionInput,
): Result<EvidenceUnitResolution, EvidenceUnitError> => {
  if (input.kind === 'root') {
    return ok({
      evidenceUnitId: input.mintedEvidenceUnitId,
      inheritedFromParent: false,
    });
  }

  const { parent, determination } = input;

  if (determination !== undefined) {
    return ok({
      evidenceUnitId: determination.mintedEvidenceUnitId,
      inheritedFromParent: false,
      determinationReason: determination.reason,
    });
  }

  if (inheritsEvidenceUnitByDefault(parent.relationToParent)) {
    return ok({
      evidenceUnitId: parent.parentEvidenceUnitId,
      inheritedFromParent: true,
    });
  }

  return err({
    kind: 'independence_determination_required',
    relationToParent: parent.relationToParent,
    detail:
      'Evidence independence for this lineage relation is not defaulted. ' +
      'Supply an explicit NewIndependentContentDetermination, or attach the ' +
      'record under an inheriting relation. See docs/architecture.md §6 ' +
      '(Patch 7) and ENGINEERING_CONTRACT §6.1 / INV-03.',
  });
};

/**
 * Count DISTINCT Evidence Units backing a set of records.
 *
 * This is the primitive later phases use for Independent Support scoring
 * (ENGINEERING_CONTRACT §10.2) and Gate 5 (§8). Interaction count, record
 * count, and role count are all irrelevant here — only distinct units count
 * (INV-03, INV-37 / §37 Prompt Contamination).
 */
export const countIndependentEvidenceUnits = (
  units: readonly EvidenceUnitId[],
): number => new Set<string>(units).size;
