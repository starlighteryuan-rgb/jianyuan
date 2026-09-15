/**
 * Awareness space — explicit, user-initiated AI observation.
 *
 * The page shows two things:
 *   1. a transient result from the current explicit request
 *   2. durable Awareness history that survives leaving the page and restarting
 *
 * Opening the tab never calls the Provider. The AI call happens only in the
 * press handler, which is the one user action the product authorises.
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

const AwarenessCandidateCard = ({
  candidate,
  initialMeaning = null,
  initialReflectionText = '',
  onSubmit,
}: {
  readonly candidate: RelationCandidateView;
  readonly initialMeaning?: ObservationMeaning | null;
  readonly initialReflectionText?: string;
  readonly onSubmit: (
    candidate: RelationCandidateView,
    meaning: ObservationMeaning,
    reflectionText: string,
  ) => Promise<CandidateDecisionResult>;
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const [meaning, setMeaning] = useState<ObservationMeaning | null>(initialMeaning);
  const [reflectionText, setReflectionText] = useState(initialReflectionText);
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
      const next = await onSubmit(candidate, meaning, reflectionText);
      setResult(next);
    } finally {
      setSubmitting(false);
    }
  };

  const message =
    result !== null && result.status !== 'idle' ? result.message : null;

  return (
    <View
      testID={`awareness-candidate-${candidate.candidateId}`}
      style={[
        styles.candidate,
        {
          backgroundColor: colors.surface,
          borderColor: colors.borderSubtle,
          borderRadius: RADIUS.md,
        },
      ]}
    >
      <Text style={[TYPOGRAPHY.eyebrow, { color: colors.accent }]}>临时观察</Text>
      <Text style={[TYPOGRAPHY.lead, { color: colors.textPrimary, marginTop: SPACING.xs }]}>
        {candidate.observation}
      </Text>
      <Text style={[TYPOGRAPHY.body, { color: colors.textSecondary, marginTop: SPACING.sm }]}>
        一种可能：{candidate.possibleExplanation}
      </Text>
      <Text style={[TYPOGRAPHY.meta, { color: colors.textMuted, marginTop: SPACING.sm }]}>
        不确定性：{candidate.uncertainty}
      </Text>
      <Text style={[TYPOGRAPHY.body, { color: colors.textPrimary, marginTop: SPACING.sm }]}>
        可以继续想一想：{candidate.reflectionQuestion}
      </Text>

      <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textMuted, marginTop: SPACING.md }]}>
        相关记录
      </Text>
      {candidate.relatedRecords.map((record) => (
        <Text
          key={record.id}
          style={[TYPOGRAPHY.meta, { color: colors.textSecondary, marginTop: SPACING.xs }]}
        >
          · {record.verbatim}
        </Text>
      ))}

      <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textMuted, marginTop: SPACING.md }]}>
        你的回应
      </Text>
      <View style={styles.choiceRow}>
        {CHOICES.map(([value, label]) => {
          const active = meaning === value;
          return (
            <Pressable
              key={value}
              testID={`awareness-choice-${candidate.candidateId}-${value}`}
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
          testID={`awareness-reflection-${candidate.candidateId}`}
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

      <Pressable
        testID={`awareness-submit-${candidate.candidateId}`}
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

      {message !== null ? (
        <Text
          testID={`awareness-result-${candidate.candidateId}`}
          style={[TYPOGRAPHY.meta, { color: colors.textSecondary, marginTop: SPACING.sm }]}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
};

const AwarenessHistoryCard = ({
  item,
}: {
  readonly item: AwarenessHistoryItem;
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const statusLabel =
    item.status === 'responded'
      ? '已回应'
      : item.status === 'dismissed'
        ? '已放下'
        : '待处理';

  return (
    <View
      testID={`awareness-history-${item.candidateId}`}
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
        <Text style={[TYPOGRAPHY.meta, { color: colors.textMuted }]}>{statusLabel}</Text>
      </View>
      <Text style={[TYPOGRAPHY.body, { color: colors.textPrimary, marginTop: SPACING.xs }]}>
        {item.candidate.observation}
      </Text>
      <Text style={[TYPOGRAPHY.meta, { color: colors.textMuted, marginTop: SPACING.xs }]}>
        {formatCapturedAt(item.createdAt)}
      </Text>
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
  const [loading, setLoading] = useState(true);

  const refreshHistory = useCallback(async () => {
    setHistory(await runtime.awarenessHistory());
  }, [runtime]);

  // Page open: read Records and durable history only. No AI call here.
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

  const start = useCallback(async () => {
    if (selectedRecordId === null) return;
    setSuggestion({ kind: 'loading' });
    const experience = await runtime.suggestRelations(selectedRecordId);
    setSuggestion({ kind: 'result', experience });
    await refreshHistory();
  }, [refreshHistory, runtime, selectedRecordId]);

  const submit = useCallback(
    async (
      candidate: RelationCandidateView,
      meaning: ObservationMeaning,
      reflectionText: string,
    ) => {
      const result = await runtime.submitObservationReflection({
        candidateId: candidate.candidateId,
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
  const visibleCandidateIds = new Set(result?.candidates.map((item) => item.candidateId) ?? []);
  const historical = history.filter((item) => !visibleCandidateIds.has(item.candidateId));

  return (
    <ScrollView
      testID="space-awareness"
      style={[styles.root, { backgroundColor: colors.canvas }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[TYPOGRAPHY.title, { color: colors.textPrimary }]}>觉察</Text>
      <Text style={[TYPOGRAPHY.body, { color: colors.textSecondary, lineHeight: 24 }]}>
        选择一条记录，由你主动开始一次觉察。AI 只会提出临时观察，不会直接形成长期联系。
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : records.length === 0 ? (
        <Text testID="awareness-empty" style={[TYPOGRAPHY.body, { color: colors.textMuted }]}>
          还没有记录。先在“记录”里写下至少两句话，再回来觉察。
        </Text>
      ) : (
        <>
          <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textMuted }]}>选择一条记录</Text>
          <View style={styles.recordList}>
            {records.map((record) => {
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

          {result?.candidates.map((candidate) => (
            <AwarenessCandidateCard
              key={candidate.candidateId}
              candidate={candidate}
              onSubmit={submit}
            />
          ))}
        </>
      )}

      <View style={styles.historySection}>
        <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textMuted }]}>历史觉察</Text>
        {historical.length === 0 ? (
          <Text testID="awareness-history-empty" style={[TYPOGRAPHY.meta, { color: colors.textMuted }]}>
            还没有历史觉察。生成过的内容会留在这里。
          </Text>
        ) : (
          historical.map((item) => <AwarenessHistoryCard key={item.candidateId} item={item} />)
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
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
    marginTop: SPACING.md,
  },
  candidate: { borderWidth: 1, padding: SPACING.md },
  choiceRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  choice: { flex: 1, borderWidth: 1, paddingVertical: SPACING.sm, alignItems: 'center' },
  reflectionInput: {
    minHeight: 88,
    borderWidth: 1,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
    textAlignVertical: 'top',
  },
  historySection: { gap: SPACING.sm, marginTop: SPACING.lg },
  historyCard: { borderWidth: 1, padding: SPACING.md },
  historyHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
