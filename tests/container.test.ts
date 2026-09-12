/**
 * Phase 8a regression tests — composition root and id generation.
 *
 * These exist because `src/server/container.ts` is the one module that knows
 * every concrete adapter at once. A missing constructor argument or a port that
 * grew a method shows up here as a failure rather than at first request in a
 * browser, and the wiring graph is exactly the kind of code that compiles
 * happily while being wrong.
 *
 * WHAT IS AND IS NOT PROVEN HERE:
 *
 *   - Proven: every service constructs, all twelve repositories are present, the
 *     Prisma wiring path assembles, and ids are unique and correctly prefixed.
 *   - NOT proven: that the Prisma adapters talk to Postgres correctly. No
 *     database is reachable in this environment. The Prisma path is exercised
 *     with a client double, which verifies WIRING only.
 */

import { describe, expect, it } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client';

import { DiscoveryService } from '@/application/discovery-service';
import { ExternalReferenceService } from '@/application/external-reference-service';
import { HypothesisService } from '@/application/hypothesis-service';
import { IngestionService } from '@/application/ingestion-service';
import { ReflectionService } from '@/application/reflection-service';
import { RelationService } from '@/application/relation-service';
import type { DiscoveryIdGenerator } from '@/application/discovery-service';
import type { ExternalReferenceIdGenerator } from '@/application/external-reference-service';
import type { HypothesisIdGenerator } from '@/application/hypothesis-service';
import type { IdGenerator } from '@/application/ingestion-service';
import type { ReflectionIdGenerator } from '@/application/reflection-service';
import type { RelationIdGenerator } from '@/application/relation-service';
import { DeterministicSemanticJudgment } from '@/infra/fake/deterministic-semantic-judgment';
import { CryptoIdGenerator } from '@/infra/ids/crypto-id-generator';
import {
  createMemoryServices,
  createServices,
  memoryRepositories,
  prismaRepositories,
  type Repositories,
} from '@/server/container';

/* ── Composition root ─────────────────────────────────────────────────── */

describe('container — constructs the whole service graph', () => {
  it('builds every service over in-memory repositories', () => {
    const services = createMemoryServices();

    // Asserted by CLASS, not merely truthiness: a wiring mistake that swapped
    // two services would still be "defined".
    expect(services.ingestion).toBeInstanceOf(IngestionService);
    expect(services.relations).toBeInstanceOf(RelationService);
    expect(services.hypotheses).toBeInstanceOf(HypothesisService);
    expect(services.discovery).toBeInstanceOf(DiscoveryService);
    expect(services.reflection).toBeInstanceOf(ReflectionService);
    expect(services.externalReferences).toBeInstanceOf(
      ExternalReferenceService,
    );
  });

  it('wires all twelve repositories, none undefined', () => {
    const repositories = memoryRepositories();

    const expected: readonly (keyof Repositories)[] = [
      'records',
      'roles',
      'lineage',
      'directives',
      'states',
      'discoveries',
      'claims',
      'hypotheses',
      'focusContexts',
      'episodes',
      'reflectionRecords',
      'preferences',
    ];

    expect(Object.keys(repositories).sort()).toEqual([...expected].sort());

    for (const key of expected) {
      expect(repositories[key], `repository ${key}`).toBeDefined();
    }
  });

  it('hands the same repository instances to the services it builds', () => {
    // Not cosmetic: if the container built a second set internally, a write
    // through a service would be invisible to a read through `repositories`,
    // and every read path in the UI would silently see stale data.
    const repositories = memoryRepositories();
    const services = createServices(repositories);

    expect(services.repositories).toBe(repositories);
  });

  it('returns isolated repositories on each call', () => {
    // Test isolation depends on this; so does a per-request container.
    const first = memoryRepositories();
    const second = memoryRepositories();

    expect(first.records).not.toBe(second.records);
  });

  it('defaults judgment to the deterministic double, so no API key is needed', () => {
    expect(createMemoryServices().judgment).toBeInstanceOf(
      DeterministicSemanticJudgment,
    );
  });

  it('uses an injected judgment port when one is supplied', () => {
    const judgment = new DeterministicSemanticJudgment({ defaultScore: 3 });
    const services = createMemoryServices({ judgment });

    // Exposed for audit (§42): which judgment source ran must be inspectable.
    expect(services.judgment).toBe(judgment);
  });

  it('assembles the Prisma wiring path (wiring only — no database)', () => {
    // A client double. This proves `prismaRepositories` constructs all twelve
    // adapters and that they satisfy the ports the services demand. It proves
    // NOTHING about SQL correctness.
    const client = {} as PrismaClient;

    const repositories = prismaRepositories(client);
    expect(Object.keys(repositories)).toHaveLength(12);

    const services = createServices(repositories);
    expect(services.ingestion).toBeInstanceOf(IngestionService);
    expect(services.relations).toBeInstanceOf(RelationService);
    expect(services.hypotheses).toBeInstanceOf(HypothesisService);
    expect(services.discovery).toBeInstanceOf(DiscoveryService);
    expect(services.reflection).toBeInstanceOf(ReflectionService);
    expect(services.externalReferences).toBeInstanceOf(
      ExternalReferenceService,
    );
  });

  it('does not require a database merely to import or wire memory services', () => {
    // `getPrisma()` throws without DATABASE_URL. The memory path must never
    // reach it — that is what keeps the pipeline runnable offline.
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      expect(() => createMemoryServices()).not.toThrow();
    } finally {
      if (original !== undefined) process.env.DATABASE_URL = original;
    }
  });
});

/* ── Id generation ────────────────────────────────────────────────────── */

describe('CryptoIdGenerator — uniqueness and port coverage', () => {
  const generator = new CryptoIdGenerator();

  const methods = [
    ['nextRecordId', 'rec_'],
    ['nextEvidenceUnitId', 'eu_'],
    ['nextLineageEdgeId', 'edge_'],
    ['nextRelationClaimId', 'rc_'],
    ['nextHypothesisId', 'hyp_'],
    ['nextDiscoveryId', 'disc_'],
    ['nextStateAssignmentId', 'state_'],
    ['nextReflectionEpisodeId', 'ep_'],
    ['nextUserReflectionRecordId', 'urr_'],
  ] as const;

  it('satisfies every generator port the application layer declares', () => {
    // Compile-time assertions. If any port grows a method, this file stops
    // typechecking — which is the point, since the container passes ONE object
    // everywhere and a gap would otherwise surface at a call site far away.
    const asIngestion: IdGenerator = generator;
    const asRelation: RelationIdGenerator = generator;
    const asHypothesis: HypothesisIdGenerator = generator;
    const asDiscovery: DiscoveryIdGenerator = generator;
    const asReflection: ReflectionIdGenerator = generator;
    const asExternal: ExternalReferenceIdGenerator = generator;

    for (const port of [
      asIngestion,
      asRelation,
      asHypothesis,
      asDiscovery,
      asReflection,
      asExternal,
    ]) {
      expect(port).toBe(generator);
    }
  });

  it.each(methods)('%s mints a prefixed, non-empty id', (method, prefix) => {
    const id = generator[method]();

    expect(id.startsWith(prefix)).toBe(true);
    expect(id.length).toBeGreaterThan(prefix.length);
  });

  it.each(methods)('%s is unique across 1000 calls', (method) => {
    const seen = new Set<string>();

    for (let i = 0; i < 1000; i += 1) {
      seen.add(generator[method]());
    }

    expect(seen.size).toBe(1000);
  });

  it('never collides ACROSS id types', () => {
    // Each kind carries its own prefix, so a record id can never be mistaken for
    // a claim id in a `targetRef` column.
    const all = new Set<string>();
    let minted = 0;

    for (let i = 0; i < 100; i += 1) {
      for (const [method] of methods) {
        all.add(generator[method]());
        minted += 1;
      }
    }

    expect(all.size).toBe(minted);
  });

  it('produces ids that carry no ordering (§5 — no shadow timeline)', () => {
    // Sequential ids would imply a chronology the contract refuses to assert;
    // only an explicit time semantic may order anything. Sorting minted ids must
    // therefore NOT reproduce mint order.
    const minted = Array.from({ length: 50 }, () => generator.nextRecordId());
    const sorted = [...minted].sort();

    expect(sorted).not.toEqual(minted);
  });

  it('is stateless enough that two instances do not collide', () => {
    const other = new CryptoIdGenerator();
    const a = Array.from({ length: 200 }, () => generator.nextRecordId());
    const b = Array.from({ length: 200 }, () => other.nextRecordId());

    expect(new Set([...a, ...b]).size).toBe(400);
  });
});
