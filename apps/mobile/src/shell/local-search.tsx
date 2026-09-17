/**
 * Local, presentation-only search for the four primary Mobile spaces.
 *
 * The component never calls the Provider and never writes to Core or SQLite.
 * It only controls a transient query string; each space decides what local
 * collection is filtered.
 *
 * M3 morph: the circle and field are one animated container. The input is only
 * mounted while expanded so closed search never owns focus or editable state.
 */

import { useEffect, useMemo, useRef } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useMotion } from '../theme/motion';
import { useTheme } from '../theme/theme-context';
import { RADIUS, SPACING, TYPOGRAPHY } from '../theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const LocalSearchControl = ({
  testID,
  placeholder,
  query,
  onChangeQuery,
  open,
  onOpenChange,
}: {
  readonly testID: string;
  readonly placeholder: string;
  readonly query: string;
  readonly onChangeQuery: (value: string) => void;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const motion = useMotion();
  const inputRef = useRef<TextInput | null>(null);
  const focusedRef = useRef(false);
  const queryRef = useRef(query);
  const progress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, motion.timing('normal', motion.reduceMotion));
  }, [motion, open, progress]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  // iOS can hide the keyboard without delivering a reliable TextInput blur.
  // Keyboard events are the authoritative signal; focus/query refs keep the
  // decision out of stale closures.
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const collapseIfEmpty = () => {
      // Keyboard absence plus an empty query is the invalid state the spec
      // calls out. Do not gate this on TextInput focus: iOS may keep the
      // input focused after the keyboard is dismissed.
      if (queryRef.current.trim().length === 0) {
        onOpenChange(false);
      }
    };
    const show = Keyboard.addListener('keyboardWillShow', () => {
      focusedRef.current = true;
      keyboardVisibleRef.current = true;
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardVisibleRef.current = false;
      collapseIfEmpty();
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [onOpenChange, open]);

  const containerStyle = useAnimatedStyle(() => ({
    borderRadius: interpolate(progress.value, [0, 1], [999, RADIUS.md]),
    width: interpolate(progress.value, [0, 1], [34, 236]),
    height: interpolate(progress.value, [0, 1], [34, 38]),
  }));

  const collapsedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.45, 1], [1, 0, 0]),
    transform: [{ translateX: interpolate(progress.value, [0, 1], [0, -8]) }],
  }));

  const expandedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.45, 1], [0, 0, 1]),
    transform: [{ translateX: interpolate(progress.value, [0, 1], [10, 0]) }],
  }));

  const keyboardVisibleRef = useRef(false);

  const handleQueryChange = (value: string) => {
    queryRef.current = value;
    onChangeQuery(value);
    if (value.trim().length === 0 && !keyboardVisibleRef.current) {
      onOpenChange(false);
    }
  };

  const containerColorStyle = useMemo(
    () => ({
      backgroundColor: colors.surface,
      borderColor: colors.borderSubtle,
    }),
    [colors.borderSubtle, colors.surface],
  );

  if (!open) {
    return (
      <AnimatedPressable
        testID={`${testID}-open`}
        accessibilityRole="button"
        accessibilityLabel="搜索"
        accessibilityState={{ expanded: false }}
        onPress={() => onOpenChange(true)}
        style={[styles.control, containerColorStyle, styles.collapsed]}
      >
        <Text style={[TYPOGRAPHY.lead, { color: colors.textSecondary }]}>⌕</Text>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      testID={`${testID}-control`}
      accessibilityRole="button"
      accessibilityLabel="搜索"
      accessibilityState={{ expanded: true }}
      style={[styles.control, containerColorStyle, containerStyle]}
    >
      <Animated.View
        testID={`${testID}-open`}
        aria-hidden
        style={[styles.face, collapsedStyle]}
        pointerEvents="none"
      >
        <Text style={[TYPOGRAPHY.lead, { color: colors.textSecondary }]}>⌕</Text>
      </Animated.View>

      <Animated.View style={[styles.field, expandedStyle]} pointerEvents="box-none">
        <TextInput
          testID={`${testID}-input`}
          ref={inputRef}
          value={query}
          onChangeText={handleQueryChange}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onEndEditing={() => {
            focusedRef.current = false;
            if (queryRef.current.trim().length === 0) onOpenChange(false);
          }}
          onBlur={() => {
            focusedRef.current = false;
            if (queryRef.current.trim().length === 0) onOpenChange(false);
          }}
          autoFocus
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={placeholder}
          style={[styles.input, TYPOGRAPHY.body, { color: colors.textPrimary }]}
        />
        {query.length > 0 ? (
          <Pressable
            testID={`${testID}-clear`}
            accessibilityRole="button"
            accessibilityLabel="清空搜索"
            onPress={() => onChangeQuery('')}
            style={styles.action}
          >
            <Text style={[TYPOGRAPHY.meta, { color: colors.textSecondary }]}>清空</Text>
          </Pressable>
        ) : null}
        <Pressable
          testID={`${testID}-cancel`}
          accessibilityRole="button"
          accessibilityLabel="取消搜索"
          onPress={() => {
            onChangeQuery('');
            onOpenChange(false);
          }}
          style={styles.action}
        >
          <Text style={[TYPOGRAPHY.meta, { color: colors.accent }]}>取消</Text>
        </Pressable>
      </Animated.View>
    </AnimatedPressable>
  );
};

export const matchesLocalQuery = (query: string, values: readonly (string | null | undefined)[]): boolean => {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0) return true;
  return values.some((value) => (value ?? '').toLocaleLowerCase().includes(needle));
};

const styles = StyleSheet.create({
  control: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  collapsed: {
    borderRadius: 999,
    width: 34,
    height: 34,
  },
  face: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  field: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
  },
  input: { flex: 1, minWidth: 80, paddingVertical: SPACING.xs },
  action: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
});
