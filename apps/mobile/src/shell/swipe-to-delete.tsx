/**
 * Shared swipe-to-delete interaction for Mobile list items.
 *
 * Direction AB reference:
 * - one quiet destructive affordance, revealed only by a left swipe;
 * - no modal flow and no permanent toolbar;
 * - the row itself carries the action, so each space keeps its own hierarchy.
 *
 * The component owns only gesture + confirmation presentation. It never mutates
 * storage; callers pass the domain-safe delete action and decide what deletion
 * means for that object.
 */

import { useMemo, useRef } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { RADIUS, SPACING, TYPOGRAPHY } from '../theme/tokens';
import { useTheme } from '../theme/theme-context';

const ACTION_WIDTH = 84;
const SWIPE_THRESHOLD = 48;

export const SwipeToDelete = ({
  children,
  onDelete,
  testID,
  deleteLabel = '删除',
}: {
  readonly children: React.ReactNode;
  readonly onDelete: () => void | Promise<void>;
  readonly testID: string;
  readonly deleteLabel?: string;
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const translateX = useRef(new Animated.Value(0)).current;
  const open = useRef(false);

  const close = () => {
    open.current = false;
    Animated.timing(translateX, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  };

  const reveal = () => {
    open.current = true;
    Animated.timing(translateX, {
      toValue: -ACTION_WIDTH,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_event, gesture) => {
          const start = open.current ? -ACTION_WIDTH : 0;
          const next = Math.max(-ACTION_WIDTH, Math.min(0, start + gesture.dx));
          translateX.setValue(next);
        },
        onPanResponderRelease: (_event, gesture) => {
          const start = open.current ? -ACTION_WIDTH : 0;
          const next = start + gesture.dx;
          if (next < -SWIPE_THRESHOLD) reveal();
          else close();
        },
        onPanResponderTerminate: close,
      }),
    [translateX],
  );

  return (
    <View testID={testID} style={styles.shell}>
      <View pointerEvents="box-none" style={styles.actionLayer}>
        <Pressable
          testID={`${testID}-delete`}
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
          onPress={() => {
            close();
            void onDelete();
          }}
          style={[styles.action, { backgroundColor: colors.danger }]}
        >
          <Text style={[TYPOGRAPHY.action, { color: colors.onAccent }]}>{deleteLabel}</Text>
        </Pressable>
      </View>
      <Animated.View
        {...responder.panHandlers}
        style={[
          styles.content,
          {
            backgroundColor: colors.canvas,
            transform: [{ translateX }],
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  shell: { position: 'relative', overflow: 'hidden' },
  actionLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: ACTION_WIDTH,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  action: {
    minHeight: 44,
    borderRadius: RADIUS.xs,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.xs,
  },
  content: { position: 'relative' },
});
