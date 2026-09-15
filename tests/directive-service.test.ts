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

  it('overwrites the same active Directive instead of appending duplicate cards', async () => {
    const repository = new MemoryDirectiveRepository();
    let nextId = 0;
    const service = new DirectiveService({
      directives: repository,
      ids: { nextDirectiveId: () => `dir_${++nextId}` },
    });

    const first = await service.create(validInput());
    const second = await service.create({
      ...validInput(),
      allowAnalysis: false,
      now: new Date('2026-09-13T00:05:00.000Z'),
    });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('directive create failed');
    expect(second.value.id).toBe(first.value.id);
    expect(second.value.createdAt).toEqual(first.value.createdAt);
    expect(second.value.allowAnalysis).toBe(false);
    expect(await repository.listActive()).toHaveLength(1);
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
