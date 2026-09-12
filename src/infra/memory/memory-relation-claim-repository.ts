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

  async listAll(limit: number): Promise<readonly StoredRelationClaim[]> {
    // Returns claims whose `supportLevel` is null too — that is the whole reason
    // this method exists alongside `listBySupportLevel` (arch §11 Patch 9).
    // Ordered by `createdAt`, never by support level (§36, INV-09).
    if (limit <= 0) return [];

    return [...this.claims.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async save(claim: StoredRelationClaim): Promise<void> {
    this.claims.set(claim.id, claim);
  }

  clear(): void {
    this.claims.clear();
  }
}
