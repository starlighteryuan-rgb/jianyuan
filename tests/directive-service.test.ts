/** V1.1 Architecture Stabilization B2 — validated Directive writes. */

import { describe, expect, it } from 'vitest';

import { DirectiveService } from '@/application/directive-service';
import { MemoryDirectiveRepository } from '@/infra/memory/memory-directive-repository';

const NOW = new Date('2026-09-13T00:00:00.000Z');

const serviceWith = (repository: MemoryDirectiveRepository) =>
  new DirectiveService({
    directives: repository,
    ids: { nextDirectiveId: () => 'dir_test' },
  });

const validInput = () => ({
  allowAnalysis: true,
  allowStorage: true,
  allowPassivePresentation: true,
  allowProactivePresentation: false,
  appliesToFutureSimilar: false,
  scope: null,
  now: NOW,
});

describe('DirectiveService Domain validation boundary', () => {
  it('does not persist an invalid Directive state', async () => {
    const repository = new MemoryDirectiveRepository();
    const service = serviceWith(repository);

    const result = await service.create({
      ...validInput(),
      appliesToFutureSimilar: true,
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        kind: 'future_similar_requires_explicit_scope',
      }),
    });
    expect(await repository.listActive()).toEqual([]);
  });

  it('persists a valid Directive after Domain validation', async () => {
    const repository = new MemoryDirectiveRepository();
    const service = serviceWith(repository);

    const result = await service.create({
      ...validInput(),
      appliesToFutureSimilar: true,
      scope: { kind: 'topic_tag', value: 'exercise' },
    });

    expect(result.ok).toBe(true);
    expect(await repository.listActive()).toEqual([
      expect.objectContaining({
        id: 'dir_test',
        appliesToFutureSimilar: true,
        scope: { kind: 'topic_tag', value: 'exercise' },
      }),
    ]);
  });
});
