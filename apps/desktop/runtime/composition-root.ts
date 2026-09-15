import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  DirectiveService,
  DiscoveryService,
  HypothesisEngine,
  HypothesisService,
  IngestionService,
  RecordQueryService,
  ReflectionFlowService,
  ReflectionService,
  RelationEngine,
  RelationService,
  resolveEffectivePermissions,
  type CoreStoragePorts,
} from '../../../packages/core/index';
import { createSqliteStorage } from '../../../packages/storage/sqlite/index';
import { DesktopAIService } from './desktop-ai-service';

export interface DesktopCompositionOptions {
  readonly appDataDir: string;
  readonly apiKey?: string;
  readonly fetcher?: typeof fetch;
}

const ids = {
  nextRecordId: () => `rec_${randomUUID()}`,
  nextEvidenceUnitId: () => `eu_${randomUUID()}`,
  nextLineageEdgeId: () => `edge_${randomUUID()}`,
  nextDirectiveId: () => `dir_${randomUUID()}`,
  nextRelationClaimId: () => `rc_${randomUUID()}`,
  nextHypothesisId: () => `hyp_${randomUUID()}`,
  nextDiscoveryId: () => `disc_${randomUUID()}`,
  nextStateAssignmentId: () => `state_${randomUUID()}`,
  nextReflectionEpisodeId: () => `ep_${randomUUID()}`,
  nextUserReflectionRecordId: () => `urr_${randomUUID()}`,
};

export const createDesktopComposition = (options: DesktopCompositionOptions) => {
  mkdirSync(options.appDataDir, { recursive: true });
  const databasePath = join(options.appDataDir, 'jianyuan.sqlite');
  const storage = createSqliteStorage(databasePath);
  const ai = new DesktopAIService(
    join(options.appDataDir, 'ai-provider.json'),
    options.apiKey ?? '',
    options.fetcher,
  );
  const ingestion = new IngestionService({
    records: storage.records,
    roles: storage.roles,
    lineage: storage.lineage,
    directives: storage.directives,
    commit: storage.ingestion,
    hash: (value) => createHash('sha256').update(value, 'utf8').digest('hex'),
    ids,
  });
  const records = new RecordQueryService({
    records: storage.records,
    reflectionRecords: storage.userReflectionRecords,
  });
  const directives = new DirectiveService({ directives: storage.directives, ids });
  const relations = new RelationService({
    engine: new RelationEngine(ai),
    records: storage.records,
    claims: storage.relationClaims,
    states: storage.stateAssignments,
    directives: storage.directives,
    ids,
  });
  const hypotheses = new HypothesisService({
    engine: new HypothesisEngine(ai),
    claims: storage.relationClaims,
    records: storage.records,
    hypotheses: storage.hypotheses,
    states: storage.stateAssignments,
    ids,
  });
  const discovery = new DiscoveryService({
    discoveries: storage.discoveries,
    focusContexts: storage.focusContexts,
    states: storage.stateAssignments,
    directives: storage.directives,
    records: storage.records,
    claims: storage.relationClaims,
    hypotheses: storage.hypotheses,
    ids,
  });
  const reflection = new ReflectionService({
    episodes: storage.reflectionEpisodes,
    reflectionRecords: storage.userReflectionRecords,
    preferences: storage.reflectionPreferences,
    states: storage.stateAssignments,
    ingestion,
    ids,
  });
  const reflectionFlow = new ReflectionFlowService({
    claims: storage.relationClaims,
    hypotheses: storage.hypotheses,
    reflection,
    episodes: storage.reflectionEpisodes,
    reflectionRecords: storage.userReflectionRecords,
    states: storage.stateAssignments,
    records,
  });

  return {
    storage,
    ai,
    ingestion,
    records,
    directives,
    relations,
    hypotheses,
    discovery,
    reflection,
    reflectionFlow,
  };
};

export type DesktopComposition = ReturnType<typeof createDesktopComposition>;
export type DesktopStorage = CoreStoragePorts;

export const analysisPermissionFor = async (
  composition: DesktopComposition,
  input: {
    readonly source: string | null;
    readonly relationAxes: readonly string[];
    readonly userSelectedRefs: readonly string[];
    readonly createdAt: Date;
  },
) =>
  resolveEffectivePermissions(await composition.directives.listActive(), {
    topicTags: [],
    ...input,
  });
