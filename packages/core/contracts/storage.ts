/**
 * Storage seam owned by Core. SQLite, Prisma, browser, and memory adapters
 * implement these ports outside this package.
 */
import type {
  DirectiveRepository,
  DiscoveryRepository,
  FocusContextRepository,
  HypothesisRepository,
  IngestionCommitRepository,
  LineageRepository,
  RecordEpistemicRoleRepository,
  RecordRepository,
  ReflectionEpisodeRepository,
  ReflectionPreferenceRepository,
  RelationClaimRepository,
  StateAssignmentRepository,
  UserReflectionRecordRepository,
} from '../domain/ports/repositories';

export type {
  DirectiveRepository,
  DiscoveryRepository,
  FocusContextRepository,
  HypothesisRepository,
  IngestionCommitRepository,
  LineageRepository,
  RecordEpistemicRoleRepository,
  RecordRepository,
  ReflectionEpisodeRepository,
  ReflectionPreferenceRepository,
  RelationClaimRepository,
  StateAssignmentRepository,
  UserReflectionRecordRepository,
} from '../domain/ports/repositories';

/**
 * One complete storage adapter as seen by a Core composition root.
 *
 * Application modules continue to request only the narrow ports they use. The
 * aggregate exists so an app can replace a whole storage implementation
 * without knowing adapter internals.
 */
export interface CoreStoragePorts {
  readonly records: RecordRepository;
  readonly roles: RecordEpistemicRoleRepository;
  readonly lineage: LineageRepository;
  readonly directives: DirectiveRepository;
  readonly ingestion: IngestionCommitRepository;
  readonly stateAssignments: StateAssignmentRepository;
  readonly discoveries: DiscoveryRepository;
  readonly relationClaims: RelationClaimRepository;
  readonly hypotheses: HypothesisRepository;
  readonly focusContexts: FocusContextRepository;
  readonly reflectionPreferences: ReflectionPreferenceRepository;
  readonly reflectionEpisodes: ReflectionEpisodeRepository;
  readonly userReflectionRecords: UserReflectionRecordRepository;
}
