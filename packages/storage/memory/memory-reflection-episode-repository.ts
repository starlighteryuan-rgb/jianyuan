import type { ReflectionEpisodeRepository } from '../../core/index';
import type { ReflectionEpisode } from '../../core/index';
import type { ReflectionEpisodeId } from '../../core/index';

export class MemoryReflectionEpisodeRepository
  implements ReflectionEpisodeRepository
{
  private readonly episodes = new Map<ReflectionEpisodeId, ReflectionEpisode>();

  async save(episode: ReflectionEpisode): Promise<void> {
    this.episodes.set(episode.id, episode);
  }

  async listByTarget(
    targetRef: string,
  ): Promise<readonly ReflectionEpisode[]> {
    const matches: ReflectionEpisode[] = [];

    for (const episode of this.episodes.values()) {
      if (episode.targetRef === targetRef) {
        matches.push(episode);
      }
    }

    // Newest first, matching the SQLite adapter's ordering.
    return matches.sort(
      (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
    );
  }

  clear(): void {
    this.episodes.clear();
  }
}


