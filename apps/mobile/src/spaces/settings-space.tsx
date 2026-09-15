/**
 * Settings space — functional, deliberately plain.
 *
 * This is the M2 settings surface, not the final visual design. It covers:
 *   - AI Provider / Base URL / API Key / Model / connection test
 *   - Directive / usage rules
 *   - Appearance
 *   - Export / Restore
 *   - Mobile runtime diagnostics
 *
 * BOUNDARIES
 * The API key is passed only to `MobileRuntime.configureAI`, which sends it to
 * `expo-secure-store`. It is never written to SQLite and never rendered back.
 * Export / restore calls the backup adapter, which owns file-system and share
 * sheet details; the page only sees a serialized logical backup.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Directive } from '../../../../packages/core/index';
import type { MobileBackupAdapter } from '../runtime/backup-adapter';
import { useRuntime } from '../shell/runtime-context';
import { useTheme } from '../theme/theme-context';
import {
  THEME_PREFERENCES,
  THEME_PREFERENCE_LABELS,
  type ThemePreference,
} from '../theme/theme-preference';
import { RADIUS, SPACING, TYPOGRAPHY } from '../theme/tokens';

type OperationState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'working'; readonly label: string }
  | { readonly kind: 'message'; readonly message: string; readonly danger?: boolean };

const directiveScopeLabel = (directive: Directive): string =>
  directive.scope === null
    ? '全局 / 已存在资料'
    : `${directive.scope.kind}: ${directive.scope.value}`;

/**
 * Load the file-system adapter only when the user taps Export or Restore.
 * Static imports of expo-file-system / expo-document-picker / expo-sharing
 * pull native modules into the Node component-test graph, where `__DEV__`
 * does not exist. Lazy loading keeps the page testable and mirrors how the
 * Keychain binding is isolated behind its own module.
 */
const loadBackupAdapter = async (): Promise<MobileBackupAdapter> => {
  const module = await import('../runtime/backup-adapter');
  return module.createMobileBackupAdapter();
};

export const SettingsSpace = () => {
  const runtime = useRuntime();
  const { theme, preference, setPreference } = useTheme();
  const { colors } = theme;

  const [status, setStatus] = useState(() => runtime.status());
  const [providerId, setProviderId] = useState(status.ai.providerId);
  const [baseUrl, setBaseUrl] = useState(status.ai.baseUrl);
  const [model, setModel] = useState(status.ai.model);
  const [apiKey, setApiKey] = useState('');
  const [directives, setDirectives] = useState<readonly Directive[]>([]);
  const [operation, setOperation] = useState<OperationState>({ kind: 'idle' });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [nextDirectives] = await Promise.all([runtime.listDirectives()]);
    setDirectives(nextDirectives);
    setStatus(runtime.status());
  }, [runtime]);

  useEffect(() => {
    void (async () => {
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const saveAI = useCallback(async () => {
    setOperation({ kind: 'working', label: '保存 AI 配置' });
    try {
      const snapshot = await runtime.configureAI({
        providerId,
        baseUrl,
        model,
        apiKey,
      });
      setApiKey('');
      setStatus(runtime.status());
      setOperation({ kind: 'message', message: snapshot.message });
    } catch (error) {
      setOperation({
        kind: 'message',
        danger: true,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [apiKey, baseUrl, model, providerId, runtime]);

  const testConnection = useCallback(async () => {
    setOperation({ kind: 'working', label: '验证连接' });
    try {
      const snapshot = await runtime.testAIConnection();
      setStatus(runtime.status());
      setOperation({ kind: 'message', message: snapshot.message });
    } catch (error) {
      setOperation({
        kind: 'message',
        danger: true,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [runtime]);

  const discoverModels = useCallback(async () => {
    setOperation({ kind: 'working', label: '获取模型' });
    try {
      const snapshot = await runtime.discoverModels(true);
      setStatus(runtime.status());
      setOperation({
        kind: 'message',
        message:
          snapshot.models.length === 0
            ? snapshot.message
            : `发现 ${snapshot.models.length} 个模型，请在下方选择。`,
      });
    } catch (error) {
      setOperation({
        kind: 'message',
        danger: true,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [runtime]);

  const exportData = useCallback(async () => {
    setOperation({ kind: 'working', label: '导出数据' });
    try {
      const serialized = await runtime.exportData();
      const backup = await loadBackupAdapter();
      const result = await backup.exportToFile(serialized);
      setOperation({
        kind: 'message',
        danger: !result.ok,
        message: result.ok ? '备份文件已生成。' : result.message,
      });
    } catch (error) {
      setOperation({
        kind: 'message',
        danger: true,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [runtime]);

  const restoreData = useCallback(async () => {
    setOperation({ kind: 'working', label: '恢复数据' });
    try {
      const backup = await loadBackupAdapter();
      const picked = await backup.pickAndRead();
      if (!picked.ok) {
        setOperation({
          kind: 'message',
          danger: !picked.cancelled,
          message: picked.message,
        });
        return;
      }
      await runtime.restoreData(picked.serialized);
      await refresh();
      setOperation({
        kind: 'message',
        message: `已从 ${picked.name} 恢复本地数据。`,
      });
    } catch (error) {
      setOperation({
        kind: 'message',
        danger: true,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [refresh, runtime]);

  const createDirective = useCallback(
    async (input: {
      readonly allowAnalysis: boolean;
      readonly allowPassivePresentation: boolean;
    }) => {
      setOperation({ kind: 'working', label: '保存使用规则' });
      try {
        await runtime.createDirective({
          allowAnalysis: input.allowAnalysis,
          allowStorage: true,
          allowPassivePresentation: input.allowPassivePresentation,
          allowProactivePresentation: false,
          appliesToFutureSimilar: false,
          scopeKind: null,
          scopeValue: '',
        });
        await refresh();
        setOperation({ kind: 'message', message: '使用规则已保存。' });
      } catch (error) {
        setOperation({
          kind: 'message',
          danger: true,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [refresh, runtime],
  );

  const revokeDirective = useCallback(
    async (id: string) => {
      setOperation({ kind: 'working', label: '撤销使用规则' });
      try {
        await runtime.revokeDirective(id);
        await refresh();
        setOperation({ kind: 'message', message: '使用规则已撤销。' });
      } catch (error) {
        setOperation({
          kind: 'message',
          danger: true,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [refresh, runtime],
  );

  const rows: readonly { readonly label: string; readonly value: string }[] = [
    { label: '数据库位置', value: status.databaseLocation },
    { label: '数据结构版本', value: String(status.schemaVersion) },
    {
      label: '钥匙串',
      value: status.secretStore.status === 'available' ? '可用' : '不可用',
    },
    {
      label: 'AI 服务',
      value: status.ai.enabled ? status.ai.providerId : '未启用',
    },
    { label: '连接状态', value: status.ai.connectionStatus },
    { label: '模型数量', value: String(status.ai.modelCount) },
    { label: '应用版本', value: '0.2.0' },
  ];

  return (
    <ScrollView
      testID="space-settings"
      style={[styles.root, { backgroundColor: colors.canvas }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[TYPOGRAPHY.title, { color: colors.textPrimary }]}>设置</Text>

      <View style={styles.section}>
        <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textMuted }]}>AI 服务</Text>
        <TextInput
          testID="ai-provider-id"
          value={providerId}
          onChangeText={setProviderId}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="openai-compatible"
          placeholderTextColor={colors.textMuted}
          style={[
            styles.input,
            TYPOGRAPHY.body,
            {
              color: colors.textPrimary,
              backgroundColor: colors.sunken,
              borderColor: colors.borderSubtle,
              borderRadius: RADIUS.sm,
            },
          ]}
        />
        <TextInput
          testID="ai-base-url"
          value={baseUrl}
          onChangeText={setBaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://api.example.com/v1"
          placeholderTextColor={colors.textMuted}
          style={[
            styles.input,
            TYPOGRAPHY.body,
            {
              color: colors.textPrimary,
              backgroundColor: colors.sunken,
              borderColor: colors.borderSubtle,
              borderRadius: RADIUS.sm,
            },
          ]}
        />
        <TextInput
          testID="ai-api-key"
          value={apiKey}
          onChangeText={setApiKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder={status.ai.apiKeyConfigured ? '已保存密钥，留空表示不修改' : 'API Key'}
          placeholderTextColor={colors.textMuted}
          style={[
            styles.input,
            TYPOGRAPHY.body,
            {
              color: colors.textPrimary,
              backgroundColor: colors.sunken,
              borderColor: colors.borderSubtle,
              borderRadius: RADIUS.sm,
            },
          ]}
        />
        <TextInput
          testID="ai-model"
          value={model}
          onChangeText={setModel}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="模型标识"
          placeholderTextColor={colors.textMuted}
          style={[
            styles.input,
            TYPOGRAPHY.body,
            {
              color: colors.textPrimary,
              backgroundColor: colors.sunken,
              borderColor: colors.borderSubtle,
              borderRadius: RADIUS.sm,
            },
          ]}
        />

        <View style={styles.buttonRow}>
          <Pressable
            testID="ai-save"
            accessibilityRole="button"
            onPress={() => void saveAI()}
            style={[styles.button, { backgroundColor: colors.accentCta, borderRadius: RADIUS.sm }]}
          >
            <Text style={[TYPOGRAPHY.meta, { color: colors.onAccent }]}>保存</Text>
          </Pressable>
          <Pressable
            testID="ai-test"
            accessibilityRole="button"
            onPress={() => void testConnection()}
            style={[styles.button, { backgroundColor: colors.accentSoft, borderRadius: RADIUS.sm }]}
          >
            <Text style={[TYPOGRAPHY.meta, { color: colors.textPrimary }]}>验证连接</Text>
          </Pressable>
          <Pressable
            testID="ai-discover"
            accessibilityRole="button"
            onPress={() => void discoverModels()}
            style={[styles.button, { backgroundColor: colors.accentSoft, borderRadius: RADIUS.sm }]}
          >
            <Text style={[TYPOGRAPHY.meta, { color: colors.textPrimary }]}>获取模型</Text>
          </Pressable>
        </View>

        {status.ai.models.length > 0 ? (
          <View testID="ai-models" style={styles.modelList}>
            {status.ai.models.map((item) => (
              <Pressable
                key={item.id}
                testID={`ai-model-${item.id}`}
                accessibilityRole="button"
                onPress={() => {
                  void runtime.selectModel(item.id).then(() => {
                    setModel(item.id);
                    setStatus(runtime.status());
                  });
                }}
                style={[
                  styles.modelItem,
                  {
                    backgroundColor: item.id === status.ai.model ? colors.accentSoft : colors.surface,
                    borderColor: colors.borderSubtle,
                    borderRadius: RADIUS.sm,
                  },
                ]}
              >
                <Text style={[TYPOGRAPHY.meta, { color: colors.textPrimary }]}>
                  {item.displayName ?? item.id}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {status.secretStore.status === 'unavailable' ? (
          <Text
            testID="secret-store-degraded"
            style={[TYPOGRAPHY.meta, { color: colors.textMuted, lineHeight: 22 }]}
          >
            当前构建无法访问系统钥匙串，因此暂时不能保存 AI 密钥。记录功能不受影响。
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textMuted }]}>使用规则</Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : directives.length === 0 ? (
          <Text testID="directive-empty" style={[TYPOGRAPHY.meta, { color: colors.textMuted }]}>
            当前没有主动添加的规则。系统使用默认权限边界。
          </Text>
        ) : (
          directives.map((directive) => (
            <View
              key={directive.id}
              testID={`directive-${directive.id}`}
              style={[
                styles.directive,
                { borderColor: colors.borderSubtle, borderRadius: RADIUS.sm },
              ]}
            >
              <Text style={[TYPOGRAPHY.meta, { color: colors.textSecondary }]}>
                {directiveScopeLabel(directive)}
              </Text>
              <Text style={[TYPOGRAPHY.meta, { color: colors.textPrimary }]}>
                允许 AI 回看：{directive.allowAnalysis ? '是' : '否'} · 查看时呈现：
                {directive.allowPassivePresentation ? '是' : '否'}
              </Text>
              <Pressable
                testID={`directive-revoke-${directive.id}`}
                accessibilityRole="button"
                onPress={() => void revokeDirective(directive.id)}
                style={[styles.linkButton, { borderColor: colors.borderSubtle, borderRadius: RADIUS.sm }]}
              >
                <Text style={[TYPOGRAPHY.meta, { color: colors.danger }]}>撤销</Text>
              </Pressable>
            </View>
          ))
        )}

        <View style={styles.buttonRow}>
          <Pressable
            testID="directive-allow"
            accessibilityRole="button"
            onPress={() =>
              void createDirective({ allowAnalysis: true, allowPassivePresentation: true })
            }
            style={[styles.button, { backgroundColor: colors.accentSoft, borderRadius: RADIUS.sm }]}
          >
            <Text style={[TYPOGRAPHY.meta, { color: colors.textPrimary }]}>允许 AI 回看</Text>
          </Pressable>
          <Pressable
            testID="directive-deny"
            accessibilityRole="button"
            onPress={() =>
              void createDirective({ allowAnalysis: false, allowPassivePresentation: false })
            }
            style={[styles.button, { backgroundColor: colors.accentSoft, borderRadius: RADIUS.sm }]}
          >
            <Text style={[TYPOGRAPHY.meta, { color: colors.textPrimary }]}>不允许 AI 回看</Text>
          </Pressable>
        </View>
      </View>

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
        <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textMuted }]}>数据</Text>
        <View style={styles.buttonRow}>
          <Pressable
            testID="data-export"
            accessibilityRole="button"
            onPress={() => void exportData()}
            style={[styles.button, { backgroundColor: colors.accentSoft, borderRadius: RADIUS.sm }]}
          >
            <Text style={[TYPOGRAPHY.meta, { color: colors.textPrimary }]}>导出备份</Text>
          </Pressable>
          <Pressable
            testID="data-restore"
            accessibilityRole="button"
            onPress={() => void restoreData()}
            style={[styles.button, { backgroundColor: colors.accentSoft, borderRadius: RADIUS.sm }]}
          >
            <Text style={[TYPOGRAPHY.meta, { color: colors.textPrimary }]}>从文件恢复</Text>
          </Pressable>
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

      {operation.kind === 'working' ? (
        <View style={styles.operation}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[TYPOGRAPHY.meta, { color: colors.textSecondary }]}>
            {operation.label}…
          </Text>
        </View>
      ) : null}
      {operation.kind === 'message' ? (
        <Text
          testID="settings-message"
          style={[
            TYPOGRAPHY.meta,
            { color: operation.danger ? colors.danger : colors.textSecondary, lineHeight: 22 },
          ]}
        >
          {operation.message}
        </Text>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  section: { gap: SPACING.sm },
  input: {
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    minHeight: 44,
  },
  buttonRow: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  button: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkButton: { borderWidth: 1, paddingVertical: SPACING.xs, alignItems: 'center' },
  segmented: { flexDirection: 'row', gap: SPACING.sm },
  segment: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  modelList: { gap: SPACING.xs },
  modelItem: { borderWidth: 1, padding: SPACING.sm },
  directive: { borderWidth: 1, padding: SPACING.sm, gap: SPACING.xs },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  operation: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
});
