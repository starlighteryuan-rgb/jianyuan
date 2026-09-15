import type { LineageRepository } from '../../core/index';
import type { LineageEdge } from '../../core/index';
import type { RecordId, LineageEdgeId } from '../../core/index';

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


