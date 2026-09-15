/**
 * Awareness space — the user's automatic and manual observation inbox.
 *
 * The page has two entry paths:
 *   1. automatic checks create durable pending items after a quiet window
 *   2. the explicit "开始一次觉察" action still creates transient candidates
 *
 * Opening the tab never calls the Provider and never marks everything read.
 * Only opening one concrete bubble changes that item from pending to viewed.
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

import type { RecordReadModel } from '../../../../packages/core/index';
import type {
  AwarenessHistoryItem,
  CandidateDecisionResult,
  ObservationMeaning,
  RelationCandidateView,
  RelationSuggestionExperience,
} from '../runtime/awareness-session';
import { useRuntime } from '../shell/runtime-context';
import { useTheme } from '../theme/theme-context';
import { RADIUS, SPACING, TYPOGRAPHY } from '../theme/tokens';

type SuggestionState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'result'; readonly experience: RelationSuggestionExperience };

const formatCapturedAt = (value: Date | string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

const CHOICES: readonly [ObservationMeaning, string][] = [
  ['connected', '很接近'],
  ['different_understanding', '有一点像'],
  ['not_my_experience', '这不是我的体验'],
];

const AwarenessBubble = ({
  item,
  onOpen,
}: {
  readonly item: AwarenessHistoryItem;
  readonly onOpen: (item: AwarenessHistoryItem) => void;
}) => {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Pressable
      testID={`awareness-bubble-${item.candidateId}`}
      accessibilityRole="button"
      accessibilityLabel="新的觉察"
      onPress={() => onOpen(item)}
      style={[
        styles.bubble,
        {
          backgroundColor: colors.accentSoft,
          borderColor: colors.accent,
          borderRadius: RADIUS.lg,
        },
      ]}
    >
      <View style={styles.bubbleHead}>
        <Text style={[TYPOGRAPHY.eyebrow, { color: colors.accent }]}>新的觉察</Text>
        <View
          testID={`awareness-unread-${item.candidateId}`}
          style={[styles.dot, { backgroundColor: colors.danger }]}
        />
      </View>
      <Text style={[TYPOGRAPHY.lead, { color: colors.textPrimary, marginTop: SPACING.sm }]}>
        {item.candidate.observation}
      </Text>
      <Text style={[TYPOGRAPHY.meta, { color: colors.textMuted, marginTop: SPACING.sm }]}>
        {formatCapturedAt(item.createdAt)}
      </Text>
    </Pressable>
  );
};

const AwarenessDetail = ({
  item,
  onClose,
  onRespond,
}: {
  readonly item: AwarenessHistoryItem;
  readonly onClose: () => void;
  readonly onRespond: (
    item: AwarenessHistoryItem,
    meaning: ObservationMeaning,
    reflectionText: string,
  ) => Promise<CandidateDecisionResult>;
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const [meaning, setMeaning] = useState<ObservationMeaning | null>(item.meaning);
  const [reflectionText, setReflectionText] = useState(item.reflectionText ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CandidateDecisionResult | null>(null);

  const submit = async () => {
    if (meaning === null || submitting) return;
    if (meaning !== 'not_my_experience' && reflectionText.trim().length === 0) {
      setResult({
        status: 'reflection_required',
        message: '请先写下你的理解；快捷选择本身不会创建关系。',
      });
      return;
    }
    setSubmitting(true);
    try {
      setResult(await onRespond(item, meaning, reflectionText));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View
      testID={`awareness-detail-${item.candidateId}`}
      style={[
        styles.detail,
        {
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          borderRadius: RADIUS.md,
        },
      ]}
    >
      <Text style={[TYPOGRAPHY.eyebrow, { color: colors.accent }]}>觉察</Text>
      <Text style={[TYPOGRAPHY.lead, { color: colors.textPrimary, marginTop: SPACING.sm }]}>
        {item.candidate.observation}
      </Text>
      {item.candidate.reflectionQuestion === undefined ? null : (
        <Text style={[TYPOGRAPHY.body, { color: colors.textPrimary, marginTop: SPACING.sm }]}>
          可以继续想一想：{item.candidate.reflectionQuestion}
        </Text>
      )}

      <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textMuted, marginTop: SPACING.md }]}>
        相关记录
      </Text>
      {item.candidate.relatedRecords.map((record) => (
        <Text
          key={record.id}
          style={[TYPOGRAPHY.meta, { color: colors.textSecondary, marginTop: SPACING.xs }]}
        >
          · {record.verbatim}
        </Text>
      ))}
      {item.candidate.possibleExplanation === undefined ? null : (
        <Text style={[TYPOGRAPHY.meta, { color: colors.textSecondary, marginTop: SPACING.sm }]}>
          一种可能：{item.candidate.possibleExplanation}
        </Text>
      )}
      {item.candidate.uncertainty === undefined ? null : (
        <Text style={[TYPOGRAPHY.meta, { color: colors.textMuted, marginTop: SPACING.sm }]}>
          需要留意：{item.candidate.uncertainty}
        </Text>
      )}

      <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textMuted, marginTop: SPACING.md }]}>
        你的回应
      </Text>
      <View style={styles.choiceRow}>
        {CHOICES.map(([value, label]) => {
          const active = meaning === value;
          return (
            <Pressable
              key={value}
              testID={`awareness-choice-${item.candidateId}-${value}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setMeaning(value)}
              style={[
                styles.choice,
                {
                  backgroundColor: active ? colors.accentSoft : colors.canvas,
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
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {meaning !== null && meaning !== 'not_my_experience' ? (
        <TextInput
          testID={`awareness-reflection-${item.candidateId}`}
          value={reflectionText}
          onChangeText={setReflectionText}
          multiline
          placeholder="写下你自己的理解……"
          placeholderTextColor={colors.textMuted}
          style={[
            styles.reflectionInput,
            TYPOGRAPHY.body,
            {
              color: colors.textPrimary,
              backgroundColor: colors.sunken,
              borderColor: colors.borderSubtle,
              borderRadius: RADIUS.sm,
            },
          ]}
        />
      ) : null}

      <View style={styles.detailActions}>
        <Pressable
          testID={`awareness-submit-${item.candidateId}`}
          accessibilityRole="button"
          disabled={meaning === null || submitting}
          onPress={() => void submit()}
          style={[
            styles.secondaryButton,
            {
              backgroundColor: meaning === null ? colors.borderSubtle : colors.accentSoft,
              borderColor: colors.borderSubtle,
              borderRadius: RADIUS.sm,
            },
          ]}
        >
          <Text style={[TYPOGRAPHY.lead, { color: colors.textPrimary }]}>
            {submitting ? '正在保存……' : '确认我的回应'}
          </Text>
        </Pressable>
        <Pressable
          testID={`awareness-close-${item.candidateId}`}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.linkButton}
        >
          <Text style={[TYPOGRAPHY.meta, { color: colors.textSecondary }]}>收起</Text>
        </Pressable>
      </View>

      {result !== null && result.status !== 'idle' ? (
        <Text
          testID={`awareness-result-${item.candidateId}`}
          style={[TYPOGRAPHY.meta, { color: colors.textSecondary, marginTop: SPACING.sm }]}
        >
          {result.message}
        </Text>
      ) : null}
    </View>
  );
};

export const AwarenessSpace = () => {
  const runtime = useRuntime();
  const { theme } = useTheme();
  const { colors } = theme;

  const [records, setRecords] = useState<readonly RecordReadModel[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SuggestionState>({ kind: 'idle' });
  const [history, setHistory] = useState<readonly AwarenessHistoryItem[]>([]);
  const [openItem, setOpenItem] = useState<AwarenessHistoryItem | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshHistory = useCallback(async () => {
    const next = await runtime.awarenessHistory();
    setHistory(next);
    setOpenItem((current) => {
      if (current === null) return null;
      return next.find((item) => item.candidateId === current.candidateId) ?? null;
    });
  }, [runtime]);

  // Page open: read Records and the durable inbox only. No AI call here, and
  // entering the tab deliberately does not mark pending items as viewed.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [recent, storedHistory] = await Promise.all([
          runtime.listRecent(),
          runtime.awarenessHistory(),
        ]);
        if (cancelled) return;
        setRecords(recent);
        setSelectedRecordId((current) => current ?? recent[0]?.id ?? null);
        setHistory(storedHistory);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runtime]);

  const open = useCallback(
    async (item: AwarenessHistoryItem) => {
      const next = await runtime.markAwarenessViewed(item.candidateId);
      await refreshHistory();
      setOpenItem(
        next.find((candidate) => candidate.candidateId === item.candidateId) ??
          item,
      );
    },
    [refreshHistory, runtime],
  );

  const start = useCallback(async () => {
    if (selectedRecordId === null) return;
    setSuggestion({ kind: 'loading' });
    const experience = await runtime.suggestRelations(selectedRecordId);
    setSuggestion({ kind: 'result', experience });
    await refreshHistory();
  }, [refreshHistory, runtime, selectedRecordId]);

  const submit = useCallback(
    async (
      item: AwarenessHistoryItem,
      meaning: ObservationMeaning,
      reflectionText: string,
    ) => {
      const result = await runtime.submitObservationReflection({
        candidateId: item.candidateId,
        meaning,
        ...(reflectionText.length === 0 ? {} : { reflectionText }),
      });
      await refreshHistory();
      return result;
    },
    [refreshHistory, runtime],
  );

  const result =
    suggestion.kind === 'result' && suggestion.experience.status === 'candidates'
      ? suggestion.experience
      : null;
  const inbox = history.filter((item) => item.status !== 'dismissed');
  const manualCandidates =
    result?.candidates.filter(
      (candidate) => !history.some((item) => item.candidateId === candidate.candidateId),
    ) ?? [];
  const openManualCandidate = (candidate: RelationCandidateView): AwarenessHistoryItem => ({
    candidateId: candidate.candidateId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentRecordId: candidate.currentRecord.id,
    suggestion: candidate.suggestion,
    candidate,
    meaning: null,
    reflectionText: null,
    targetRef: null,
    reflectionRecordId: null,
  });

  return (
    <ScrollView
      testID="space-awareness"
      style={[styles.root, { backgroundColor: colors.canvas }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[TYPOGRAPHY.title, { color: colors.textPrimary }]}>觉察</Text>
      <Text style={[TYPOGRAPHY.body, { color: colors.textSecondary, lineHeight: 24 }]}>
        这里保存 AI 在你允许后准备好的观察。只有你打开具体气泡，它才会变为已查看。
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textMuted }]}>新的觉察</Text>
            <Text testID="awareness-inbox-count" style={[TYPOGRAPHY.meta, { color: colors.textMuted }]}>
              未读 {history.filter((item) => item.status === 'pending').length}
            </Text>
          </View>
          {inbox.length === 0 ? (
            <Text testID="awareness-empty" style={[TYPOGRAPHY.body, { color: colors.textMuted }]}>
              还没有可以察觉的内容。开启自动觉察并继续记录后，值得回看的内容会安静地留在这里。
            </Text>
          ) : (
            inbox.map((item) => (
              <AwarenessBubble key={item.candidateId} item={item} onOpen={open} />
            ))
          )}

          {openItem !== null ? (
            <AwarenessDetail item={openItem} onClose={() => setOpenItem(null)} onRespond={submit} />
          ) : null}

          <View style={styles.divider} />

          <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textMuted }]}>开始一次觉察</Text>
          <Text style={[TYPOGRAPHY.meta, { color: colors.textSecondary, lineHeight: 22 }]}>
            选择一条记录，由你主动发起检查。手动检查不受自动静默窗口影响。
          </Text>
          {records.length === 0 ? (
            <Text style={[TYPOGRAPHY.body, { color: colors.textMuted }]}>
              先在“记录”里写下一句话。
            </Text>
          ) : (
            <>
              <View style={styles.recordList}>
                {records.slice(0, 5).map((record) => {
                  const active = record.id === selectedRecordId;
                  return (
                    <Pressable
                      key={record.id}
                      testID={`awareness-record-${record.id}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        setSelectedRecordId(record.id);
                        setSuggestion({ kind: 'idle' });
                      }}
                      style={[
                        styles.recordItem,
                        {
                          backgroundColor: active ? colors.accentSoft : colors.surface,
                          borderColor: active ? colors.accent : colors.borderSubtle,
                          borderRadius: RADIUS.md,
                        },
                      ]}
                    >
                      <Text style={[TYPOGRAPHY.meta, { color: colors.textMuted }]}>
                        {formatCapturedAt(record.capturedAt)}
                      </Text>
                      <Text style={[TYPOGRAPHY.body, { color: colors.textPrimary, lineHeight: 24 }]}>
                        {record.verbatim ?? ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                testID="awareness-start"
                accessibilityRole="button"
                disabled={selectedRecordId === null || suggestion.kind === 'loading'}
                onPress={() => void start()}
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor:
                      selectedRecordId === null || suggestion.kind === 'loading'
                        ? colors.borderSubtle
                        : colors.accentCta,
                    borderRadius: RADIUS.sm,
                  },
                ]}
              >
                {suggestion.kind === 'loading' ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text
                    style={[
                      TYPOGRAPHY.lead,
                      {
                        color:
                          selectedRecordId === null ? colors.textMuted : colors.onAccent,
                      },
                    ]}
                  >
                    开始一次觉察
                  </Text>
                )}
              </Pressable>

              {suggestion.kind === 'result' && suggestion.experience.status !== 'candidates' ? (
                <Text testID="awareness-status" style={[TYPOGRAPHY.body, { color: colors.textSecondary }]}>
                  {suggestion.experience.message}
                </Text>
              ) : null}

              {manualCandidates.map((candidate) => (
                <Pressable
                  key={candidate.candidateId}
                  testID={`awareness-manual-${candidate.candidateId}`}
                  onPress={() => setOpenItem(openManualCandidate(candidate))}
                  style={[
                    styles.bubble,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.borderSubtle,
                      borderRadius: RADIUS.lg,
                    },
                  ]}
                >
                  <Text style={[TYPOGRAPHY.eyebrow, { color: colors.accent }]}>手动觉察</Text>
                  <Text style={[TYPOGRAPHY.lead, { color: colors.textPrimary, marginTop: SPACING.sm }]}>
                    {candidate.observation}
                  </Text>
                </Pressable>
              ))}
            </>
          )}

          <View style={styles.divider} />
          <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textMuted }]}>历史觉察</Text>
          {history.filter((item) => item.status !== 'pending').length === 0 ? (
            <Text testID="awareness-history-empty" style={[TYPOGRAPHY.meta, { color: colors.textMuted }]}>
              查看过的觉察会留在这里。
            </Text>
          ) : (
            history
              .filter((item) => item.status !== 'pending')
              .map((item) => (
                <Pressable
                  key={item.candidateId}
                  testID={`awareness-history-${item.candidateId}`}
                  onPress={() => void open(item)}
                  style={[
                    styles.historyCard,
                    {
                      backgroundColor: colors.sunken,
                      borderColor: colors.borderSubtle,
                      borderRadius: RADIUS.md,
                    },
                  ]}
                >
                  <View style={styles.historyHead}>
                    <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textMuted }]}>历史觉察</Text>
                    <Text style={[TYPOGRAPHY.meta, { color: colors.textMuted }]}>
                      {item.status === 'reflected'
                        ? '已回应'
                        : item.status === 'dismissed'
                          ? '已放下'
                          : '已查看'}
                    </Text>
                  </View>
                  <Text style={[TYPOGRAPHY.body, { color: colors.textPrimary, marginTop: SPACING.xs }]}>
                    {item.candidate.observation}
                  </Text>
                </Pressable>
              ))
          )}
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recordList: { gap: SPACING.sm },
  recordItem: { borderWidth: 1, padding: SPACING.md, gap: SPACING.xs },
  primaryButton: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  bubble: {
    borderWidth: 1,
    padding: SPACING.lg,
    minHeight: 132,
    justifyContent: 'center',
  },
  bubbleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dot: { width: 9, height: 9, borderRadius: 999 },
  detail: { borderWidth: 1, padding: SPACING.md },
  choiceRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  choice: { flex: 1, borderWidth: 1, paddingVertical: SPACING.sm, alignItems: 'center' },
  reflectionInput: {
    minHeight: 88,
    borderWidth: 1,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
    textAlignVertical: 'top',
  },
  detailActions: { flexDirection: 'row', gap: SPACING.md, alignItems: 'center', marginTop: SPACING.md },
  linkButton: { paddingVertical: SPACING.sm },
  divider: { height: 1, backgroundColor: 'transparent', marginVertical: SPACING.sm },
  historyCard: { borderWidth: 1, padding: SPACING.md },
  historyHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
