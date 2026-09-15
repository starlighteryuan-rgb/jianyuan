/**
 * Personal Awareness composition root.
 *
 * Phase 3.5 evolves the Capture spike into one graph for Capture, Record Query,
 * Relation, Discovery, and Reflection. The old export names remain as aliases
 * so existing callers and the explicit legacy fallback keep working.
 */
import { createHash, randomUUID } from 'node:crypto';
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
  type CaptureRequest,
  type CoreStoragePorts,
  type DirectiveIdGenerator,
  type DiscoveryIdGenerator,
  type HashFn,
  type HypothesisServiceIdGenerator,
  type IdGenerator,
  type RecordQueries,
  type ReflectionIdGenerator,
  type RelationIdGenerator,
  type SemanticJudgmentPort,
} from '../../packages/core/index';
import type { AwarenessAIProvider } from '../../packages/providers/ai/index';
import {
  createMemoryStorage,
  type MemoryStorageAdapter,
} from '../../packages/storage/memory/index';
import {
  createSqliteStorage,
  type SqliteStorageAdapter,
} from '../../packages/storage/sqlite/index';
import type { AIProviderRuntime } from './ai-provider-config';
import { getSharedAIProviderRuntime } from './ai-settings-runtime';

export type CaptureCompositionMode = 'sqlite' | 'core-memory' | 'legacy';

export type DirectCaptureRequest = Omit<CaptureRequest, 'derivation'> & {
  readonly derivation: null;
};

export type CaptureIngestionResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly recordId: string;
        readonly deduplicated: boolean;
        readonly rolesAdded: readonly string[];
      };
    }
  | {
      readonly ok: false;
      readonly error: { readonly kind: string };
    };

export interface CaptureIngestionPort {
  ingest(request: DirectCaptureRequest): Promise<CaptureIngestionResult>;
}

/** Backward-compatible Phase 3.3/3.4 interface. */
export interface CaptureComposition {
  readonly mode: CaptureCompositionMode;
  readonly ingestion: CaptureIngestionPort;
  readonly records: RecordQueries;
}

/** The complete application graph exposed to Web Presentation. */
export interface CoreComposition extends CaptureComposition {
  readonly ai: AwarenessAIProvider;
  readonly directives: Pick<DirectiveService, 'listActive' | 'create' | 'revoke'>;
  readonly relations: Pick<RelationService, 'evaluate'>;
  readonly hypotheses: Pick<HypothesisService, 'evaluate'>;
  readonly discovery: Pick<DiscoveryService, 'listStream'>;
  readonly reflection: Pick<ReflectionService, 'preference' | 'updatePreference'>;
  readonly reflectionFlow: Pick<
    ReflectionFlowService,
    'getRelationTarget' | 'respondToRelation'
  >;
}

export interface CoreMemoryCaptureComposition extends CoreComposition {
  readonly mode: 'core-memory';
  readonly storage: MemoryStorageAdapter;
}

export interface CoreSqliteComposition extends CoreComposition {
  readonly mode: 'sqlite';
  readonly storage: SqliteStorageAdapter;
}

export interface CoreIdGenerator
  extends IdGenerator,
    DirectiveIdGenerator,
    RelationIdGenerator,
    HypothesisServiceIdGenerator,
    DiscoveryIdGenerator,
    ReflectionIdGenerator {}

export interface CoreCompositionOptions {
  readonly judgment?: SemanticJudgmentPort;
  readonly aiRuntime?: AIProviderRuntime;
  readonly hash?: HashFn;
  readonly ids?: CoreIdGenerator;
}

/** A complete adapter is required so every module shares one storage graph. */
export type CaptureStoragePorts = CoreStoragePorts;

const adaptIngestion = (
  ingestion: CaptureIngestionPort,
): CaptureIngestionPort => ({
  ingest: (request) => ingestion.ingest(request),
});

const createCryptoIds = (): CoreIdGenerator => ({
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
});

/** Adapt an existing graph to the narrow, backward-compatible Capture seam. */
export const asCaptureComposition = (
  mode: CaptureCompositionMode,
  ingestion: CaptureIngestionPort,
  records: RecordQueries,
): CaptureComposition => ({
  mode,
  ingestion: adaptIngestion(ingestion),
  records,
});

const createCoreCompositionGraph = <TStorage extends CoreStoragePorts>(
  storage: TStorage,
  mode: 'sqlite' | 'core-memory',
  options: CoreCompositionOptions = {},
): CoreComposition & {
  readonly mode: 'sqlite' | 'core-memory';
  readonly storage: TStorage;
} => {
  const ids = options.ids ?? createCryptoIds();
  const aiRuntime = options.aiRuntime ?? getSharedAIProviderRuntime();
  const judgment = options.judgment ?? aiRuntime.judgment;
  const hash =
    options.hash ??
    ((canonical: string) =>
      createHash('sha256').update(canonical, 'utf8').digest('hex'));

  const ingestion = new IngestionService({
    records: storage.records,
    roles: storage.roles,
    lineage: storage.lineage,
    directives: storage.directives,
    commit: storage.ingestion,
    hash,
    ids,
  });
  const records = new RecordQueryService({
    records: storage.records,
    reflectionRecords: storage.userReflectionRecords,
  });
  const directives = new DirectiveService({
    directives: storage.directives,
    ids,
  });
  const relations = new RelationService({
    engine: new RelationEngine(judgment),
    records: storage.records,
    claims: storage.relationClaims,
    states: storage.stateAssignments,
    directives: storage.directives,
    ids,
  });
  const hypotheses = new HypothesisService({
    engine: new HypothesisEngine(judgment),
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
    // Same RecordQueryService the rest of the graph uses, so a reflection's
    // verbatim has exactly one persisted source shared with History.
    records,
  });

  return {
    mode,
    ai: aiRuntime.provider,
    ingestion: adaptIngestion(ingestion),
    records,
    directives,
    relations,
    hypotheses,
    discovery,
    reflection,
    reflectionFlow,
    storage,
  };
};

export const createCoreCaptureComposition = <TStorage extends CoreStoragePorts>(
  storage: TStorage,
  options: CoreCompositionOptions = {},
): CoreComposition & {
  readonly mode: 'core-memory';
  readonly storage: TStorage;
} =>
  createCoreCompositionGraph(
    storage,
    'core-memory',
    options,
  ) as CoreComposition & {
    readonly mode: 'core-memory';
    readonly storage: TStorage;
  };

export const createCoreMemoryCaptureComposition = (
  storage: MemoryStorageAdapter = createMemoryStorage(),
  options: CoreCompositionOptions = {},
): CoreMemoryCaptureComposition =>
  createCoreCaptureComposition(storage, options);

/** Phase 3.5 name; the older factory remains available above. */
export const createCoreMemoryComposition = createCoreMemoryCaptureComposition;

export const defaultSqliteDatabasePath = (): string =>
  process.env.JIANYUAN_SQLITE_PATH ??
  join(process.cwd(), '.jianyuan', 'jianyuan.sqlite');

export const createCoreSqliteComposition = (
  databasePath = defaultSqliteDatabasePath(),
  options: CoreCompositionOptions = {},
): CoreSqliteComposition =>
  createCoreCompositionGraph(
    createSqliteStorage(databasePath),
    'sqlite',
    options,
  ) as CoreSqliteComposition;

export const resolveCaptureCompositionMode = (
  configured =
    process.env.JIANYUAN_STORAGE ?? process.env.JIANYUAN_CAPTURE_COMPOSITION,
): CaptureCompositionMode => {
  if (configured === 'legacy') return 'legacy';
  if (configured === 'memory' || configured === 'core-memory') {
    return 'core-memory';
  }
  return 'sqlite';
};

const globalForCore = globalThis as unknown as {
  jianyuanCoreMemoryComposition: CoreMemoryCaptureComposition | undefined;
  jianyuanCoreSqliteComposition: CoreSqliteComposition | undefined;
};

const getCoreMemoryComposition = (): CoreMemoryCaptureComposition => {
  const existing = globalForCore.jianyuanCoreMemoryComposition;
  if (existing !== undefined) return existing;

  const created = createCoreMemoryComposition();
  globalForCore.jianyuanCoreMemoryComposition = created;
  return created;
};

const getCoreSqliteComposition = (): CoreSqliteComposition => {
  const existing = globalForCore.jianyuanCoreSqliteComposition;
  if (existing !== undefined) return existing;

  const created = createCoreSqliteComposition();
  globalForCore.jianyuanCoreSqliteComposition = created;
  return created;
};

/** Old container stays lazy and isolated behind one fallback adapter. */
const getLegacyComposition = async (): Promise<CoreComposition> => {
  const [{ getServices }, { createLegacyCoreCompositionAdapter }] =
    await Promise.all([
      import('./container'),
      import('./legacy-core-composition-adapter'),
    ]);

  return createLegacyCoreCompositionAdapter(getServices()) as unknown as CoreComposition;
};

/**
 * Select one graph for the whole request. Runtime write failures are never
 * retried against a second adapter because that could duplicate partial writes.
 */
export const getCoreComposition = async (
  mode = resolveCaptureCompositionMode(),
): Promise<CoreComposition> => {
  if (mode === 'legacy') return getLegacyComposition();

  try {
    return mode === 'core-memory'
      ? getCoreMemoryComposition()
      : getCoreSqliteComposition();
  } catch {
    return getLegacyComposition();
  }
};

/** Backward-compatible Phase 3.3/3.4 selector. */
export const getCaptureComposition = getCoreComposition;
