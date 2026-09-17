/**
 * Local, presentation-only search for the four primary Mobile spaces.
 *
 * The component never calls the Provider and never writes to Core or SQLite.
 * It only controls a transient query string; each space decides what local
 * collection is filtered.
 *
 * M3.1.2 RENDER MODE CONTRACT
 *   The visual container is chosen by one React boolean (`open`). Collapsed and
 *   expanded are two separate render branches with their own literal styles, so
 *   the visual width cannot diverge from the logical state.
 *
 *   This replaces the previous shared `progress` driven container. That earlier
 *   design let the logic collapse while the Reanimated-driven width stayed at
 *   the expanded value, which is exactly the residual rectangle seen on device.
 *
 * Valid states only:
 *   - collapsed:           query empty, keyboard hidden, circular button
 *   - expanded-empty:      query empty, keyboard shown / input focused
 *   - expanded-with-query: query non-empty, keyboard shown or hidden
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { RADIUS, SPACING, TYPOGRAPHY } from '../theme/tokens';
import { useTheme } from '../theme/theme-context';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const matchesLocalQuery = (
  query: string,
  values: readonly (string | null | undefined)[],
): boolean => {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0) return true;
  return values.some((value) => (value ?? '').toLocaleLowerCase().includes(needle));
};

export const LocalSearchControl = ({
  testID,
  placeholder,
  query,
  onChangeQuery,
  open,
  onOpenChange,
  fill,
}: {
  readonly testID: string;
  readonly placeholder: string;
  readonly query: string;
  readonly onChangeQuery: (value: string) => void;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** When true the expanded field fills all available header width. */
  readonly fill?: boolean;
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const inputRef = useRef<TextInput | null>(null);
  const queryRef = useRef(query);
  const keyboardVisibleRef = useRef(false);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  /**
   * A single collapse funnel. Every path that decides the search interaction
   * has ended calls this, so the render branch and the keyboard/focus state
   * cannot drift apart.
   */
  const collapse = useCallback(() => {
    keyboardVisibleRef.current = false;
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const isEmptyQuery = () => queryRef.current.trim().length === 0;

    // iOS may dismiss the keyboard without blurring the input. Keyboard events
    // are the authoritative "search interaction ended" signal.
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardVisibleRef.current = false;
      if (isEmptyQuery()) collapse();
    });
    const show = Keyboard.addListener('keyboardWillShow', () => {
      keyboardVisibleRef.current = true;
    });

    return () => {
      hide.remove();
      show.remove();
    };
  }, [collapse, open]);

  const handleQueryChange = (value: string) => {
    queryRef.current = value;
    onChangeQuery(value);
    // Clearing after the keyboard is already gone is a finished search.
    if (value.trim().length === 0 && !keyboardVisibleRef.current) collapse();
  };

  const handleBlur = () => {
    if (queryRef.current.trim().length === 0) collapse();
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
        style={[styles.collapsedControl, containerColorStyle]}
      >
        <Text style={[TYPOGRAPHY.lead, { color: colors.textSecondary }]}>⌕</Text>
      </AnimatedPressable>
    );
  }

  return (
    <Animated.View
      testID={`${testID}-control`}
      style={[styles.expandedControl, fill === true && styles.expandedControlFill, containerColorStyle]}
    >
      <TextInput
        testID={`${testID}-input`}
        ref={inputRef}
        value={query}
        onChangeText={handleQueryChange}
        onBlur={handleBlur}
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
          onPress={() => {
            onChangeQuery('');
            queryRef.current = '';
            if (!keyboardVisibleRef.current) collapse();
          }}
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
          queryRef.current = '';
          collapse();
        }}
        style={styles.action}
      >
        <Text style={[TYPOGRAPHY.meta, { color: colors.accent }]}>取消</Text>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  collapsedControl: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 999,
    width: 34,
    height: 34,
  },
  expandedControl: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: RADIUS.md,
    width: 236,
    height: 38,
    paddingHorizontal: SPACING.sm,
  },
  expandedControlFill: { flex: 1, width: 'auto' },
  input: { flex: 1, minWidth: 80, paddingVertical: SPACING.xs },
  action: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
});
