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
import type {
  DirectiveId,
  DiscoveryId,
  EvidenceUnitId,
  RecordId,
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
