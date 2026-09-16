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

import { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AwarenessSpace } from '../spaces/awareness-space';
import { ExplorationSpace } from '../spaces/exploration-space';
import { RecordSpace } from '../spaces/record-space';
import { SettingsSpace } from '../spaces/settings-space';
import { UnderstandingSpace } from '../spaces/understanding-space';
import {
  SETTINGS_SPACE,
  SPACE_LABELS,
  TAB_SPACES,
  type SpaceId,
} from './spaces';
import { useAwarenessUnreadCount } from './runtime-context';
import { useTheme } from '../theme/theme-context';
import { SPACING, TYPOGRAPHY } from '../theme/tokens';
import { LocalSearchControl } from './local-search';

export const AppShell = () => {
  const [activeSpace, setActiveSpace] = useState<SpaceId>('records');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const { theme } = useTheme();
  const { colors } = theme;
  const unreadAwareness = useAwarenessUnreadCount();

  // Settings is a separate entry: opening it switches the active space, and the
  // header button toggles back to the space the user came from.
  const currentSpace: SpaceId = settingsOpen ? SETTINGS_SPACE : activeSpace;

  const selectTab = (space: SpaceId) => {
    setSearchQuery('');
    setSearchOpen(false);
    setSettingsOpen(false);
    setActiveSpace(space);
  };

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
          onPress={() => setSettingsOpen((open) => !open)}
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
      <View testID={`active-space-${currentSpace}`} style={styles.body}>
        {currentSpace === 'records' ? <RecordSpace searchQuery={searchQuery} /> : null}
        {currentSpace === 'awareness' ? <AwarenessSpace searchQuery={searchQuery} /> : null}
        {currentSpace === 'reflection' ? <UnderstandingSpace searchQuery={searchQuery} /> : null}
        {currentSpace === 'exploration' ? <ExplorationSpace searchQuery={searchQuery} /> : null}
        {currentSpace === SETTINGS_SPACE ? <SettingsSpace /> : null}
      </View>

      <View
        testID="tab-bar"
        style={[
          styles.tabBar,
          { borderTopColor: colors.borderSubtle, backgroundColor: colors.surface },
        ]}
      >
        {TAB_SPACES.map((space) => {
          const active = !settingsOpen && space === activeSpace;
          return (
            <Pressable
              key={space}
              testID={`tab-${space}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={SPACE_LABELS[space]}
              onPress={() => selectTab(space)}
              style={styles.tab}
            >
              <Text
                style={[
                  TYPOGRAPHY.meta,
                  { color: active ? colors.accent : colors.textMuted },
                ]}
              >
                {SPACE_LABELS[space]}
                {space === 'awareness' && unreadAwareness > 0 ? ` (${unreadAwareness})` : ''}
              </Text>
            </Pressable>
          );
        })}
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
