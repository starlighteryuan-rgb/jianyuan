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
  ScrollView,
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

import { AwarenessHistoryView, AwarenessSpace } from '../spaces/awareness-space';
import { ExplorationSpace } from '../spaces/exploration-space';
import { RecordSpace } from '../spaces/record-space';
import { SettingsSpace } from '../spaces/settings-space';
import { UnderstandingSpace } from '../spaces/understanding-space';
import { useMotion } from '../theme/motion';
import { useAwarenessUnreadCount, useRuntime } from './runtime-context';
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
  }));

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scaleX: progress.value }],
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
      <Animated.Text style={[TYPOGRAPHY.tag, tabStyle]}>
        {SPACE_LABELS[space]}
        <Animated.Text testID={`tab-badge-${space}`} style={[TYPOGRAPHY.tag, badgeStyle]}>
          {unreadCount > 0 ? ` (${unreadCount})` : ''}
        </Animated.Text>
      </Animated.Text>
      <Animated.View
        pointerEvents="none"
        style={[styles.tabIndicator, { backgroundColor: colors.accent }, indicatorStyle]}
      />
    </AnimatedPressable>
  );
};

export const AppShell = () => {
  const [activeSpace, setActiveSpace] = useState<SpaceId>('records');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [awarenessHistoryOpen, setAwarenessHistoryOpen] = useState(false);
  const [recordTagVocabulary, setRecordTagVocabulary] = useState<readonly string[]>([]);
  const [activeRecordTag, setActiveRecordTag] = useState<string | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const { theme } = useTheme();
  const { colors } = theme;
  const motion = useMotion();
  const unreadAwareness = useAwarenessUnreadCount();
  const runtime = useRuntime();
  const entering = useSharedValue(1);

  // Record tag vocabulary, kept in sync with the runtime so the Record-space
  // tag filter can appear without duplicating tag state in the shell.
  useEffect(() => {
    let cancelled = false;
    const refreshTags = () => {
      void runtime.allTagNames().then((names) => {
        if (!cancelled) setRecordTagVocabulary(names);
      });
    };
    const unsubscribe = runtime.subscribeRecordTags(refreshTags);
    refreshTags();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [runtime]);

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
    setActiveRecordTag(null);
    setAwarenessHistoryOpen(false);
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
          { borderBottomColor: colors.dividerWeak, backgroundColor: colors.canvas },
        ]}
      >
        {/*
          Header render mode is driven by ONE boolean, `searchOpen`. Brand and
          actions are not squeezed or merely faded: they are not rendered at all
          in search mode, so the expanded field cannot overlap or clip the brand
          on a small iPhone. This replaces the layout where `见渊` stayed
          mounted beside a fixed-width field.
        */}
        {searchOpen ? null : (
          <Text testID="app-title" style={[TYPOGRAPHY.appTitle, { color: colors.textPrimary }]}>
            见渊
          </Text>
        )}

        <View style={[styles.headerActions, searchOpen && styles.headerActionsSearch]}>
          {currentSpace === SETTINGS_SPACE ? null : (
            <LocalSearchControl
              testID="local-search"
              placeholder={
                currentSpace === 'awareness' && awarenessHistoryOpen
                  ? '搜索觉察历史'
                  : `搜索${SPACE_LABELS[currentSpace]}`
              }
              query={searchQuery}
              onChangeQuery={setSearchQuery}
              open={searchOpen}
              fill={searchOpen}
              onOpenChange={(next) => {
                setSearchOpen(next);
                if (!next) setActiveRecordTag(null);
              }}
            />
          )}
          {!searchOpen && currentSpace === 'awareness' ? (
            awarenessHistoryOpen ? (
              <Pressable
                testID="awareness-history-back"
                accessibilityRole="button"
                accessibilityLabel="返回觉察"
                onPress={() => {
                  setSearchQuery('');
                  setSearchOpen(false);
                  setAwarenessHistoryOpen(false);
                }}
                style={styles.settingsEntry}
              >
                <Text style={[TYPOGRAPHY.meta, { color: colors.textSecondary }]}>返回</Text>
              </Pressable>
            ) : (
              <Pressable
                testID="awareness-history-entry"
                accessibilityRole="button"
                accessibilityLabel="觉察历史"
                onPress={() => {
                  setSearchQuery('');
                  setSearchOpen(false);
                  setAwarenessHistoryOpen(true);
                }}
                style={styles.settingsEntry}
              >
                <Text style={[TYPOGRAPHY.meta, { color: colors.textSecondary }]}>历史</Text>
              </Pressable>
            )
          ) : null}
          {!searchOpen ? (
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
          ) : null}
        </View>
      </View>

      {currentSpace === 'records' && searchOpen && recordTagVocabulary.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          testID="record-tag-filter"
          contentContainerStyle={styles.tagFilterContent}
          style={[styles.tagFilter, { borderBottomColor: colors.dividerWeak }]}
        >
          {[null, ...recordTagVocabulary].map((tag) => {
            const active = tag === activeRecordTag;
            return (
              <Pressable
                key={tag ?? '__all__'}
                testID={tag === null ? 'record-tag-filter-all' : `record-tag-filter-${tag}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setActiveRecordTag(tag)}
                hitSlop={6}
                style={styles.tagFilterItem}
              >
                <Text
                  style={[
                    TYPOGRAPHY.tag,
                    { color: active ? colors.accent : colors.textMuted },
                  ]}
                >
                  {tag ?? '全部'}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {/*
        The single mounted space. `data-space` is exposed as a testID so tests can
        assert which space is present without relying on styling.
      */}
      <Animated.View testID={`active-space-${currentSpace}`} style={[styles.body, contentStyle]}>
        {currentSpace === 'records' ? (
          <RecordSpace searchQuery={searchQuery} activeTag={activeRecordTag} />
        ) : null}
        {currentSpace === 'awareness' ? (
          awarenessHistoryOpen ? (
            <AwarenessHistoryView searchQuery={searchQuery} />
          ) : (
            <AwarenessSpace searchQuery={searchQuery} />
          )
        ) : null}
        {currentSpace === 'reflection' ? <UnderstandingSpace searchQuery={searchQuery} /> : null}
        {currentSpace === 'exploration' ? <ExplorationSpace searchQuery={searchQuery} /> : null}
        {currentSpace === SETTINGS_SPACE ? <SettingsSpace /> : null}
      </Animated.View>

      <View
        testID="tab-bar"
        style={[
          styles.tabBar,
          { borderTopColor: colors.dividerWeak, backgroundColor: colors.canvas },
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
    minHeight: 52,
    paddingHorizontal: SPACING.screen,
    paddingVertical: SPACING.header,
    borderBottomWidth: 1,
  },
  settingsEntry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.sm },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    flex: 1,
  },
  headerActionsSearch: { justifyContent: 'flex-start' },
  body: { flex: 1 },
  tagFilter: { borderBottomWidth: 1, flexGrow: 0 },
  tagFilterContent: {
    paddingHorizontal: SPACING.screen,
    paddingVertical: SPACING.sm,
    gap: SPACING.lg,
  },
  tagFilterItem: { minHeight: 32, justifyContent: 'center' },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingBottom: SPACING.bottomSafe,
    paddingTop: SPACING.sm,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  tabIndicator: { width: 14, height: 1, marginTop: SPACING.xs, transformOrigin: 'center' },
});
