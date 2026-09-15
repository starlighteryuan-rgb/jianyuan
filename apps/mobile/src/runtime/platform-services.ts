/**
 * Platform services injected into the Mobile composition root.
 *
 * WHY THIS LAYER EXISTS
 * Core's ingestion seam takes an injected `hash` and an injected `ids`
 * generator, and Mobile has to supply both without importing a platform API
 * into Core-bound code paths that tests also exercise. Two constraints shape
 * the design:
 *
 *   1. `HashFn` in packages/core is SYNCHRONOUS. `expo-crypto` offers only
 *      async digests, so Mobile supplies the pure sync SHA-256 in
 *      src/lib/sha256.ts. Its output is pinned to `node:crypto` by
 *      tests/mobile-codec-parity.test.ts, because a divergent fingerprint would
 *      the same source dedup on one platform and mint a second Record on the
 *      other.
 *
 *   2. `expo-crypto`'s `randomUUID()` needs a native module, so it is not
 *      available under Node. Injecting the generator keeps the composition root
 *      executable in tests with the same ids contract Desktop uses.
 *
 * The id prefixes match apps/desktop/runtime/composition-root.ts exactly. They
 * are cosmetic but keeping them identical means an id in a Mobile database
 * reads the same way it does in a Desktop one.
 */

import type { IdGenerator } from '../../../../packages/core/index';

import { sha256Hex } from '../lib/sha256';

/** Superset of the ingestion id generator, covering every Core service. */
export interface MobileIdGenerator extends IdGenerator {
  nextDirectiveId(): string;
  nextRelationClaimId(): string;
  nextHypothesisId(): string;
  nextDiscoveryId(): string;
  nextStateAssignmentId(): string;
  nextReflectionEpisodeId(): string;
  nextUserReflectionRecordId(): string;
}

export interface MobilePlatformServices {
  /** Sync SHA-256 hex. Must match `node:crypto` output exactly. */
  readonly hash: (canonical: string) => string;
  readonly ids: MobileIdGenerator;
}

/**
 * Build platform services from a UUID source.
 *
 * The UUID function is the only device-specific part, which is why it is the
 * single argument: production passes `expo-crypto`'s `randomUUID`, tests pass
 * any generator. Everything else is pure.
 */
export const createPlatformServices = (
  nextUuid: () => string,
): MobilePlatformServices => ({
  hash: sha256Hex,
  ids: {
    nextRecordId: () => `rec_${nextUuid()}`,
    nextEvidenceUnitId: () => `eu_${nextUuid()}`,
    nextLineageEdgeId: () => `edge_${nextUuid()}`,
    nextDirectiveId: () => `dir_${nextUuid()}`,
    nextRelationClaimId: () => `rc_${nextUuid()}`,
    nextHypothesisId: () => `hyp_${nextUuid()}`,
    nextDiscoveryId: () => `disc_${nextUuid()}`,
    nextStateAssignmentId: () => `state_${nextUuid()}`,
    nextReflectionEpisodeId: () => `ep_${nextUuid()}`,
    nextUserReflectionRecordId: () => `urr_${nextUuid()}`,
  },
});
