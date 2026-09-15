import { beforeEach, describe, expect, it, vi } from 'vitest';

const { preference, updatePreference, revalidatePath } = vi.hoisted(() => ({
  preference: vi.fn(),
  updatePreference: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/server/capture-composition-root', () => ({
  getCoreComposition: async () => ({
    reflection: { preference, updatePreference },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath }));

import { updateReflectionInvitationPermission } from '../src/app/actions/preferences';

describe('Reflection invitation permission action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    preference.mockResolvedValue({
      hypothesisVisibility: 'on_request',
      interventionLevel: 'minimal',
      explanationDensity: 'brief',
    });
  });

  it('maps the user toggle to the existing ReflectionPreference', async () => {
    const form = new FormData();
    form.set('allowReflectionInvitation', 'on');

    await updateReflectionInvitationPermission(form);

    expect(updatePreference).toHaveBeenCalledWith({
      hypothesisVisibility: 'on_request',
      interventionLevel: 'standard',
      explanationDensity: 'brief',
      now: expect.any(Date),
    });
  });
});
