import { describe, expect, it } from 'vitest';

import {
  clampSwipeTranslation,
  shouldRevealAfterSwipe,
  SWIPE_ACTION_WIDTH,
  SWIPE_REVEAL_THRESHOLD,
} from '../src/shell/swipe-delete-physics';

describe('Swipe delete physics', () => {
  it('keeps the action width fixed and clamps drag distance', () => {
    expect(SWIPE_ACTION_WIDTH).toBe(92);
    expect(clampSwipeTranslation(-40)).toBe(-40);
    expect(clampSwipeTranslation(-500)).toBe(-SWIPE_ACTION_WIDTH);
    expect(clampSwipeTranslation(20)).toBe(0);
  });

  it('reveals once roughly half of the action is exposed, even on a slow release', () => {
    const slowReleaseDx = -(SWIPE_REVEAL_THRESHOLD + 2);

    expect(
      shouldRevealAfterSwipe({ start: 0, dx: slowReleaseDx, velocityX: 0 }),
    ).toBe(true);
    expect(
      shouldRevealAfterSwipe({ start: 0, dx: -(SWIPE_REVEAL_THRESHOLD - 4), velocityX: 0 }),
    ).toBe(false);
  });

  it('lets a clear left flick open and a clear right flick close', () => {
    expect(shouldRevealAfterSwipe({ start: 0, dx: -18, velocityX: -800 })).toBe(true);
    expect(
      shouldRevealAfterSwipe({ start: -SWIPE_ACTION_WIDTH, dx: 18, velocityX: 800 }),
    ).toBe(false);
  });

  it('keeps an already open row open when released with no velocity', () => {
    expect(
      shouldRevealAfterSwipe({
        start: -SWIPE_ACTION_WIDTH,
        dx: 0,
        velocityX: 0,
      }),
    ).toBe(true);
  });
});
