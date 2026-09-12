import type { LineageRepository } from '../../domain/ports/repositories';
import type { LineageEdge } from '../../domain/lineage/lineage-edge';
import type { RecordId, LineageEdgeId } from '../../domain/shared/ids';

export class MemoryLineageRepository implements LineageRepository {
  private readonly edges = new Map<LineageEdgeId, LineageEdge>();

  async directParents(childId: RecordId): Promise<readonly LineageEdge[]> {
    const matches: LineageEdge[] = [];

    for (const edge of this.edges.values()) {
      if (edge.childId === childId) {
        matches.push(edge);
      }
    }

    return matches;
  }

  async save(edge: LineageEdge): Promise<void> {
    this.edges.set(edge.id, edge);
  }

  clear(): void {
    this.edges.clear();
  }

  snapshot(): Map<LineageEdgeId, LineageEdge> {
    return new Map(this.edges);
  }

  restore(snapshot: Map<LineageEdgeId, LineageEdge>): void {
    this.edges.clear();
    for (const [id, edge] of snapshot) this.edges.set(id, edge);
  }
}
