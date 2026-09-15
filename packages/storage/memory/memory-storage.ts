import type { CoreStoragePorts } from '../../core/contracts/index';

import { MemoryDirectiveRepository } from './memory-directive-repository';
import { MemoryDiscoveryRepository } from './memory-discovery-repository';
import { MemoryEpistemicRoleRepository } from './memory-epistemic-role-repository';
import { MemoryFocusContextRepository } from './memory-focus-context-repository';
import { MemoryHypothesisRepository } from './memory-hypothesis-repository';
import { MemoryIngestionCommitRepository } from './memory-ingestion-commit-repository';
import { MemoryLineageRepository } from './memory-lineage-repository';
import { MemoryRecordRepository } from './memory-record-repository';
import { MemoryReflectionEpisodeRepository } from './memory-reflection-episode-repository';
import { MemoryReflectionPreferenceRepository } from './memory-reflection-preference-repository';
import { MemoryRelationClaimRepository } from './memory-relation-claim-repository';
import { MemoryStateAssignmentRepository } from './memory-state-assignment-repository';
import { MemoryUserReflectionRecordRepository } from './memory-user-reflection-record-repository';

/** Concrete in-process adapter implementing every Core storage port. */
export class MemoryStorageAdapter implements CoreStoragePorts {
  readonly records = new MemoryRecordRepository();
  readonly roles = new MemoryEpistemicRoleRepository();
  readonly lineage = new MemoryLineageRepository();
  readonly directives = new MemoryDirectiveRepository();
  readonly stateAssignments = new MemoryStateAssignmentRepository();
  readonly discoveries = new MemoryDiscoveryRepository();
  readonly relationClaims = new MemoryRelationClaimRepository();
  readonly hypotheses = new MemoryHypothesisRepository();
  readonly focusContexts = new MemoryFocusContextRepository();
  readonly reflectionPreferences = new MemoryReflectionPreferenceRepository();
  readonly reflectionEpisodes = new MemoryReflectionEpisodeRepository();
  readonly userReflectionRecords = new MemoryUserReflectionRecordRepository();
  readonly ingestion = new MemoryIngestionCommitRepository(
    this.records,
    this.roles,
    this.lineage,
  );

  /** Reset adapter-owned volatile state. No Core rule depends on this helper. */
  clear(): void {
    this.records.clear();
    this.roles.clear();
    this.lineage.clear();
    this.directives.clear();
    this.stateAssignments.clear();
    this.discoveries.clear();
    this.relationClaims.clear();
    this.hypotheses.clear();
    this.focusContexts.clear();
    this.reflectionPreferences.clear();
    this.reflectionEpisodes.clear();
    this.userReflectionRecords.clear();
  }
}

export const createMemoryStorage = (): MemoryStorageAdapter =>
  new MemoryStorageAdapter();
