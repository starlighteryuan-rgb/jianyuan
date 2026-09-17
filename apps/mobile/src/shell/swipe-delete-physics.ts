/**
 * Swipe-to-delete release physics.
 *
 * Kept free of React Native imports so the threshold and direction rules can be
 * tested directly. The UI component only supplies the gesture measurements.
 */

export const SWIPE_ACTION_WIDTH = 92;
export const SWIPE_REVEAL_THRESHOLD = SWIPE_ACTION_WIDTH * 0.46;
export const SWIPE_OPEN_VELOCITY = 0.35;
export const SWIPE_CLOSE_VELOCITY = 0.35;

export type SwipeRelease = {
  readonly start: number;
  readonly dx: number;
  readonly velocityX: number;
};

export const clampSwipeTranslation = (next: number): number =>
  Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, next));

/**
 * Decide the resting state after release.
 *
 * The visible reveal wins unless the user clearly flicks the row closed. This
 * keeps a partly exposed action open instead of bouncing back on a slow release.
 */
export const shouldRevealAfterSwipe = ({
  start,
  dx,
  velocityX,
}: SwipeRelease): boolean => {
  const next = clampSwipeTranslation(start + dx);
  const revealed = Math.abs(next);

  if (velocityX <= -SWIPE_OPEN_VELOCITY) return true;
  if (velocityX >= SWIPE_CLOSE_VELOCITY) return false;
  return revealed >= SWIPE_REVEAL_THRESHOLD;
};
