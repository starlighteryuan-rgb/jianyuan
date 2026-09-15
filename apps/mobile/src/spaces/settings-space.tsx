/**
 * Settings space — a separate entry, deliberately not a Bottom Tab.
 *
 * Reports real runtime state: where the database lives, which schema version it
 * is on, whether the Keychain is usable, and which appearance preference is in
 * effect. It never shows a key value, only availability.
 *
 * The appearance control writes to the presentation-layer theme store. That
 * preference is not a claim about the user, so it is not written to Core or to
 * the SQLite database — which is exactly why it is safe for the UI to own it.
 */

import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';

import { useRuntime } from '../shell/runtime-context';
import { useTheme } from '../theme/theme-context';
import {
  THEME_PREFERENCES,
  THEME_PREFERENCE_LABELS,
  type ThemePreference,
} from '../theme/theme-preference';
import { RADIUS, SPACING, TYPOGRAPHY } from '../theme/tokens';

export const SettingsSpace = () => {
  const runtime = useRuntime();
  const { theme, preference, setPreference } = useTheme();
  const { colors } = theme;
  const status = runtime.status();

  const rows: readonly { readonly label: string; readonly value: string }[] = [
    { label: '数据库位置', value: status.databaseLocation },
    { label: '数据结构版本', value: String(status.schemaVersion) },
    {
      label: '钥匙串',
      value: status.secretStore.status === 'available' ? '可用' : '不可用',
    },
    { label: 'AI 提供方', value: status.ai.enabled ? status.ai.providerId : '未启用' },
  ];

  return (
    <ScrollView
      testID="space-settings"
      style={[styles.root, { backgroundColor: colors.canvas }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[TYPOGRAPHY.title, { color: colors.textPrimary }]}>设置</Text>

      <View style={styles.section}>
        <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textMuted }]}>外观</Text>
        <View style={styles.segmented}>
          {THEME_PREFERENCES.map((option: ThemePreference) => {
            const active = option === preference;
            return (
              <Pressable
                key={option}
                testID={`theme-option-${option}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setPreference(option)}
                style={[
                  styles.segment,
                  {
                    backgroundColor: active ? colors.accentSoft : colors.surface,
                    borderColor: active ? colors.accent : colors.borderSubtle,
                    borderRadius: RADIUS.sm,
                  },
                ]}
              >
                <Text
                  style={[
                    TYPOGRAPHY.meta,
                    { color: active ? colors.accent : colors.textSecondary },
                  ]}
                >
                  {THEME_PREFERENCE_LABELS[option]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textMuted }]}>运行状态</Text>
        {rows.map((row) => (
          <View key={row.label} style={[styles.row, { borderBottomColor: colors.borderHair }]}>
            <Text style={[TYPOGRAPHY.meta, { color: colors.textSecondary }]}>{row.label}</Text>
            <Text
              testID={`setting-${row.label}`}
              style={[TYPOGRAPHY.meta, { color: colors.textPrimary, flexShrink: 1 }]}
            >
              {row.value}
            </Text>
          </View>
        ))}
      </View>

      {status.secretStore.status === 'unavailable' ? (
        <Text
          testID="secret-store-degraded"
          style={[TYPOGRAPHY.meta, { color: colors.textMuted, lineHeight: 22 }]}
        >
          当前构建无法访问系统钥匙串，因此暂时不能保存 AI 密钥。记录功能不受影响。
        </Text>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  section: { gap: SPACING.sm },
  segmented: { flexDirection: 'row', gap: SPACING.sm },
  segment: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
});
