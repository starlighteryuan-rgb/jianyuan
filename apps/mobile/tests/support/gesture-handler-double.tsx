/**
 * Test double for react-native-gesture-handler.
 *
 * Vitest runs in Node without the native gesture runtime. Production components
 * keep the real Gesture API; this double only preserves the chainable builder
 * surface and renders children so component tests can inspect the tree.
 */

import { createElement, type ReactNode } from 'react';

type PanGestureBuilder = {
  activeOffsetX: () => PanGestureBuilder;
  failOffsetY: () => PanGestureBuilder;
  onBegin: () => PanGestureBuilder;
  onUpdate: () => PanGestureBuilder;
  onEnd: () => PanGestureBuilder;
};

const panGesture: PanGestureBuilder = {
  activeOffsetX: () => panGesture,
  failOffsetY: () => panGesture,
  onBegin: () => panGesture,
  onUpdate: () => panGesture,
  onEnd: () => panGesture,
};

export const Gesture = {
  Pan: () => panGesture,
};

export const GestureDetector = ({ children }: { readonly children: ReactNode }) =>
  createElement('GestureDetector', null, children);

export const GestureHandlerRootView = ({ children }: { readonly children: ReactNode }) =>
  createElement('GestureHandlerRootView', null, children);
