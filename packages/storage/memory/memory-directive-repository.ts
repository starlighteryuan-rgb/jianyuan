import type { DirectiveRepository } from '../../core/index';
import type { Directive } from '../../core/index';
import type { DirectiveId } from '../../core/index';

export class MemoryDirectiveRepository implements DirectiveRepository {
  private readonly directives = new Map<DirectiveId, Directive>();

  async findById(id: DirectiveId): Promise<Directive | null> {
    return this.directives.get(id) ?? null;
  }

  async listActive(): Promise<readonly Directive[]> {
    const active: Directive[] = [];

    for (const directive of this.directives.values()) {
      if (directive.revokedAt === null) {
        active.push(directive);
      }
    }

    return active;
  }

  async save(directive: Directive): Promise<void> {
    this.directives.set(directive.id, directive);
  }

  async revoke(id: DirectiveId, at: Date): Promise<void> {
    const directive = this.directives.get(id);
    if (directive !== undefined) {
      this.directives.set(id, { ...directive, revokedAt: at });
    }
  }

  clear(): void {
    this.directives.clear();
  }
}


