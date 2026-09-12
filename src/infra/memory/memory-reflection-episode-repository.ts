import type { ReflectionEpisodeRepository } from '../../domain/ports/repositories';
import type { ReflectionEpisode } from '../../domain/reflection/reflection-episode';
import type { ReflectionEpisodeId } from '../../domain/shared/ids';

export class MemoryReflectionEpisodeRepository
  implements ReflectionEpisodeRepository
{
  private readonly episodes = new Map<ReflectionEpisodeId, ReflectionEpisode>();

  async save(episode: ReflectionEpisode): Promise<void> {
    this.episodes.set(episode.id, episode);
  }

  clear(): void {
    this.episodes.clear();
  }
}
