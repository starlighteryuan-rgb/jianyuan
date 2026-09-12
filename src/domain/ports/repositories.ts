/**
 * Repository ports — Phase 1 skeleton only.
 *
 * These interfaces belong to the DOMAIN side of the boundary. They must not
 * import Prisma, Next.js, or any I/O library; adapters live outside the domain
 * and depend inward (docs/architecture.md §1, §5).
 *
 * Scope discipline: Phase 1 declares persistence shapes for Foundation
 * entities only. There is deliberately NO port here for candidate generation,
 * hypothesis admission, attention scoring, reflection workflow, or external
 * reference retrieval — all of those are later phases.
 */

import type { PersonalRecord } from '../record/record';
import type { RecordEpistemicRoleAssignment } from '../record/epistemic-role';
import type { LineageEdge } from '../lineage/lineage-edge';
import type { Directive } from '../directive/directive';
import type { StateAssignment } from '../state/state-assignment';
import type { Discovery } from '../discovery/discovery';
import type { ReflectionEpisode } from '../reflection/reflection-episode';
import type { UserReflectionRecord } from '../reflection/user-reflection-record';
import type { StoredRelationClaim } from '../relation/relation-claim';
import type { EvidenceSupportLevel } from '../relation/evidence-dimensions';
import type { StoredHypothesis } from '../hypothesis/hypothesis';
import type { CurrentFocusContext } from '../discovery/focus-context';
import type { ReflectionPreference } from '../reflection/reflection-preference';
import type { IngestionPlan } from '../ingestion/ingest-record';
import type {
  DirectiveId,
  DiscoveryId,
  EvidenceUnitId,
  FocusContextId,
  HypothesisId,
  RecordId,
  RelationClaimId,
  SourceFingerprint,
  StateAssignmentId,
} from '../shared/ids';
import type { EpistemicRole, StateTargetType } from '../shared/enums';

export interface RecordRepository {
  findById(id: RecordId): Promise<PersonalRecord | null>;

  /** Ingestion dedup lookup. Same raw source -> same Record. */
  findBySourceFingerprint(
    fingerprint: SourceFingerprint,
  ): Promise<PersonalRecord | null>;

  /**
   * All Records sharing one Evidence Unit. The basis of no-double-counting
   * checks in later phases (ENGINEERING_CONTRACT §6.1, INV-03, INV-16).
   */
  findByEvidenceUnit(
    unitId: EvidenceUnitId,
  ): Promise<readonly PersonalRecord[]>;

  /**
   * Distinct Evidence Unit count across the given Records. Returns unit count,
   * never record count — the distinction Independent Support depends on
   * (ENGINEERING_CONTRACT §10.2).
   */
  countDistinctEvidenceUnits(ids: readonly RecordId[]): Promise<number>;

  /**
   * Most recently stored Records, newest first, capped at `limit`.
   *
   * A read-side capability with no epistemic content: it selects and orders, and
   * decides nothing. Added because the Awareness Stream had no way to enumerate
   * records at all — every other method here answers a question you can only ask
   * once you already hold an id.
   *
   * ORDERED BY `createdAt`, DELIBERATELY. That is the platform's own clock — when
   * the row was written — and is the one ordering that never asserts anything
   * about the user's world. `time` must NOT be used here: it is a `TimeAssertion`
   * whose semantic varies per record (§5), so sorting by it would silently
   * compare an `event_time` against a `capture_time` and invent a chronology the
   * contract refuses to assert (INV-07, INV-08).
   *
   * Recency is not importance. This orders arrival only; Attention Priority is
   * computed on read by the domain and is never persisted or implied here
   * (§17, INV-09).
   */
  listRecent(limit: number): Promise<readonly PersonalRecord[]>;

  /**
   * Persist a Record.
   *
   * `options.evidenceUnitReason` carries the audit trail for the case where an
   * explicit determination minted a NEW Evidence Unit for a derived record.
   * ENGINEERING_CONTRACT §42 requires such a decision to be inspectable, and
   * docs/architecture.md §13 leaves the criteria deferred — so when the
   * judgment is made, the stated reason must be stored alongside it rather
   * than discarded. Optional because the common cases (a root source, or a
   * derived record that inherits) have no such determination to record.
   */
  save(
    record: PersonalRecord,
    options?: { readonly evidenceUnitReason?: string },
  ): Promise<void>;
}

/**
 * Atomic persistence seam for one complete Ingestion plan.
 *
 * The planner owns epistemic decisions; this port owns only all-or-nothing
 * persistence of the resulting Record, Roles, and optional Lineage.
 */
export interface IngestionCommitRepository {
  commit(plan: IngestionPlan): Promise<void>;
}

export interface RecordEpistemicRoleRepository {
  listRoles(recordId: RecordId): Promise<readonly EpistemicRole[]>;

  /**
   * Attaching a role must never alter the Record's Evidence Unit (INV-16).
   * Implementations write only to the role table.
   */
  addRole(assignment: RecordEpistemicRoleAssignment): Promise<void>;
}

export interface LineageRepository {
  directParents(childId: RecordId): Promise<readonly LineageEdge[]>;
  save(edge: LineageEdge): Promise<void>;
}

export interface DirectiveRepository {
  findById(id: DirectiveId): Promise<Directive | null>;
  listActive(): Promise<readonly Directive[]>;
  save(directive: Directive): Promise<void>;
  revoke(id: DirectiveId, at: Date): Promise<void>;
}

export interface StateAssignmentRepository {
  /**
   * Target-scoped lookup. `StateTargetType` admits only relation_claim,
   * hypothesis, and discovery, so an attempt to hold state against a
   * ReflectionEpisode fails to typecheck (docs/architecture.md §4, Patch B).
   */
  findByTarget(
    targetType: StateTargetType,
    targetRef: string,
  ): Promise<StateAssignment | null>;

  save(assignment: StateAssignment): Promise<void>;
  findById(id: StateAssignmentId): Promise<StateAssignment | null>;
}

export interface DiscoveryRepository {
  findById(id: DiscoveryId): Promise<Discovery | null>;

  /**
   * Resolve by stable key so recomputation binds to the SAME persisted
   * identity rather than minting a new row (Patch 6).
   */
  findByStableKey(stableKey: string): Promise<Discovery | null>;

  /**
   * Idempotent upsert on `stableKey`. Returns the stable identity; it never
   * returns or accepts an attention score, because attention is computed on
   * read and never persisted (Patch 6, INV-09).
   */
  ensure(discovery: Discovery): Promise<Discovery>;
}

export interface RelationClaimRepository {
  findById(id: RelationClaimId): Promise<StoredRelationClaim | null>;

  /** Claims referencing a given Record. */
  findByRecordRef(recordId: RecordId): Promise<readonly StoredRelationClaim[]>;

  /**
   * Claims at a given Evidence Support level.
   *
   * A claim whose assessment is absent has a null `supportLevel` and is
   * therefore returned by no level query — an unscored claim must never be
   * mistaken for a weakly supported one (docs/architecture.md §11 Patch 9).
   */
  listBySupportLevel(
    level: EvidenceSupportLevel,
  ): Promise<readonly StoredRelationClaim[]>;

  /**
   * ALL claims, newest first, capped at `limit`.
   *
   * Exists because `listBySupportLevel` cannot answer "what is there?". Per its
   * own contract above, a claim with a null `supportLevel` is returned by no
   * level query, so a union across every level silently DROPS every unscored
   * claim — and docs/architecture.md §11 Patch 9 requires an unscored claim be
   * presented as explicitly unscored rather than hidden or read as weak. Any
   * read path that must show everything has to come through here.
   *
   * ORDERED BY `createdAt`, never by support level: §36 and INV-09 forbid
   * evidence support ordering or filtering what the user sees.
   */
  listAll(limit: number): Promise<readonly StoredRelationClaim[]>;

  save(claim: StoredRelationClaim): Promise<void>;
}

export interface HypothesisRepository {
  findById(id: HypothesisId): Promise<StoredHypothesis | null>;

  /** Hypotheses anchored to a given claim or pattern. */
  findByAnchorRef(anchorRef: string): Promise<readonly StoredHypothesis[]>;

  /**
   * All hypotheses, oldest first.
   *
   * Deliberately unordered by any notion of strength: §13 forbids a Hypothesis
   * carrying a probability, so there is nothing to rank by. Competing
   * explanations are peers.
   */
  listAll(): Promise<readonly StoredHypothesis[]>;

  save(hypothesis: StoredHypothesis): Promise<void>;
}

export interface ReflectionPreferenceRepository {
  /**
   * The current preference, or null if the user has set none.
   *
   * Null means "unset", NOT "default": the caller applies
   * `defaultPreference()` explicitly, so a stored choice is never confused with
   * an absent one (§33).
   */
  find(): Promise<ReflectionPreference | null>;

  /**
   * Overwrite the preference in place.
   *
   * §33 says preferences may change over time and forbids inferring stable
   * identity from them, so there is deliberately no history: the current value
   * is the whole of it.
   */
  save(preference: ReflectionPreference): Promise<void>;
}

export interface FocusContextRepository {
  findById(id: FocusContextId): Promise<CurrentFocusContext | null>;

  /**
   * Contexts that have not ended and whose stated duration (if any) has not
   * elapsed, newest first.
   *
   * Note this does NOT filter by elastic fading: a faded context is still
   * active as a row, and its reduced relevance is derived on read (§19). Fading
   * is a computed state, never a stored one, so nothing is written at the point
   * a context begins to fade.
   */
  listActive(now: Date): Promise<readonly CurrentFocusContext[]>;

  save(context: CurrentFocusContext): Promise<void>;

  /**
   * End a context without deleting it (§19: removable).
   *
   * §19 is explicit that expiry reduces current relevance and does NOT delete
   * historical records, so this touches the context row only.
   */
  expire(id: FocusContextId, at: Date): Promise<void>;
}

export interface ReflectionEpisodeRepository {
  save(episode: ReflectionEpisode): Promise<void>;
}

export interface UserReflectionRecordRepository {
  save(record: UserReflectionRecord): Promise<void>;

  /** Meaning history for a Record, including superseded entries (INV-12). */
  listByRecord(
    recordId: RecordId,
  ): Promise<readonly UserReflectionRecord[]>;
}
