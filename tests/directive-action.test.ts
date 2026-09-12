import { beforeEach, describe, expect, it, vi } from 'vitest';

const { create, revoke, directSave, revalidatePath } = vi.hoisted(() => ({
  create: vi.fn(),
  revoke: vi.fn(),
  directSave: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/server/container', () => ({
  getServices: () => ({
    directives: { create, revoke },
    // If the Action reaches through the Application boundary, the test fails.
    repositories: { directives: { save: directSave } },
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

  it('routes revocation through DirectiveService', async () => {
    const form = new FormData();
    form.set('id', 'dir_test');

    await revokeDirective(form);

    expect(revoke).toHaveBeenCalledWith('dir_test', expect.any(Date));
    expect(directSave).not.toHaveBeenCalled();
  });
});
