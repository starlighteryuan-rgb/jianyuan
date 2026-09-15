/**
 * Mobile composition root.
 *
 * THE RULE THIS FILE ENFORCES
 * No React component constructs a repository, a service, or an adapter. Every
 * dependency is wired once, here, at app startup, and handed down through
 * context. A component that did its own `new IngestionService(...)` would
 * create a second composition with its own injected hash and ids, which is
 * exactly how platform semantics start to differ per screen.
 *
 * THE FOUR LAYERS, KEPT VISIBLY SEPARATE
 *   Core              packages/core — rules. Imported, never modified.
 *   Mobile SQLite     src/storage — ports implemented over expo-sqlite.
 *   Mobile Provider   packages/providers/ai — AI behind the Core contract.
 *   Mobile SecretStore src/runtime/secret-store — credentials, Keychain only.
 *
 * AI BOUNDARY IN M1
 * The Provider is `DisabledAIProvider`. That is a supported product mode, not a
 * gap: saving a Record performs no AI call, so Record persistence works with no
 * key configured and no network. tests/record-does-not-call-ai.test.ts pins the
 * invariant that capture never reaches the provider.
 */

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
} from '../../../../packages/core/index';
import { DisabledAIProvider } from '../../../../packages/providers/ai/index';

import { createPlatformServices, type MobilePlatformServices } from './platform-services';
import type { MobileSecretStore } from './secret-store';
import type { MobileSqliteStorageAdapter } from '../storage/mobile-sqlite-storage';
import type { SqlDriver } from '../storage/sql-driver';

export interface MobileCompositionOptions {
  /** Already-open driver. Production: the app-sandbox expo-sqlite file. */
  readonly driver: SqlDriver;
  /** Already-initialised adapter over that driver. */
  readonly storage: MobileSqliteStorageAdapter;
  readonly platform: MobilePlatformServices;
  readonly secretStore: MobileSecretStore;
}

export interface MobileComposition {
  readonly storage: MobileSqliteStorageAdapter;
  readonly ai: DisabledAIProvider;
  readonly secretStore: MobileSecretStore;
  readonly ingestion: IngestionService;
  readonly records: RecordQueryService;
  readonly directives: DirectiveService;
  readonly relations: RelationService;
  readonly hypotheses: HypothesisService;
  readonly discovery: DiscoveryService;
  readonly reflection: ReflectionService;
  readonly reflectionFlow: ReflectionFlowService;
}

/**
 * Wire the Mobile runtime from already-constructed platform pieces.
 *
 * Pure construction: no I/O, no async, no platform import. Everything
 * device-specific (the driver, the UUID source, the Keychain) is created by the
 * caller and passed in, which is what makes this function runnable under Node
 * with a `node:sqlite` driver and a plain counter for ids.
 */
export const createMobileComposition = (
  options: MobileCompositionOptions,
): MobileComposition => {
  const { storage, platform, secretStore } = options;
  const ports: CoreStoragePorts = storage;
  const ai = new DisabledAIProvider();
  const ids = platform.ids;

  const ingestion = new IngestionService({
    records: ports.records,
    roles: ports.roles,
    lineage: ports.lineage,
    directives: ports.directives,
    commit: ports.ingestion,
    hash: platform.hash,
    ids,
  });

  const records = new RecordQueryService({
    records: ports.records,
    reflectionRecords: ports.userReflectionRecords,
  });

  const directives = new DirectiveService({ directives: ports.directives, ids });

  const relations = new RelationService({
    engine: new RelationEngine(ai),
    records: ports.records,
    claims: ports.relationClaims,
    states: ports.stateAssignments,
    directives: ports.directives,
    ids,
  });

  const hypotheses = new HypothesisService({
    engine: new HypothesisEngine(ai),
    claims: ports.relationClaims,
    records: ports.records,
    hypotheses: ports.hypotheses,
    states: ports.stateAssignments,
    ids,
  });

  const discovery = new DiscoveryService({
    discoveries: ports.discoveries,
    focusContexts: ports.focusContexts,
    states: ports.stateAssignments,
    directives: ports.directives,
    records: ports.records,
    claims: ports.relationClaims,
    hypotheses: ports.hypotheses,
    ids,
  });

  const reflection = new ReflectionService({
    episodes: ports.reflectionEpisodes,
    reflectionRecords: ports.userReflectionRecords,
    preferences: ports.reflectionPreferences,
    states: ports.stateAssignments,
    ingestion,
    ids,
  });

  const reflectionFlow = new ReflectionFlowService({
    claims: ports.relationClaims,
    hypotheses: ports.hypotheses,
    reflection,
    episodes: ports.reflectionEpisodes,
    reflectionRecords: ports.userReflectionRecords,
    states: ports.stateAssignments,
    records,
  });

  return {
    storage,
    ai,
    secretStore,
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

/**
 * Directive permissions resolved on read for a Mobile subject.
 *
 * Mirrors Desktop's `analysisPermissionFor`. A revoked directive stops applying
 * immediately because nothing here caches the resolution.
 */
export const mobileAnalysisPermissionFor = async (
  composition: MobileComposition,
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

export { createPlatformServices, type MobilePlatformServices };
