/**
 * Record space — the user's own original expression, settled in time.
 *
 * DESIGN INTENT
 * The Record feed is an editorial time stream, not a column of cards. The
 * user's own text is the primary visual layer; time and tags are quiet
 * metadata. Card is not the default answer here, so a Record is separated by
 * whitespace and a hairline, and a surface only appears on interaction.
 *
 * SEMANTICS THAT MUST NOT DRIFT
 *   - The Record's own wording is never rewritten, summarised, or replaced.
 *   - Tags are user-authored metadata, index only. AI never adds permanent
 *     tags, and tags are not a person-level classification.
 *   - Saving a Record is local-first and never blocked by AI.
 *   - Reflection-origin Records stay out of the normal feed (enforced in the
 *     runtime's `listRecent`).
 *
 * STORAGE
 * Records still come from the Core SQLite read model. Tags live in a separate
 * user-authored key/value store (see runtime/record-tags-store.ts) so the
 * Mobile/Desktop SQLite schema stays byte-identical.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { DEPTH, RADIUS, SPACING, TYPOGRAPHY } from '../theme/tokens';
import type { RecordReadModel } from '../../../../packages/core/index';

type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'failed'; readonly failure: CaptureFailure };

interface DayGroup {
  readonly key: string;
  readonly label: string;
  readonly records: readonly RecordReadModel[];
}

const pad = (part: number) => String(part).padStart(2, '0');

/** `09:42` when today, `昨天 23:18` when yesterday, otherwise `9月15日 09:42`. */
const formatRecordTime = (value: Date, now: Date = new Date()): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const startOfDay = (input: Date) =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
  const dayDelta = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (dayDelta === 0) return clock;
  if (dayDelta === 1) return `昨天 ${clock}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
};

const formatRailTime = (value: Date, now: Date = new Date()): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const startOfDay = (input: Date) =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
  const dayDelta = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return dayDelta === 0 ? clock : `${date.getMonth() + 1}/${date.getDate()}`;
};

const formatDayMarker = (value: Date, now: Date = new Date()): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const startOfDay = (input: Date) =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
  const delta = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (delta === 0) return '今天';
  if (delta === 1) return '昨天';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

const dayKeyOf = (value: Date): string =>
  `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;

/** Quiet day headers: 今天 / 昨天 / 9月15日. No timeline rail. */
const dayLabelOf = (value: Date, now: Date = new Date()): string => {
  const startOfDay = (input: Date) =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
  const delta = Math.round((startOfDay(now) - startOfDay(value)) / 86_400_000);
  if (delta === 0) return '今天';
  if (delta === 1) return '昨天';
  return `${value.getMonth() + 1}月${value.getDate()}日`;
};

const groupByDay = (
  records: readonly RecordReadModel[],
  now: Date = new Date(),
): readonly DayGroup[] => {
  const groups: DayGroup[] = [];
  for (const record of records) {
    const date = new Date(record.capturedAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = dayKeyOf(date);
    const last = groups[groups.length - 1];
    if (last !== undefined && last.key === key) {
      (last.records as RecordReadModel[]).push(record);
      continue;
    }
    groups.push({ key, label: dayLabelOf(date, now), records: [record] });
  }
  return groups;
};

/**
 * B2 is only used as a focus capability: the newest visible Record is near,
 * the next few are mid, and older records recede. Nothing here changes the
 * Record's stored wording or order.
 */
const depthForIndex = (index: number): 'near' | 'mid' | 'far' => {
  if (index === 0) return 'near';
  if (index < 3) return 'mid';
  return 'far';
};

export const RecordSpace = ({
  searchQuery = '',
  activeTag = null,
}: {
  readonly searchQuery?: string;
  readonly activeTag?: string | null;
}) => {
  const runtime = useRuntime();
  const { theme } = useTheme();
  const { colors } = theme;

  const [draft, setDraft] = useState('');
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [records, setRecords] = useState<readonly RecordReadModel[]>([]);
  const [tagsByRecord, setTagsByRecord] = useState<Readonly<Record<string, readonly string[]>>>({});
  const [tagVocabulary, setTagVocabulary] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [next, tagState] = await Promise.all([
        runtime.listRecent(),
        runtime.recordTagState(),
      ]);
      setRecords(next);
      setTagsByRecord(tagState.byRecord);
      setTagVocabulary(tagState.tags);
    } finally {
      setLoading(false);
    }
  }, [runtime]);

  useEffect(() => {
    void refresh();
    const unsubscribe = runtime.subscribeRecordTags(() => void refresh());
    return unsubscribe;
  }, [refresh, runtime]);

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

  const tagsFor = useCallback(
    (recordId: string): readonly string[] => tagsByRecord[recordId] ?? [],
    [tagsByRecord],
  );

  const addTag = useCallback(
    async (recordId: string, name: string) => {
      await runtime.addRecordTag(recordId, name);
      await refresh();
    },
    [refresh, runtime],
  );

  const removeTag = useCallback(
    async (recordId: string, name: string) => {
      await runtime.removeRecordTag(recordId, name);
      await refresh();
    },
    [refresh, runtime],
  );

  const visibleRecords = useMemo(
    () =>
      records
        .filter((record) => matchesLocalQuery(searchQuery, [record.verbatim]))
        .filter((record) =>
          activeTag === null
            ? true
            : tagsFor(record.id).some(
                (tag) => tag.toLocaleLowerCase() === activeTag.toLocaleLowerCase(),
              ),
        ),
    [activeTag, records, searchQuery, tagsFor],
  );

  const groups = useMemo(() => groupByDay(visibleRecords), [visibleRecords]);
  const canSave = draft.trim().length > 0 && saveState.kind !== 'saving';
  const filtered = searchQuery.trim().length > 0 || activeTag !== null;

  let visibleIndex = -1;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.canvas }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        testID="space-records"
        style={[styles.root, { backgroundColor: colors.canvas }]}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.composer,
            {
              borderColor: colors.divider,
              backgroundColor: 'transparent',
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
            style={[styles.input, TYPOGRAPHY.record, { color: colors.textPrimary }]}
          />
          <View style={styles.actions}>
            <Pressable
              testID="record-save"
              accessibilityRole="button"
              accessibilityLabel="记下来"
              disabled={!canSave}
              onPress={save}
              style={[styles.saveButton, { opacity: canSave ? 1 : 0.5 }]}
              hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
            >
              {saveState.kind === 'saving' ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={[TYPOGRAPHY.action, { color: canSave ? colors.accent : colors.textMuted }]}>
                  记下来
                </Text>
              )}
            </Pressable>
            {saveState.kind === 'saved' ? (
              <Text
                testID="record-saved-message"
                style={[TYPOGRAPHY.caption, { color: colors.success }]}
              >
                {RECORD_SAVED_MESSAGE}
              </Text>
            ) : null}
            {saveState.kind === 'failed' ? (
              <Text testID="record-error" style={[TYPOGRAPHY.caption, { color: colors.danger }]}>
                {saveState.failure.message}
              </Text>
            ) : null}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : groups.length === 0 ? (
          <Text
            testID="record-empty"
            style={[TYPOGRAPHY.empty, { color: colors.textMuted, marginTop: SPACING.xl }]}
          >
            {filtered ? '没有找到相关内容。' : '写下一些此刻想留下的东西。'}
          </Text>
        ) : (
          <View testID="record-timeline" style={styles.timeline}>
            {groups.map((group) => (
              <View key={group.key} style={styles.group}>
                <View style={styles.dayRule}>
                  <Text style={[styles.dayLabel, { color: colors.textMuted }]}>
                    {group.label}
                  </Text>
                  <View style={[styles.dayLine, { backgroundColor: colors.dividerWeak }]} />
                </View>
                {group.records.map((record) => {
                  visibleIndex += 1;
                  const tags = tagsFor(record.id);
                  const open = openRecordId === record.id;
                  const depth = depthForIndex(visibleIndex);
                  const recede = depth === 'far' ? DEPTH.recedeOpacity : depth === 'mid' ? 0.92 : 1;
                  return (
                    <View
                      key={record.id}
                      testID={`record-item-${record.id}`}
                      style={[
                        styles.entry,
                        depth === 'far' && styles.entryFar,
                        open && styles.entryFocus,
                        open && styles.entryOpenSurface,
                        open && { borderLeftColor: colors.focusIndicator },
                        open && { backgroundColor: colors.nearSurface },
                      ]}
                    >
                      <View style={styles.rail}>
                        <Text style={[styles.recordTime, { color: colors.textFaint }]}>
                          {formatRailTime(record.capturedAt)}
                        </Text>
                        <View
                          style={[
                            styles.railMark,
                            { backgroundColor: open ? colors.accent : colors.divider },
                          ]}
                        />
                      </View>
                      <View style={styles.entryBody}>
                        <Pressable
                          testID={`record-toggle-${record.id}`}
                          accessibilityRole="button"
                          accessibilityLabel={open ? '收起记录' : '展开记录'}
                          onPress={() => setOpenRecordId(open ? null : record.id)}
                          style={styles.recordPressable}
                        >
                          <Text
                            style={[
                              styles.recordBody,
                              { color: depth === 'far' ? colors.textMuted : colors.textPrimary },
                              { opacity: recede },
                            ]}
                            numberOfLines={open ? undefined : 4}
                          >
                            {record.verbatim ?? ''}
                          </Text>
                          {open ? (
                            <Text style={[styles.fullTime, { color: colors.textFaint }]}>
                              {formatRecordTime(record.capturedAt)}
                            </Text>
                          ) : null}
                        </Pressable>

                        {tags.length > 0 ? (
                          <View style={styles.tagRow}>
                            {tags.map((tag) => (
                              <View
                                key={tag}
                                testID={`record-tag-${record.id}-${tag}`}
                                style={[
                                  styles.tag,
                                  {
                                    backgroundColor: colors.tagBackground,
                                    borderColor: colors.tagBorder,
                                  },
                                ]}
                              >
                                <Text style={[styles.tagText, { color: colors.tagText }]}>
                                  {tag}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : null}

                        {open ? (
                          <TagEditor
                            recordId={record.id}
                            tags={tags}
                            vocabulary={tagVocabulary}
                            onAdd={addTag}
                            onRemove={removeTag}
                          />
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const TagEditor = ({
  recordId,
  tags,
  vocabulary,
  onAdd,
  onRemove,
}: {
  readonly recordId: string;
  readonly tags: readonly string[];
  readonly vocabulary: readonly string[];
  readonly onAdd: (recordId: string, name: string) => Promise<void>;
  readonly onRemove: (recordId: string, name: string) => Promise<void>;
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const recents = vocabulary.filter(
    (tag) => !tags.some((current) => current.toLocaleLowerCase() === tag.toLocaleLowerCase()),
  );

  const submit = async () => {
    if (name.trim().length === 0) return;
    await onAdd(recordId, name);
    setName('');
    setAdding(false);
  };

  return (
    <View style={styles.tagEditor}>
      {tags.length > 0 ? (
        <View style={styles.tagRow}>
          {tags.map((tag) => (
            <Pressable
              key={tag}
              testID={`record-tag-remove-${recordId}-${tag}`}
              accessibilityRole="button"
              accessibilityLabel={`移除标签 ${tag}`}
              onPress={() => void onRemove(recordId, tag)}
              style={[
                styles.tag,
                { backgroundColor: colors.tagBackground, borderColor: colors.tagBorder },
              ]}
              hitSlop={6}
            >
              <Text style={[styles.tagText, { color: colors.tagText }]}>
                {tag} ×
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {adding ? (
        <View style={styles.tagAddRow}>
          <TextInput
            testID={`record-tag-input-${recordId}`}
            value={name}
            onChangeText={setName}
            placeholder="新建标签"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="新建标签"
            style={[
              styles.tagInput,
              { color: colors.textPrimary, borderColor: colors.divider },
            ]}
            onSubmitEditing={() => void submit()}
            autoFocus
          />
          <Pressable
            testID={`record-tag-confirm-${recordId}`}
            accessibilityRole="button"
            accessibilityLabel="保存标签"
            onPress={() => void submit()}
            hitSlop={8}
            style={styles.touchAction}
          >
            <Text style={[TYPOGRAPHY.action, { color: colors.accent }]}>保存</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          testID={`record-tag-add-${recordId}`}
          accessibilityRole="button"
          accessibilityLabel="添加标签"
          onPress={() => setAdding(true)}
          style={styles.tagAdd}
          hitSlop={8}
        >
          <Text style={[TYPOGRAPHY.caption, { color: colors.textMuted }]}>+ 添加标签</Text>
        </Pressable>
      )}

      {adding && recents.length > 0 ? (
        <View style={styles.tagRow}>
          {recents.slice(0, 8).map((tag) => (
            <Pressable
              key={tag}
              testID={`record-tag-recent-${recordId}-${tag}`}
              accessibilityRole="button"
              accessibilityLabel={`添加标签 ${tag}`}
              onPress={() => void onAdd(recordId, tag)}
              style={[
                styles.tag,
                { backgroundColor: 'transparent', borderColor: colors.tagBorder },
              ]}
              hitSlop={6}
            >
              <Text style={[styles.tagText, { color: colors.textMuted }]}>{tag}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.screen, paddingBottom: 96 },
  composer: {
    borderBottomWidth: 1,
    paddingTop: SPACING.sm,
  },
  input: { minHeight: 72, textAlignVertical: 'top', paddingVertical: SPACING.sm },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.md,
    marginTop: SPACING.sm,
    minHeight: 44,
  },
  saveButton: { minHeight: 44, justifyContent: 'center' },
  timeline: { marginTop: SPACING.section },
  group: { gap: 0 },
  dayRule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.section,
    marginBottom: SPACING.md,
  },
  dayLabel: { ...TYPOGRAPHY.caption },
  dayLine: { flex: 1, height: 1 },
  entry: {
    flexDirection: 'row',
    gap: SPACING.lg,
    paddingVertical: SPACING.item,
    paddingRight: SPACING.xs,
  },
  entryFar: { opacity: DEPTH.recedeOpacity },
  entryFocus: {
    marginLeft: -SPACING.sm,
    paddingLeft: SPACING.md,
    borderLeftWidth: 2,
    paddingVertical: SPACING.md,
  },
  entryOpenSurface: {
    borderTopRightRadius: RADIUS.sm,
    borderBottomRightRadius: RADIUS.sm,
  },
  rail: {
    width: 40,
    alignItems: 'flex-start',
    paddingTop: 3,
  },
  railMark: {
    width: 14,
    height: 1,
    marginTop: SPACING.xs,
  },
  recordTime: { ...TYPOGRAPHY.timestamp },
  entryBody: { flex: 1, minWidth: 0 },
  recordPressable: { gap: SPACING.xs },
  recordBody: { ...TYPOGRAPHY.record },
  fullTime: { ...TYPOGRAPHY.timestamp, marginTop: SPACING.xs },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  tag: {
    borderRadius: RADIUS.xs,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  tagText: { ...TYPOGRAPHY.tag },
  tagEditor: { marginTop: SPACING.sm },
  tagAdd: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  tagAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  tagInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    minHeight: 44,
    ...TYPOGRAPHY.body,
  },
  touchAction: { minHeight: 44, justifyContent: 'center' },
});
