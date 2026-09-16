/**
 * Node test double for Reanimated.
 *
 * Mobile component tests use the real production components, but Reanimated's
 * native/UI-thread runtime is unavailable in Vitest. This double keeps the same
 * small API surface used by M3: shared values, animated styles, timing/spring
 * descriptors, color interpolation, and an injectable reduced-motion value.
 */

import { createElement, type ReactNode } from 'react';

let reducedMotion = false;

export const __setReducedMotion = (value: boolean): void => {
  reducedMotion = value;
};

export const useReducedMotion = (): boolean => reducedMotion;

export const useSharedValue = <T,>(initial: T | (() => T)): { value: T } => ({
  value: typeof initial === 'function' ? (initial as () => T)() : initial,
});

export const useAnimatedStyle = <T extends Record<string, unknown>>(builder: () => T): T =>
  builder();

export const withTiming = (
  _toValue: unknown,
  _config?: unknown,
  callback?: (finished: boolean) => void,
) => {
  callback?.(true);
  return { type: 'timing' };
};

export const withSpring = (
  _toValue: unknown,
  _config?: unknown,
  callback?: (finished: boolean) => void,
) => {
  callback?.(true);
  return { type: 'spring' };
};

export const interpolate = (value: number, input: number[], output: number[]): number => {
  if (value <= input[0]!) return output[0]!;
  const last = input.length - 1;
  if (value >= input[last]!) return output[last]!;
  for (let index = 1; index < input.length; index += 1) {
    if (value <= input[index]!) {
      const ratio = (value - input[index - 1]!) / (input[index]! - input[index - 1]!);
      return output[index - 1]! + ratio * (output[index]! - output[index - 1]!);
    }
  }
  return output[last]!;
};

export const interpolateColor = (value: number, input: number[], output: string[]): string =>
  value <= input[0]! ? output[0]! : output[output.length - 1]!;

export const Easing = {
  inOut: (easing: unknown) => easing,
  quad: () => 0,
};

export const ReduceMotion = {
  System: 'system',
  Always: 'always',
  Never: 'never',
} as const;

type AnimatedComponentProps = Record<string, unknown> & { readonly children?: ReactNode };

const AnimatedView = (props: AnimatedComponentProps) => createElement('View', props);

const AnimatedText = (props: AnimatedComponentProps) => createElement('Text', props);

const createAnimatedComponent = (component: unknown) => component;

export default {
  View: AnimatedView,
  Text: AnimatedText,
  createAnimatedComponent,
};
