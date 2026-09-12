/**
 * Production id generation.
 *
 * One class implementing every `*IdGenerator` port the application layer
 * declares, so the composition root has a single object to pass everywhere
 * rather than five near-identical adapters. Tests keep their own deterministic
 * generators — that is the whole reason these are ports.
 *
 * WHY UUIDv4 AND NOT A SEQUENCE. Ids are minted BEFORE a write and, in the
 * ingestion path, before it is known whether the write will be refused (Gate 1,
 * §26) or deduplicated (INV-16). A database sequence cannot serve that: it would
 * either burn numbers on refused writes or require a round trip to discover an id
 * the domain already needs in hand. `crypto.randomUUID()` is collision-safe
 * without coordination, so minting is free and a discarded id costs nothing.
 *
 * A monotonic sequence would also leak information the contract does not want to
 * assert: consecutive ids imply an ordering, and §5 is emphatic that the only
 * defensible ordering comes from an explicit time semantic. Record ids must not
 * become a shadow timeline.
 *
 * THE PREFIX. Each id carries a short type tag (`rec_`, `eu_`, …). This is for
 * human auditability (§42): a bare UUID in a log or a `targetRef` column tells a
 * reader nothing about what it points at, and `StateAssignment.targetRef` is a
 * plain string shared across three target types.
 *
 * The prefix is decoration for humans and MUST NOT become control flow. Nothing
 * may parse an id to infer its type — that is exactly the `sourceRef`-parsing
 * mistake docs/architecture.md Patch 10 rejected. Type comes from the branded id
 * type and, where persisted, from an explicit `targetType` column.
 */

import { randomUUID } from 'node:crypto';

import type { DiscoveryIdGenerator } from '../../application/discovery-service';
import type { DirectiveIdGenerator } from '../../application/directive-service';
import type { ExternalReferenceIdGenerator } from '../../application/external-reference-service';
import type { HypothesisIdGenerator } from '../../application/hypothesis-service';
import type { IdGenerator } from '../../application/ingestion-service';
import type { ReflectionIdGenerator } from '../../application/reflection-service';
import type { RelationIdGenerator } from '../../application/relation-service';

/**
 * Satisfies every generator port at once.
 *
 * Declaring every generator is deliberate: `implements` makes the compiler check the set
 * stays complete, so adding a method to any port surfaces here as an error rather
 * than at the container's wiring site.
 */
export class CryptoIdGenerator
  implements
    IdGenerator,
    RelationIdGenerator,
    HypothesisIdGenerator,
    DiscoveryIdGenerator,
    DirectiveIdGenerator,
    ReflectionIdGenerator,
    ExternalReferenceIdGenerator
{
  nextRecordId(): string {
    return `rec_${randomUUID()}`;
  }

  nextEvidenceUnitId(): string {
    return `eu_${randomUUID()}`;
  }

  nextLineageEdgeId(): string {
    return `edge_${randomUUID()}`;
  }

  nextRelationClaimId(): string {
    return `rc_${randomUUID()}`;
  }

  nextHypothesisId(): string {
    return `hyp_${randomUUID()}`;
  }

  nextDiscoveryId(): string {
    return `disc_${randomUUID()}`;
  }

  nextDirectiveId(): string {
    return `dir_${randomUUID()}`;
  }

  nextStateAssignmentId(): string {
    return `state_${randomUUID()}`;
  }

  nextReflectionEpisodeId(): string {
    return `ep_${randomUUID()}`;
  }

  nextUserReflectionRecordId(): string {
    return `urr_${randomUUID()}`;
  }
}
