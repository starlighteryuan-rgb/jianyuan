import type { DiscoveryRepository } from '../../domain/ports/repositories';
import type { Discovery } from '../../domain/discovery/discovery';
import type { DiscoveryId } from '../../domain/shared/ids';

export class MemoryDiscoveryRepository implements DiscoveryRepository {
  private readonly discoveries = new Map<DiscoveryId, Discovery>();

  async findById(id: DiscoveryId): Promise<Discovery | null> {
    return this.discoveries.get(id) ?? null;
  }

  async findByStableKey(stableKey: string): Promise<Discovery | null> {
    for (const discovery of this.discoveries.values()) {
      if (discovery.stableKey === stableKey) {
        return discovery;
      }
    }

    return null;
  }

  async ensure(discovery: Discovery): Promise<Discovery> {
    const existing = await this.findByStableKey(discovery.stableKey);
    if (existing !== null) {
      return existing;
    }

    this.discoveries.set(discovery.id, discovery);
    return discovery;
  }

  clear(): void {
    this.discoveries.clear();
  }
}
