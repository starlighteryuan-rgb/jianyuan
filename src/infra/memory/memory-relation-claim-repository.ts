import type { RelationClaimRepository } from '../../domain/ports/repositories';
import type { StoredRelationClaim } from '../../domain/relation/relation-claim';
import type { EvidenceSupportLevel } from '../../domain/relation/evidence-dimensions';
import type { RecordId, RelationClaimId } from '../../domain/shared/ids';

export class MemoryRelationClaimRepository implements RelationClaimRepository {
  private readonly claims = new Map<RelationClaimId, StoredRelationClaim>();

  async findById(id: RelationClaimId): Promise<StoredRelationClaim | null> {
    return this.claims.get(id) ?? null;
  }

  async findByRecordRef(
    recordId: RecordId,
  ): Promise<readonly StoredRelationClaim[]> {
    const matches: StoredRelationClaim[] = [];

    for (const claim of this.claims.values()) {
      if (claim.recordRefs.includes(recordId)) {
        matches.push(claim);
      }
    }

    return matches;
  }

  async listBySupportLevel(
    level: EvidenceSupportLevel,
  ): Promise<readonly StoredRelationClaim[]> {
    const matches: StoredRelationClaim[] = [];

    for (const claim of this.claims.values()) {
      if (claim.supportLevel === level) {
        matches.push(claim);
      }
    }

    return matches;
  }

  async save(claim: StoredRelationClaim): Promise<void> {
    this.claims.set(claim.id, claim);
  }

  clear(): void {
    this.claims.clear();
  }
}
