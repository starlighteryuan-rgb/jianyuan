/**
 * Composition root — the ONE place where ports meet adapters.
 *
 * Everything above this file depends on interfaces only: the domain declares
 * repository ports, the application layer consumes them, and neither knows that
 * Prisma or `crypto.randomUUID` exist (docs/architecture.md §1, §5 — adapters
 * depend inward, never the reverse). This module is where that inversion is
 * finally paid for, and it is deliberately the only module allowed to know every
 * concrete implementation at once.
 *
 * Two consequences worth stating, because they are easy to erode later:
 *
 *   1. NOTHING HERE MAKES AN EPISTEMIC DECISION. This file wires objects. It
 *      resolves no directive, mints no evidence unit, scores nothing, and reads
 *      no support level. If a rule ever appears in this file, it is in the wrong
 *      place — the services and the pure domain own every rule.
 *
 *   2. THE JUDGMENT PORT IS INJECTED, NEVER ASSUMED. `SemanticJudgmentPort` is
 *      the single boundary across which model judgment enters the system (§31),
 *      so which implementation is in play must be an explicit, visible choice.
 *      The default is the deterministic double, because a demo that cannot run
 *      offline is not a reliable acceptance test.
 *
 * PRISMA STAYS LAZY. `getPrisma()` throws when `DATABASE_URL` is absent, so it is
 * called only inside `createPrismaServices()` — importing this module must never
 * require a database. That is what lets `createMemoryServices()` run the whole
 * pipeline with no Postgres present.
 */

import type { PrismaClient } from '../../generated/prisma/client';

import { DiscoveryService } from '../application/discovery-service';
import { ExternalReferenceService } from '../application/external-reference-service';
import { HypothesisService } from '../application/hypothesis-service';
import { IngestionService } from '../application/ingestion-service';
import { ReflectionService } from '../application/reflection-service';
import { RelationService } from '../application/relation-service';
import { HypothesisEngine } from '../domain/hypothesis/hypothesis-engine';
import { RelationEngine } from '../domain/relation/relation-engine';
import type { HashFn } from '../domain/ingestion/source-fingerprint';
import type { SemanticJudgmentPort } from '../domain/ports/semantic-judgment';
import type {
  DirectiveRepository,
  DiscoveryRepository,
  FocusContextRepository,
  HypothesisRepository,
  LineageRepository,
  RecordEpistemicRoleRepository,
  RecordRepository,
  ReflectionEpisodeRepository,
  ReflectionPreferenceRepository,
  RelationClaimRepository,
  StateAssignmentRepository,
  UserReflectionRecordRepository,
} from '../domain/ports/repositories';
import { DeterministicSemanticJudgment } from '../infra/fake/deterministic-semantic-judgment';
import { sha256 } from '../infra/hash';
import { CryptoIdGenerator } from '../infra/ids/crypto-id-generator';
import { MemoryDirectiveRepository } from '../infra/memory/memory-directive-repository';
import { MemoryDiscoveryRepository } from '../infra/memory/memory-discovery-repository';
import { MemoryEpistemicRoleRepository } from '../infra/memory/memory-epistemic-role-repository';
import { MemoryFocusContextRepository } from '../infra/memory/memory-focus-context-repository';
import { MemoryHypothesisRepository } from '../infra/memory/memory-hypothesis-repository';
import { MemoryLineageRepository } from '../infra/memory/memory-lineage-repository';
import { MemoryRecordRepository } from '../infra/memory/memory-record-repository';
import { MemoryReflectionEpisodeRepository } from '../infra/memory/memory-reflection-episode-repository';
import { MemoryReflectionPreferenceRepository } from '../infra/memory/memory-reflection-preference-repository';
import { MemoryRelationClaimRepository } from '../infra/memory/memory-relation-claim-repository';
import { MemoryStateAssignmentRepository } from '../infra/memory/memory-state-assignment-repository';
import { MemoryUserReflectionRecordRepository } from '../infra/memory/memory-user-reflection-record-repository';
import { PrismaDirectiveRepository } from '../infra/prisma/prisma-directive-repository';
import { PrismaDiscoveryRepository } from '../infra/prisma/prisma-discovery-repository';
import { PrismaEpistemicRoleRepository } from '../infra/prisma/prisma-epistemic-role-repository';
import { PrismaFocusContextRepository } from '../infra/prisma/prisma-focus-context-repository';
import { PrismaHypothesisRepository } from '../infra/prisma/prisma-hypothesis-repository';
import { PrismaLineageRepository } from '../infra/prisma/prisma-lineage-repository';
import { PrismaRecordRepository } from '../infra/prisma/prisma-record-repository';
import { PrismaReflectionEpisodeRepository } from '../infra/prisma/prisma-reflection-episode-repository';
import { PrismaReflectionPreferenceRepository } from '../infra/prisma/prisma-reflection-preference-repository';
import { PrismaRelationClaimRepository } from '../infra/prisma/prisma-relation-claim-repository';
import { PrismaStateAssignmentRepository } from '../infra/prisma/prisma-state-assignment-repository';
import { PrismaUserReflectionRecordRepository } from '../infra/prisma/prisma-user-reflection-record-repository';
import { getPrisma } from '../lib/prisma';

/* ── The wired bundle ─────────────────────────────────────────────────── */

/**
 * Every repository the application layer can reach.
 *
 * Named separately from `AppServices` so a caller that needs raw repository
 * access — reading a directive list to render Settings, say — does not have to
 * reach through a service that has no business exposing it.
 */
export interface Repositories {
  readonly records: RecordRepository;
  readonly roles: RecordEpistemicRoleRepository;
  readonly lineage: LineageRepository;
  readonly directives: DirectiveRepository;
  readonly states: StateAssignmentRepository;
  readonly discoveries: DiscoveryRepository;
  readonly claims: RelationClaimRepository;
  readonly hypotheses: HypothesisRepository;
  readonly focusContexts: FocusContextRepository;
  readonly episodes: ReflectionEpisodeRepository;
  readonly reflectionRecords: UserReflectionRecordRepository;
  readonly preferences: ReflectionPreferenceRepository;
}

export interface AppServices {
  readonly ingestion: IngestionService;
  readonly relations: RelationService;
  readonly hypotheses: HypothesisService;
  readonly discovery: DiscoveryService;
  readonly reflection: ReflectionService;
  readonly externalReferences: ExternalReferenceService;

  /** Exposed for read paths that legitimately need a repository directly. */
  readonly repositories: Repositories;

  /** Which judgment implementation is in play, for audit and diagnostics (§42). */
  readonly judgment: SemanticJudgmentPort;
}

export interface WiringOptions {
  /**
   * Model judgment source (§31).
   *
   * Defaults to the deterministic double. Phase 8c adds a real LLM adapter
   * behind this same interface; nothing else in the system changes when it does,
   * which is the point of the port.
   */
  readonly judgment?: SemanticJudgmentPort;

  /** Defaults to SHA-256. Injectable so a test can pin the fingerprint. */
  readonly hash?: HashFn;
}

/* ── Wiring ───────────────────────────────────────────────────────────── */

/**
 * Wire services over an arbitrary set of repositories.
 *
 * The single wiring path: both `createPrismaServices` and `createMemoryServices`
 * delegate here, so there is exactly one description of how the graph fits
 * together and a Prisma-backed run cannot be wired differently from an in-memory
 * one.
 */
export const createServices = (
  repositories: Repositories,
  options: WiringOptions = {},
): AppServices => {
  const judgment = options.judgment ?? new DeterministicSemanticJudgment();
  const hash = options.hash ?? sha256;
  const ids = new CryptoIdGenerator();

  const ingestion = new IngestionService({
    records: repositories.records,
    roles: repositories.roles,
    lineage: repositories.lineage,
    directives: repositories.directives,
    hash,
    ids,
  });

  const relations = new RelationService({
    engine: new RelationEngine(judgment),
    records: repositories.records,
    claims: repositories.claims,
    states: repositories.states,
    directives: repositories.directives,
    ids,
  });

  const hypotheses = new HypothesisService({
    engine: new HypothesisEngine(judgment),
    claims: repositories.claims,
    records: repositories.records,
    hypotheses: repositories.hypotheses,
    states: repositories.states,
    ids,
  });

  const discovery = new DiscoveryService({
    discoveries: repositories.discoveries,
    focusContexts: repositories.focusContexts,
    states: repositories.states,
    directives: repositories.directives,
    ids,
  });

  const reflection = new ReflectionService({
    episodes: repositories.episodes,
    reflectionRecords: repositories.reflectionRecords,
    preferences: repositories.preferences,
    states: repositories.states,
    ingestion,
    ids,
  });

  const externalReferences = new ExternalReferenceService({
    ingestion,
    directives: repositories.directives,
    episodes: repositories.episodes,
    reflectionRecords: repositories.reflectionRecords,
    ids,
  });

  return {
    ingestion,
    relations,
    hypotheses,
    discovery,
    reflection,
    externalReferences,
    repositories,
    judgment,
  };
};

/** Prisma-backed repositories over one client. */
export const prismaRepositories = (prisma: PrismaClient): Repositories => ({
  records: new PrismaRecordRepository(prisma),
  roles: new PrismaEpistemicRoleRepository(prisma),
  lineage: new PrismaLineageRepository(prisma),
  directives: new PrismaDirectiveRepository(prisma),
  states: new PrismaStateAssignmentRepository(prisma),
  discoveries: new PrismaDiscoveryRepository(prisma),
  claims: new PrismaRelationClaimRepository(prisma),
  hypotheses: new PrismaHypothesisRepository(prisma),
  focusContexts: new PrismaFocusContextRepository(prisma),
  episodes: new PrismaReflectionEpisodeRepository(prisma),
  reflectionRecords: new PrismaUserReflectionRecordRepository(prisma),
  preferences: new PrismaReflectionPreferenceRepository(prisma),
});

/**
 * Fresh in-memory repositories.
 *
 * Not test-only scaffolding: it is what lets the full pipeline —
 * Record → Relation → Hypothesis → Discovery → Reflection — run end to end with
 * no Postgres and no API key. Each call returns an isolated set.
 */
export const memoryRepositories = (): Repositories => ({
  records: new MemoryRecordRepository(),
  roles: new MemoryEpistemicRoleRepository(),
  lineage: new MemoryLineageRepository(),
  directives: new MemoryDirectiveRepository(),
  states: new MemoryStateAssignmentRepository(),
  discoveries: new MemoryDiscoveryRepository(),
  claims: new MemoryRelationClaimRepository(),
  hypotheses: new MemoryHypothesisRepository(),
  focusContexts: new MemoryFocusContextRepository(),
  episodes: new MemoryReflectionEpisodeRepository(),
  reflectionRecords: new MemoryUserReflectionRecordRepository(),
  preferences: new MemoryReflectionPreferenceRepository(),
});

/**
 * Services over the process-wide Prisma client.
 *
 * Throws when `DATABASE_URL` is absent — deliberately, and only when CALLED
 * rather than when this module is imported.
 */
export const createPrismaServices = (
  options: WiringOptions = {},
): AppServices => createServices(prismaRepositories(getPrisma()), options);

/** Services over fresh in-memory repositories. */
export const createMemoryServices = (
  options: WiringOptions = {},
): AppServices => createServices(memoryRepositories(), options);

/* ── Process-wide instance ────────────────────────────────────────────── */

const globalForServices = globalThis as unknown as {
  services: AppServices | undefined;
};

/**
 * The application's services, built on first use.
 *
 * Cached across dev hot-reloads for the same reason `getPrisma` is: rebuilding
 * would leak connections. The cache holds the SERVICE GRAPH, never any resolved
 * epistemic value — permissions, attention priority, and presentation level are
 * all computed on read, every read (§26, §17, §18, INV-09), so nothing cached
 * here can go stale in a way that matters.
 */
export const getServices = (options: WiringOptions = {}): AppServices => {
  const existing = globalForServices.services;
  if (existing) return existing;

  const services = createPrismaServices(options);

  if (process.env.NODE_ENV !== 'production') {
    globalForServices.services = services;
  }

  return services;
};
