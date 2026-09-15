import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redirect, respondToRelation, revalidatePath } = vi.hoisted(() => ({
  redirect: vi.fn(),
  respondToRelation: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('next/navigation', () => ({ redirect }));

vi.mock('@/server/capture-composition-root', () => ({
  getCoreComposition: async () => ({
    reflectionFlow: { respondToRelation },
  }),
}));

import {
  submitLeaveForNow,
  submitPosition,
  submitProse,
} from '../src/app/actions/reflection';

describe('Reflection Action Core composition boundary', () => {
  beforeEach(() => {
    redirect.mockReset();
    respondToRelation.mockReset();
    revalidatePath.mockReset();
    respondToRelation.mockResolvedValue({ recordId: null });
  });

  it('routes a position through the Core Reflection flow without prose', async () => {
    const form = new FormData();
    form.set('targetRef', 'rc_1');
    form.set('response', 'accepted');

    await submitPosition(form);

    expect(respondToRelation).toHaveBeenCalledWith({
      targetRef: 'rc_1',
      feedback: {
        response: 'accepted',
        freeText: null,
        leaveForNow: false,
        userInitiatedContinuation: false,
      },
      now: expect.any(Date),
    });
    expect(redirect).toHaveBeenCalledWith(
      '/reflect/rc_1?submitted=position-recorded',
    );
  });

  it('routes prose through the Core Reflection flow verbatim', async () => {
    const form = new FormData();
    form.set('targetRef', 'rc_1');
    form.set('freeText', '  保留我的原话。  ');

    await submitProse(form);

    expect(respondToRelation).toHaveBeenCalledWith({
      targetRef: 'rc_1',
      feedback: {
        response: null,
        freeText: '  保留我的原话。  ',
        leaveForNow: false,
        userInitiatedContinuation: false,
      },
      now: expect.any(Date),
    });
    expect(revalidatePath).toHaveBeenCalledWith('/reflection');
    expect(redirect).toHaveBeenCalledWith(
      '/reflect/rc_1?submitted=not-stored',
    );
  });

  it('routes deferral separately and creates no prose payload', async () => {
    const form = new FormData();
    form.set('targetRef', 'rc_1');

    await submitLeaveForNow(form);

    expect(respondToRelation).toHaveBeenCalledWith({
      targetRef: 'rc_1',
      feedback: {
        response: null,
        freeText: null,
        leaveForNow: true,
        userInitiatedContinuation: false,
      },
      now: expect.any(Date),
    });
    expect(redirect).toHaveBeenCalledWith(
      '/reflect/rc_1?submitted=left-for-now',
    );
  });
});
