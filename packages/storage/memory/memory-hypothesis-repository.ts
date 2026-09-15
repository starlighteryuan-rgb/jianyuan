import type { HypothesisRepository } from '../../core/index';
import type { StoredHypothesis } from '../../core/index';
import type { HypothesisId } from '../../core/index';

export class MemoryHypothesisRepository implements HypothesisRepository {
  private readonly hypotheses = new Map<HypothesisId, StoredHypothesis>();

  async findById(id: HypothesisId): Promise<StoredHypothesis | null> {
    return this.hypotheses.get(id) ?? null;
  }

  async findByAnchorRef(
    anchorRef: string,
  ): Promise<readonly StoredHypothesis[]> {
    const matches: StoredHypothesis[] = [];

    for (const hypothesis of this.hypotheses.values()) {
      if (hypothesis.anchorRefs.includes(anchorRef)) {
        matches.push(hypothesis);
      }
    }

    return matches;
  }

  async listAll(): Promise<readonly StoredHypothesis[]> {
    const hypotheses = [...this.hypotheses.values()];

    hypotheses.sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );

    return hypotheses;
  }

  async save(hypothesis: StoredHypothesis): Promise<void> {
    this.hypotheses.set(hypothesis.id, hypothesis);
  }

  clear(): void {
    this.hypotheses.clear();
  }
}


