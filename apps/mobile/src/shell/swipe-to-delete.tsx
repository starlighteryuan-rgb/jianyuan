import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { RADIUS, SPACING, TYPOGRAPHY } from '../theme/tokens';
import { useTheme } from '../theme/theme-context';
import { SWIPE_ACTION_WIDTH } from './swipe-delete-physics';

const OPEN_SPRING = {
  damping: 30,
  mass: 0.8,
  stiffness: 260,
  overshootClamping: true,
};

const CLOSE_SPRING = {
  damping: 34,
  mass: 0.82,
  stiffness: 300,
  overshootClamping: true,
};

export const SwipeToDelete = ({
  children,
  onDelete,
  testID,
  deleteLabel = '删除',
}: {
  readonly children: ReactNode;
  readonly onDelete: () => void | Promise<void>;
  readonly testID: string;
  readonly deleteLabel?: string;
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const isOpen = useSharedValue(false);


  const close = () => {
    isOpen.value = false;
    translateX.value = withSpring(0, CLOSE_SPRING);
  };

  const reveal = () => {
    isOpen.value = true;
    translateX.value = withSpring(-SWIPE_ACTION_WIDTH, OPEN_SPRING);
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onBegin(() => {
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      translateX.value = Math.max(
        -SWIPE_ACTION_WIDTH,
        Math.min(0, startX.value + event.translationX),
      );
    })
    .onEnd((event) => {
      const current = Math.max(
        -SWIPE_ACTION_WIDTH,
        Math.min(0, startX.value + event.translationX),
      );
      const revealed = Math.abs(current);
      const shouldReveal =
        event.velocityX <= -350 ||
        (event.velocityX < 350 && revealed >= SWIPE_ACTION_WIDTH * 0.46);

      if (shouldReveal) {
        isOpen.value = true;
        translateX.value = withSpring(-SWIPE_ACTION_WIDTH, OPEN_SPRING);
      } else {
        isOpen.value = false;
        translateX.value = withSpring(0, CLOSE_SPRING);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

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
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.content,
            { backgroundColor: colors.canvas },
            animatedStyle,
          ]}
        >
          {children}
        </Animated.View>
      </GestureDetector>
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
    width: SWIPE_ACTION_WIDTH,
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
