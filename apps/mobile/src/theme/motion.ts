import { useMemo } from 'react';
import {
  Easing,
  ReduceMotion,
  useReducedMotion,
  withSpring,
  withTiming,
  type WithSpringConfig,
  type WithTimingConfig,
} from 'react-native-reanimated';

export const MOTION_DURATION = {
  fast: 150,
  normal: 240,
  slow: 380,
} as const;

export type MotionDuration = keyof typeof MOTION_DURATION;

const STANDARD_EASING = Easing.inOut(Easing.quad);

export const timing = (duration: MotionDuration, reduceMotion: boolean): WithTimingConfig => ({
  duration: MOTION_DURATION[duration],
  easing: STANDARD_EASING,
  reduceMotion: reduceMotion ? ReduceMotion.System : ReduceMotion.Never,
});

export const softSpring = (reduceMotion: boolean): WithSpringConfig => ({
  damping: 26,
  mass: 0.9,
  stiffness: 240,
  reduceMotion: reduceMotion ? ReduceMotion.System : ReduceMotion.Never,
});

/**
 * Central motion preferences for M3. Spatial distance is intentionally small;
 * reduced motion collapses it to a short opacity transition.
 */
export const useMotion = () => {
  const reduceMotion = useReducedMotion();
  return useMemo(
    () => ({
      reduceMotion,
      spatialOffset: reduceMotion ? 0 : 16,
      bubbleScale: reduceMotion ? 1 : 0.96,
      detailScale: reduceMotion ? 1 : 0.98,
      timing,
      spring: softSpring,
    }),
    [reduceMotion],
  );
};

export { withSpring, withTiming };
