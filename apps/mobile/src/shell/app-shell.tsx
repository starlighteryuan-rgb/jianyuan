/**
 * The Mobile shell: header, one active space, Bottom Tabs, and Settings.
 *
 * NAVIGATION ISOLATION IS STRUCTURAL
 * The Desktop renderer once shipped a regression where every space section
 * remained mounted and only the active one was hidden by CSS, so content from
 * other spaces bled into view. The fix there was a visibility rule; here the
 * equivalent failure is designed out.
 *
 * The shell renders exactly ONE space element for the active space. There is
 * no list of spaces, no `display: none`, and no conditional wrapper around
 * siblings — inactive spaces are simply never constructed. A space component
 * therefore cannot render unless it is the active one, and
 * tests/navigation.test.tsx asserts both that the active space is present and
 * that no other space's content is.
 *
 * SETTINGS IS NOT A TAB
 * `TAB_SPACES` drives the tab bar; Settings is reached from the header. Keeping
 * the two lists separate means promoting Settings into the tab bar would require
 * editing the tab list, not merely adding a case.
 */

import { useEffect, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AwarenessSpace } from '../spaces/awareness-space';
import { ExplorationSpace } from '../spaces/exploration-space';
import { RecordSpace } from '../spaces/record-space';
import { SettingsSpace } from '../spaces/settings-space';
import { UnderstandingSpace } from '../spaces/understanding-space';
import { useMotion } from '../theme/motion';
import { useAwarenessUnreadCount } from './runtime-context';
import { useTheme } from '../theme/theme-context';
import { SPACING, TYPOGRAPHY } from '../theme/tokens';
import {
  SETTINGS_SPACE,
  SPACE_LABELS,
  TAB_SPACES,
  isTabSpace,
  type SpaceId,
} from './spaces';
import { LocalSearchControl } from './local-search';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const AnimatedTab = ({
  space,
  active,
  unreadCount,
  onPress,
}: {
  readonly space: SpaceId;
  readonly active: boolean;
  readonly unreadCount: number;
  readonly onPress: () => void;
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const motion = useMotion();
  const progress = useSharedValue(active ? 1 : 0);
  const badge = useSharedValue(unreadCount > 0 ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, motion.timing('fast', motion.reduceMotion));
  }, [active, motion, progress]);

  useEffect(() => {
    if (unreadCount > 0) {
      badge.value = 0.92;
      badge.value = withSpring(1, motion.spring(motion.reduceMotion));
      return;
    }
    badge.value = withTiming(0, motion.timing('fast', motion.reduceMotion));
  }, [badge, motion, unreadCount]);

  const tabStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [colors.textMuted, colors.accent]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 1.02]) }],
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badge.value,
    transform: [{ scale: interpolate(badge.value, [0, 1], [0.82, 1]) }],
  }));

  return (
    <AnimatedPressable
      testID={`tab-${space}`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      accessibilityLabel={SPACE_LABELS[space]}
      style={styles.tab}
    >
      <Animated.Text style={[TYPOGRAPHY.meta, tabStyle]}>
        {SPACE_LABELS[space]}
        <Animated.Text testID={`tab-badge-${space}`} style={[TYPOGRAPHY.meta, badgeStyle]}>
          {unreadCount > 0 ? ` (${unreadCount})` : ''}
        </Animated.Text>
      </Animated.Text>
    </AnimatedPressable>
  );
};

export const AppShell = () => {
  const [activeSpace, setActiveSpace] = useState<SpaceId>('records');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const { theme } = useTheme();
  const { colors } = theme;
  const motion = useMotion();
  const unreadAwareness = useAwarenessUnreadCount();
  const entering = useSharedValue(1);

  const currentSpace: SpaceId = settingsOpen ? SETTINGS_SPACE : activeSpace;

  const showSpace = (_space: SpaceId, nextDirection: 1 | -1) => {
    setDirection(nextDirection);
  };

  const selectTab = (space: SpaceId) => {
    const nextDirection: 1 | -1 =
      TAB_SPACES.indexOf(isTabSpace(space) ? space : 'records') >=
      TAB_SPACES.indexOf(isTabSpace(activeSpace) ? activeSpace : 'records')
        ? 1 : -1;
    setSearchQuery('');
    setSearchOpen(false);
    setSettingsOpen(false);
    showSpace(space, nextDirection);
    setActiveSpace(space);
  };

  // Keep navigation state synchronous; motion is presentation only.
  useEffect(() => {
    entering.value = 0;
    entering.value = withTiming(1, motion.timing('normal', motion.reduceMotion));
  }, [currentSpace, entering, motion]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: entering.value,
    transform: [
      {
        translateX: interpolate(
          entering.value,
          [0, 1],
          [direction * motion.spatialOffset, 0],
        ),
      },
    ],
  }));

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.canvas }]}>
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.borderSubtle, backgroundColor: colors.canvas },
        ]}
      >
        <Text testID="app-title" style={[TYPOGRAPHY.title, { color: colors.textPrimary }]}>
          {SPACE_LABELS[currentSpace]}
        </Text>

        <View style={styles.headerActions}>
          {currentSpace === SETTINGS_SPACE ? null : (
            <LocalSearchControl
              testID="local-search"
              placeholder={`搜索${SPACE_LABELS[currentSpace]}`}
              query={searchQuery}
              onChangeQuery={setSearchQuery}
              open={searchOpen}
              onOpenChange={setSearchOpen}
            />
          )}
          <Pressable
            testID="settings-entry"
            accessibilityRole="button"
            accessibilityLabel="设置"
            onPress={() => {
              const wasOpen = settingsOpen;
              setSettingsOpen(!wasOpen);
              showSpace(wasOpen ? activeSpace : SETTINGS_SPACE, wasOpen ? -1 : 1);
            }}
            style={styles.settingsEntry}
          >
            <Text
              style={[
                TYPOGRAPHY.meta,
                { color: settingsOpen ? colors.accent : colors.textSecondary },
              ]}
            >
              设置
            </Text>
          </Pressable>
        </View>
      </View>

      {/*
        The single mounted space. `data-space` is exposed as a testID so tests can
        assert which space is present without relying on styling.
      */}
      <Animated.View testID={`active-space-${currentSpace}`} style={[styles.body, contentStyle]}>
        {currentSpace === 'records' ? <RecordSpace searchQuery={searchQuery} /> : null}
        {currentSpace === 'awareness' ? <AwarenessSpace searchQuery={searchQuery} /> : null}
        {currentSpace === 'reflection' ? <UnderstandingSpace searchQuery={searchQuery} /> : null}
        {currentSpace === 'exploration' ? <ExplorationSpace searchQuery={searchQuery} /> : null}
        {currentSpace === SETTINGS_SPACE ? <SettingsSpace /> : null}
      </Animated.View>

      <View
        testID="tab-bar"
        style={[
          styles.tabBar,
          { borderTopColor: colors.borderSubtle, backgroundColor: colors.surface },
        ]}
      >
        {TAB_SPACES.map((space) => (
          <AnimatedTab
            key={space}
            space={space}
            active={!settingsOpen && space === activeSpace}
            unreadCount={space === 'awareness' ? unreadAwareness : 0}
            onPress={() => selectTab(space)}
          />
        ))}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  settingsEntry: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    flex: 1,
  },
  body: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingBottom: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: SPACING.xs },
});
