import { beforeEach, describe, expect, it, vi } from 'vitest';

const { create, revoke, directSave, revalidatePath } = vi.hoisted(() => ({
  create: vi.fn(),
  revoke: vi.fn(),
  directSave: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/server/capture-composition-root', () => ({
  getCoreComposition: async () => ({
    directives: { create, revoke },
    // If the Action reaches through the storage adapter, the test fails.
    storage: { directives: { save: directSave } },
  }),
}));

vi.mock('next/cache', () => ({ revalidatePath }));

import {
  createDirective,
  revokeDirective,
} from '../src/app/actions/directives';

describe('Directive Action Application boundary', () => {
  beforeEach(() => {
    create.mockReset();
    revoke.mockReset();
    directSave.mockReset();
    revalidatePath.mockReset();
    create.mockResolvedValue({ ok: true, value: { id: 'dir_test' } });
  });

  it('delegates creation to DirectiveService without accessing Repository', async () => {
    const form = new FormData();
    form.set('allowStorage', 'on');
    form.set('allowPassivePresentation', 'on');

    await createDirective(form);

    expect(create).toHaveBeenCalledWith({
      allowStorage: true,
      allowAnalysis: false,
      allowPassivePresentation: true,
      allowProactivePresentation: false,
      appliesToFutureSimilar: false,
      scope: null,
      now: expect.any(Date),
    });
    expect(directSave).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
    expect(revalidatePath).toHaveBeenCalledWith('/');
  });

  it('does not report success when Domain validation rejects creation', async () => {
    create.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'future_similar_requires_explicit_scope' },
    });
    const form = new FormData();
    form.set('appliesToFutureSimilar', 'on');

    await createDirective(form);

    expect(create).toHaveBeenCalledOnce();
    expect(directSave).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('passes only an explicit user-entered scope to Core', async () => {
    const form = new FormData();
    form.set('allowAnalysis', 'on');
    form.set('appliesToFutureSimilar', 'on');
    form.set('scopeKind', 'topic_tag');
    form.set('scopeValue', '  sleep  ');

    await createDirective(form);

    expect(create).toHaveBeenCalledWith({
      allowStorage: false,
      allowAnalysis: true,
      allowPassivePresentation: false,
      allowProactivePresentation: false,
      appliesToFutureSimilar: true,
      scope: { kind: 'topic_tag', value: 'sleep' },
      now: expect.any(Date),
    });
  });

  it('routes revocation through DirectiveService', async () => {
    const form = new FormData();
    form.set('id', 'dir_test');

    await revokeDirective(form);

    expect(revoke).toHaveBeenCalledWith('dir_test', expect.any(Date));
    expect(directSave).not.toHaveBeenCalled();
  });
});
