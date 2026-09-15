/**
 * Directive write orchestration (ENGINEERING_CONTRACT §26, INV-17).
 *
 * Every production write enters through this service. The application layer
 * constructs the entity and delegates legality to the existing Domain rule;
 * only a valid Directive reaches the repository.
 */

import {
  type Directive,
  type DirectiveScope,
  type DirectiveScopeError,
  validateDirectiveScope,
} from '../domain/directive/directive';
import type { DirectiveRepository } from '../domain/ports/repositories';
import { type Result, err, ok } from '../domain/shared/result';
import { directiveId, type DirectiveId } from '../domain/shared/ids';

export interface DirectiveIdGenerator {
  nextDirectiveId(): string;
}

export interface DirectiveServiceDeps {
  readonly directives: DirectiveRepository;
  readonly ids: DirectiveIdGenerator;
}

export interface CreateDirectiveInput {
  readonly allowAnalysis: boolean;
  readonly allowStorage: boolean;
  readonly allowPassivePresentation: boolean;
  readonly allowProactivePresentation: boolean;
  readonly appliesToFutureSimilar: boolean;
  readonly scope: DirectiveScope | null;
  readonly now: Date;
}

export class DirectiveService {
  constructor(private readonly deps: DirectiveServiceDeps) {}

  async create(
    input: CreateDirectiveInput,
  ): Promise<Result<Directive, DirectiveScopeError>> {
    const active = await this.deps.directives.listActive();
    const existing = active.find(
      (candidate) =>
        candidate.appliesToFutureSimilar === input.appliesToFutureSimilar &&
        ((candidate.scope === null && input.scope === null) ||
          (candidate.scope !== null &&
            input.scope !== null &&
            candidate.scope.kind === input.scope.kind &&
            candidate.scope.value === input.scope.value)),
    );
    const directive: Directive = {
      id: existing?.id ?? directiveId(this.deps.ids.nextDirectiveId()),
      allowAnalysis: input.allowAnalysis,
      allowStorage: input.allowStorage,
      allowPassivePresentation: input.allowPassivePresentation,
      allowProactivePresentation: input.allowProactivePresentation,
      appliesToFutureSimilar: input.appliesToFutureSimilar,
      scope: input.scope,
      revokedAt: null,
      createdAt: existing?.createdAt ?? input.now,
    };

    const problem = validateDirectiveScope(directive);
    if (problem !== null) return err(problem);

    await this.deps.directives.save(directive);
    return ok(directive);
  }

  async revoke(id: DirectiveId, at: Date): Promise<void> {
    await this.deps.directives.revoke(id, at);
  }
}
