import type { FocusContextRepository } from '../../core/index';
import type { CurrentFocusContext } from '../../core/index';
import type { FocusContextId } from '../../core/index';

export class MemoryFocusContextRepository implements FocusContextRepository {
  private readonly contexts = new Map<FocusContextId, CurrentFocusContext>();

  async findById(id: FocusContextId): Promise<CurrentFocusContext | null> {
    return this.contexts.get(id) ?? null;
  }

  async listActive(now: Date): Promise<readonly CurrentFocusContext[]> {
    const active: CurrentFocusContext[] = [];

    for (const context of this.contexts.values()) {
      if (
        context.endedAt === null &&
        (context.expiresAt === null || context.expiresAt > now)
      ) {
        active.push(context);
      }
    }

    active.sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );

    return active;
  }

  async save(context: CurrentFocusContext): Promise<void> {
    this.contexts.set(context.id, context);
  }

  async expire(id: FocusContextId, at: Date): Promise<void> {
    const context = this.contexts.get(id);
    if (context !== undefined) {
      this.contexts.set(id, { ...context, endedAt: at });
    }
  }

  clear(): void {
    this.contexts.clear();
  }
}


