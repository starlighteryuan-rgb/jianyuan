/**
 * Test double for `react-native`.
 *
 * WHY THIS EXISTS
 * React Native 0.86's package entry is Flow-typed source (`import typeof ...`,
 * `} as ReactNativePublicAPI;`). Vitest/Vite cannot parse it without the full RN
 * Babel preset, and dragging that in just to assert on a component tree would
 * make the test infrastructure heavier than the thing it tests.
 *
 * WHAT IS AND IS NOT SUBSTITUTED
 * Only the rendering PRIMITIVES are replaced. Every component under test is the
 * real production component: the real conditional rendering, the real state, the
 * real props. `View`, `Text`, `Pressable`, and friends become plain host
 * elements that react-test-renderer can introspect, and `StyleSheet.create`
 * returns its input unchanged.
 *
 * This is the same trade the Desktop tests make when they render into jsdom:
 * the platform primitives are provided by the test environment, and the
 * application logic is real.
 */

import { createElement, forwardRef, type ReactNode } from 'react';


type PrimitiveProps = Record<string, unknown> & { readonly children?: ReactNode };

const primitive = (name: string) => {
  const Component = forwardRef<unknown, PrimitiveProps>((props, ref) =>
    createElement(name, { ...props, ref }),
  );
  Component.displayName = name;
  return Component;
};

export const View = primitive('View');
export const Text = primitive('Text');
export const Pressable = primitive('Pressable');
export const TouchableOpacity = primitive('TouchableOpacity');
export const ScrollView = primitive('ScrollView');
export const TextInput = primitive('TextInput');
export const ActivityIndicator = primitive('ActivityIndicator');
export const KeyboardAvoidingView = primitive('KeyboardAvoidingView');
export const SafeAreaView = primitive('SafeAreaView');

const createAnimatedValue = (value: number) => ({
  value,
  setValue(next: number) {
    this.value = next;
  },
});

export const Animated = {
  Value: class {
    value: number;
    constructor(value: number) {
      this.value = value;
    }
    setValue(next: number) {
      this.value = next;
    }
  },
  View: primitive('Animated.View'),
  Text: primitive('Animated.Text'),
  timing: (_value: unknown, _config: unknown) => ({ start: (callback?: () => void) => callback?.() }),
  spring: (_value: unknown, _config: unknown) => ({
    start: (callback?: () => void) => callback?.(),
  }),
};

export const PanResponder = {
  create: (handlers: Record<string, unknown>) => ({ panHandlers: handlers }),
};

/**
 * Minimal Keyboard event seam so Search lifecycle tests do not depend on a
 * native keyboard implementation. Tests emit events explicitly.
 */
type KeyboardListener = { remove(): void };
const keyboardListeners = new Map<string, Set<() => void>>();
export const Keyboard = {
  addListener(event: string, listener: () => void): KeyboardListener {
    const listeners = keyboardListeners.get(event) ?? new Set<() => void>();
    listeners.add(listener);
    keyboardListeners.set(event, listeners);
    return {
      remove: () => {
        listeners.delete(listener);
      },
    };
  },
  dismiss: () => undefined,
};

export const __emitKeyboardEvent = (event: string): void => {
  for (const listener of keyboardListeners.get(event) ?? []) listener();
};

export const __clearKeyboardListeners = (): void => {
  keyboardListeners.clear();
};

/** Minimal FlatList: renders data through renderItem, plus the empty state. */
export const FlatList = (props: {
  readonly data?: readonly unknown[];
  readonly renderItem?: (info: { readonly item: unknown; readonly index: number }) => ReactNode;
  readonly keyExtractor?: (item: unknown, index: number) => string;
  readonly ListEmptyComponent?: ReactNode;
  readonly ListHeaderComponent?: ReactNode;
  readonly testID?: string;
}) => {
  const { data = [], renderItem, ListEmptyComponent, ListHeaderComponent, ...rest } = props;
  const children: ReactNode[] = [];
  if (ListHeaderComponent) children.push(ListHeaderComponent);
  if (data.length === 0 && ListEmptyComponent) {
    children.push(ListEmptyComponent);
  } else if (renderItem) {
    data.forEach((item, index) => children.push(renderItem({ item, index })));
  }
  return createElement('FlatList', rest, ...children);
};

export const StyleSheet = {
  create: <T,>(styles: T): T => styles,
  flatten: <T,>(style: T): T => style,
  absoluteFill: {},
  hairlineWidth: 1,
};

/** Overridden per test with `vi.spyOn`; defaults to light. */
let colorScheme: 'light' | 'dark' | null = 'light';
export const __setColorScheme = (scheme: 'light' | 'dark' | null): void => {
  colorScheme = scheme;
};
export const useColorScheme = (): 'light' | 'dark' | null => colorScheme;

export const Platform = {
  OS: 'ios' as const,
  select: <T,>(options: Record<string, T>): T | undefined => options.ios ?? options.default,
};

export const Dimensions = {
  get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
};

export default {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Platform,
  Keyboard,
  useColorScheme,
};
