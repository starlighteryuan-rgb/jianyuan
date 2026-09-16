/**
 * Record space — the only space with a working write path in M1.
 *
 * BEHAVIOUR
 *   input → save → Record persisted in the app-sandbox SQLite file → timeline
 *   refreshed from storage.
 *
 * The timeline is always re-read from the runtime rather than appended to in
 * memory, so what is on screen is what is actually stored. That is what makes the
 * close-and-reopen guarantee visible rather than assumed.
 *
 * The acknowledgement shown on success is `RECORD_SAVED_MESSAGE`, defined once in
 * the runtime so every save path uses the same words.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useRuntime } from '../shell/runtime-context';
import { matchesLocalQuery } from '../shell/local-search';
import { RECORD_SAVED_MESSAGE, type CaptureFailure } from '../runtime/mobile-runtime';
import { useTheme } from '../theme/theme-context';
import { RADIUS, SPACING, TYPOGRAPHY } from '../theme/tokens';
import type { RecordReadModel } from '../../../../packages/core/index';

type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'failed'; readonly failure: CaptureFailure };

const formatCapturedAt = (value: Date): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

export const RecordSpace = ({ searchQuery = '' }: { readonly searchQuery?: string }) => {
  const runtime = useRuntime();
  const { theme } = useTheme();
  const { colors } = theme;

  const [draft, setDraft] = useState('');
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [records, setRecords] = useState<readonly RecordReadModel[]>([]);
  const [loading, setLoading] = useState(true);

  const visibleRecords = records.filter((record) =>
    matchesLocalQuery(searchQuery, [record.verbatim]),
  );

  const refresh = useCallback(async () => {
    try {
      setRecords(await runtime.listRecent());
    } finally {
      setLoading(false);
    }
  }, [runtime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async () => {
    setSaveState({ kind: 'saving' });
    const result = await runtime.capture(draft);
    if (result.ok) {
      // Clear the input only after the write succeeded, so a failed save never
      // discards what the user wrote.
      setDraft('');
      setSaveState({ kind: 'saved' });
      await refresh();
      return;
    }
    setSaveState({ kind: 'failed', failure: result.failure });
  }, [draft, refresh, runtime]);

  const canSave = draft.trim().length > 0 && saveState.kind !== 'saving';

  return (
    <KeyboardAvoidingView
      testID="space-records"
      style={[styles.root, { backgroundColor: colors.canvas }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.well,
            {
              backgroundColor: colors.sunken,
              borderColor: colors.borderSubtle,
              borderRadius: RADIUS.md,
            },
          ]}
        >
          <TextInput
            testID="record-input"
            value={draft}
            onChangeText={setDraft}
            multiline
            placeholder="写下此刻的一句话……"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="记录输入"
            style={[styles.input, TYPOGRAPHY.body, { color: colors.textPrimary }]}
          />
        </View>

        <View style={styles.actions}>
          <Pressable
            testID="record-save"
            accessibilityRole="button"
            accessibilityLabel="记下来"
            disabled={!canSave}
            onPress={save}
            style={[
              styles.saveButton,
              {
                backgroundColor: canSave ? colors.accentCta : colors.borderSubtle,
                borderRadius: RADIUS.sm,
              },
            ]}
          >
            {saveState.kind === 'saving' ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={[TYPOGRAPHY.lead, { color: canSave ? colors.onAccent : colors.textMuted }]}>
                记下来
              </Text>
            )}
          </Pressable>

          {saveState.kind === 'saved' ? (
            <Text testID="record-saved-message" style={[TYPOGRAPHY.body, { color: colors.success }]}>
              {RECORD_SAVED_MESSAGE}
            </Text>
          ) : null}

          {saveState.kind === 'failed' ? (
            <Text testID="record-error" style={[TYPOGRAPHY.meta, { color: colors.danger }]}>
              {saveState.failure.message}
            </Text>
          ) : null}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.borderHair }]} />

        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <FlatList
            testID="record-timeline"
            data={visibleRecords}
            scrollEnabled={false}
            keyExtractor={(item) => (item as RecordReadModel).id}
            ListEmptyComponent={
              <Text
                testID="record-empty"
                style={[TYPOGRAPHY.body, { color: colors.textMuted, lineHeight: 26 }]}
              >
                {searchQuery.trim().length > 0 ? '没有找到相关内容' : '还没有记录。写下此刻的一句话，它会留在这里。'}
              </Text>
            }
            renderItem={({ item }) => {
              const record = item as RecordReadModel;
              return (
                <View
                  testID={`record-item-${record.id}`}
                  style={[
                    styles.recordItem,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.borderHair,
                      borderRadius: RADIUS.md,
                    },
                  ]}
                >
                  <Text style={[TYPOGRAPHY.meta, { color: colors.textMuted }]}>
                    {formatCapturedAt(record.capturedAt)}
                  </Text>
                  <Text
                    style={[
                      TYPOGRAPHY.body,
                      { color: colors.textPrimary, lineHeight: 26, marginTop: SPACING.xs },
                    ]}
                  >
                    {record.verbatim ?? ''}
                  </Text>
                </View>
              );
            }}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  well: { borderWidth: 1, padding: SPACING.md, minHeight: 132 },
  input: { minHeight: 108, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  saveButton: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: 1, marginVertical: SPACING.xs },
  recordItem: { borderWidth: 1, padding: SPACING.md, marginBottom: SPACING.sm },
});
