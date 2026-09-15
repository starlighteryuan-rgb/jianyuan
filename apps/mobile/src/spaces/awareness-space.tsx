/**
 * Awareness space — explicit, user-initiated AI observation.
 *
 * WHAT THIS SCREEN DOES
 * It reads existing Records and, only when the user taps "开始一次觉察", asks
 * the Mobile runtime for tentative relation candidates. The candidates are
 * transient: nothing is written to Core until the user writes free text.
 *
 * WHAT THIS SCREEN MUST NOT DO
 * Opening the tab must never call the Provider. The page-open effect only loads
 * Records. The AI call happens in the press handler, which is the one user
 * action the product authorises.
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

type ReflectionState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'done'; readonly result: CandidateDecisionResult };

const formatCapturedAt = (value: Date): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

export const AwarenessSpace = () => {
  const runtime = useRuntime();
  const { theme } = useTheme();
  const { colors } = theme;

  const [records, setRecords] = useState<readonly RecordReadModel[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SuggestionState>({ kind: 'idle' });
  const [meaning, setMeaning] = useState<ObservationMeaning | null>(null);
  const [reflectionText, setReflectionText] = useState('');
  const [reflection, setReflection] = useState<ReflectionState>({ kind: 'idle' });
  const [loading, setLoading] = useState(true);

  // Page open: read Records only. There is deliberately no AI call here.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const recent = await runtime.listRecent();
        if (cancelled) return;
        setRecords(recent);
        setSelectedRecordId((current) => current ?? recent[0]?.id ?? null);
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
    setReflection({ kind: 'idle' });
    setMeaning(null);
    setReflectionText('');
    const experience = await runtime.suggestRelations(selectedRecordId);
    setSuggestion({ kind: 'result', experience });
  }, [runtime, selectedRecordId]);

  const submit = useCallback(
    async (candidate: RelationCandidateView, choice: ObservationMeaning) => {
      setMeaning(choice);
      if (choice === 'not_my_experience') {
        setReflection({ kind: 'saving' });
        const result = await runtime.submitObservationReflection({
          candidateId: candidate.candidateId,
          meaning: choice,
        });
        setReflection({ kind: 'done', result });
        return;
      }

      if (reflectionText.trim().length === 0) {
        setReflection({
          kind: 'done',
          result: {
            status: 'reflection_required',
            message: '请先写下你的理解；快捷选择本身不会创建关系。',
          },
        });
        return;
      }

      setReflection({ kind: 'saving' });
      const result = await runtime.submitObservationReflection({
        candidateId: candidate.candidateId,
        meaning: choice,
        reflectionText,
      });
      setReflection({ kind: 'done', result });
    },
    [reflectionText, runtime],
  );

  const result =
    suggestion.kind === 'result' && suggestion.experience.status === 'candidates'
      ? suggestion.experience
      : null;

  const reflectionMessage =
    reflection.kind === 'done' && reflection.result.status !== 'idle'
      ? reflection.result.message
      : null;

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
                    setReflection({ kind: 'idle' });
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
            onPress={start}
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
            <View
              key={candidate.candidateId}
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
                {(
                  [
                    ['connected', '很接近'],
                    ['different_understanding', '有一点像'],
                    ['not_my_experience', '这不是我的体验'],
                  ] as const
                ).map(([value, label]) => {
                  const active = meaning === value;
                  return (
                    <Pressable
                      key={value}
                      testID={`awareness-choice-${value}`}
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
                disabled={meaning === null || reflection.kind === 'saving'}
                onPress={() => {
                  if (meaning === null) return;
                  void submit(candidate, meaning);
                }}
                style={[
                  styles.secondaryButton,
                  {
                    backgroundColor:
                      meaning === null ? colors.borderSubtle : colors.accentSoft,
                    borderColor: colors.borderSubtle,
                    borderRadius: RADIUS.sm,
                  },
                ]}
              >
                <Text style={[TYPOGRAPHY.lead, { color: colors.textPrimary }]}>确认我的回应</Text>
              </Pressable>

              {reflectionMessage !== null ? (
                <Text
                  testID="awareness-result"
                  style={[TYPOGRAPHY.meta, { color: colors.textSecondary, marginTop: SPACING.sm }]}
                >
                  {reflectionMessage}
                </Text>
              ) : null}
            </View>
          ))}
        </>
      )}
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
});
