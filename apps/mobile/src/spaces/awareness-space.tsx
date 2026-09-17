/**
 * Awareness space — the user's automatic and manual observation inbox.
 *
 * The page has two entry paths:
 *   1. automatic checks create durable pending items after a quiet window
 *   2. the explicit "开始一次觉察" action still creates transient candidates
 *
 * Opening the tab never calls the Provider and never marks everything read.
 * Only opening one concrete bubble changes that item from pending to viewed.
 *
 * M3 motion keeps those facts visible: a new Bubble floats in, opening reads as
 * focusing that Bubble into Detail, and closing returns the item to History.
 *
 * DIRECTION AB
 * Main is A: a large quiet stage, concentric halo, one current observation.
 * B2 contributes only a faint background recede. Open keeps A's reading order
 * and uses B2's foreground focus without becoming a large response card.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type {
  AwarenessHistoryItem,
  CandidateDecisionResult,
  ObservationMeaning,
  RelationCandidateView,
  RelationSuggestionExperience,
} from '../runtime/awareness-session';
import { useRuntime } from '../shell/runtime-context';
import {
  reflectionSaveLabel,
  reflectionSaveReducer,
} from './reflection-save-state';
import { matchesLocalQuery } from '../shell/local-search';
import { MOTION_DURATION, useMotion } from '../theme/motion';
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const AwarenessBubble = ({
  item,
  onOpen,
}: {
  readonly item: AwarenessHistoryItem;
  readonly onOpen: (item: AwarenessHistoryItem) => void;
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const motion = useMotion();
  const entered = useSharedValue(0);
  const textIn = useSharedValue(0);
  const rippleOut = useSharedValue(0);

  useEffect(() => {
    entered.value = withTiming(1, motion.timing('bubble', motion.reduceMotion));
    textIn.value = withTiming(1, motion.timing('textReveal', motion.reduceMotion));
    rippleOut.value = withTiming(1, motion.timing('ripple', motion.reduceMotion));
  }, [entered, motion, rippleOut, textIn]);

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(entered.value, [0, 0.55, 1], [0, 0.82, 1]),
    transform: [
      { scale: interpolate(entered.value, [0, 0.6, 1], [motion.bubbleScale, 1.012, 1]) },
      { translateY: interpolate(entered.value, [0, 0.6, 1], [10, -2, 0]) },
    ],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: interpolate(textIn.value, [0, 0.35, 1], [0, 0, 1]),
    transform: [{ translateY: interpolate(textIn.value, [0, 1], [5, 0]) }],
  }));

  const rippleStyle = useAnimatedStyle(() => ({
    opacity: motion.reduceMotion
      ? 0
      : interpolate(rippleOut.value, [0, 0.18, 0.55, 1], [0, 0.24, 0.12, 0]),
    transform: [
      { scale: interpolate(rippleOut.value, [0, 0.55, 1], [0.92, 1.03, 1.09]) },
    ],
  }));
  const unread = item.status === 'pending';

  return (
    <View style={styles.bubbleShell}>
      <View
        pointerEvents="none"
        style={[styles.bubbleGhost, { borderColor: colors.awarenessHalo }]}
      />
      <Animated.View
        style={[styles.ripple, { borderColor: colors.awarenessRipple }, rippleStyle]}
        pointerEvents="none"
      />
      <AnimatedPressable
        testID={`awareness-bubble-${item.candidateId}`}
        accessibilityRole="button"
        accessibilityLabel="新的觉察"
        onPress={() => onOpen(item)}
        style={[styles.bubble, bubbleStyle]}
      >
        <View style={styles.bubbleHead}>
          <Animated.View style={textStyle}>
            <Text style={[TYPOGRAPHY.eyebrow, { color: colors.accent }]}>新的觉察</Text>
          </Animated.View>
          {unread ? (
            <View
              testID={`awareness-unread-${item.candidateId}`}
              style={[styles.dot, { backgroundColor: colors.accent }]}
            />
          ) : null}
        </View>
        <Animated.View style={textStyle}>
          <Text style={[TYPOGRAPHY.lead, { color: colors.textPrimary, marginTop: SPACING.sm }]}>
            {item.candidate.observation}
          </Text>
          <Text style={[TYPOGRAPHY.timestamp, { color: colors.textFaint, marginTop: SPACING.md }]}>
            {formatCapturedAt(item.createdAt)}
          </Text>
        </Animated.View>
      </AnimatedPressable>
    </View>
  );
};

const AwarenessHistoryCard = ({
  item,
  onOpen,
}: {
  readonly item: AwarenessHistoryItem;
  readonly onOpen: (item: AwarenessHistoryItem) => void;
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const motion = useMotion();
  const entered = useSharedValue(0);

  useEffect(() => {
    entered.value = withTiming(1, motion.timing('normal', motion.reduceMotion));
  }, [entered, motion]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(entered.value, [0, 1], [0, 1]),
    transform: [{ translateY: interpolate(entered.value, [0, 1], [4, 0]) }],
  }));

  return (
    <AnimatedPressable
      key={item.candidateId}
      testID={`awareness-history-${item.candidateId}`}
      onPress={() => void onOpen(item)}
      style={[styles.historyCard, cardStyle]}
    >
      <View style={styles.historyHead}>
        <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textMuted }]}>历史觉察</Text>
        <Text style={[TYPOGRAPHY.timestamp, { color: colors.textFaint }]}>
          {item.status === 'reflected'
            ? '已回应'
            : item.status === 'dismissed'
              ? '已放下'
              : '已查看'}
        </Text>
      </View>
      <Text style={[TYPOGRAPHY.body, { color: colors.textPrimary, marginTop: SPACING.sm }]}>
        {item.candidate.observation}
      </Text>
    </AnimatedPressable>
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
    onPersisted?: (reflectionRecordId: string) => void,
  ) => Promise<CandidateDecisionResult>;
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const motion = useMotion();
  const opened = useSharedValue(0);
  const [meaning, setMeaning] = useState<ObservationMeaning | null>(item.meaning);
  const [reflectionText, setReflectionText] = useState(item.reflectionText ?? '');
  const [saveState, dispatchSave] = useReducer(
    reflectionSaveReducer,
    item.status === 'reflected' || item.status === 'dismissed' ? 'settled' : 'idle',
  );
  const [result, setResult] = useState<CandidateDecisionResult | null>(null);
  const settlementTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    opened.value = withTiming(1, motion.timing('normal', motion.reduceMotion));
  }, [motion, opened]);

  useEffect(
    () => () => {
      if (settlementTimer.current !== null) clearTimeout(settlementTimer.current);
    },
    [],
  );

  const settleAfterSaved = useCallback(() => {
    if (settlementTimer.current !== null) clearTimeout(settlementTimer.current);
    settlementTimer.current = setTimeout(() => {
      settlementTimer.current = null;
      setReflectionText('');
      dispatchSave({ type: 'settled' });
    }, 1_000);
  }, []);

  // The durable item is the authority on whether the Reflection was persisted.
  // Whatever a local race does, a reflected/dismissed item can never render as
  // `saving`; this is the guard that closes the real-device stuck state.
  const persisted = item.status === 'reflected' || item.status === 'dismissed';
  useEffect(() => {
    if (!persisted) return;
    dispatchSave({ type: 'outcome', persisted: true, validationFailed: false });
    settleAfterSaved();
  }, [persisted, settleAfterSaved]);

  const close = () => {
    if (opened.value === 0) return;
    opened.value = withTiming(0, motion.timing('normal', motion.reduceMotion));
    onClose();
  };

  const submit = async () => {
    if (meaning === null || saveState === 'saving') return;
    if (meaning !== 'not_my_experience' && reflectionText.trim().length === 0) {
      setResult({
        status: 'reflection_required',
        message: '请先写下你的理解；快捷选择本身不会创建关系。',
      });
      dispatchSave({ type: 'outcome', persisted: false, validationFailed: true });
      return;
    }
    dispatchSave({ type: 'begin' });
    try {
      const next = await onRespond(item, meaning, reflectionText, () => {
        // Reflection is durable now; settle the visible feedback immediately
        // instead of waiting for Relation / Discovery evaluation.
        dispatchSave({ type: 'outcome', persisted: true, validationFailed: false });
        settleAfterSaved();
      });
      setResult(next);
      const nextStatus = next?.status;
      const persistedOutcome =
        nextStatus === 'discovery' || nextStatus === 'reflection_saved';
      dispatchSave({
        type: 'outcome',
        persisted: persistedOutcome,
        validationFailed: nextStatus === 'reflection_required',
      });
      if (persistedOutcome) settleAfterSaved();
    } catch (caught) {
      setResult({
        status: 'unavailable',
        message: caught instanceof Error ? caught.message : '保存失败，请重试。',
      });
      dispatchSave({ type: 'outcome', persisted: false, validationFailed: false });
    }
  };

  const detailStyle = useAnimatedStyle(() => ({
    opacity: interpolate(opened.value, [0, 0.35, 1], [0, 0.45, 1]),
    transform: [
      { scale: interpolate(opened.value, [0, 1], [motion.detailScale, 1]) },
      { translateY: interpolate(opened.value, [0, 1], [-6, 0]) },
    ],
  }));

  return (
    <Animated.View
      testID={`awareness-detail-${item.candidateId}`}
      style={[styles.detail, { borderTopColor: colors.divider }, detailStyle]}
    >
      <Text style={[TYPOGRAPHY.timestamp, { color: colors.textFaint }]}>
        {formatCapturedAt(item.createdAt)}
      </Text>
      <Text style={[TYPOGRAPHY.eyebrow, { color: colors.accent, marginTop: SPACING.sm }]}>
        觉察 · 打开
      </Text>
      <Text style={[TYPOGRAPHY.lead, { color: colors.textPrimary, marginTop: SPACING.sm }]}>
        {item.candidate.observation}
      </Text>
      {item.candidate.reflectionQuestion === undefined ? null : (
        <Text style={[TYPOGRAPHY.body, { color: colors.textPrimary, marginTop: SPACING.lg }]}>
          可以继续想一想：{item.candidate.reflectionQuestion}
        </Text>
      )}

      <Text style={[TYPOGRAPHY.caption, { color: colors.textMuted, marginTop: SPACING.section }]}>
        相关记录
      </Text>
      {item.candidate.relatedRecords.map((record) => (
        <Text
          key={record.id}
          style={[TYPOGRAPHY.caption, { color: colors.textSecondary, marginTop: SPACING.sm }]}
        >
          · {record.verbatim}
        </Text>
      ))}
      {item.candidate.possibleExplanation === undefined ? null : (
        <View style={styles.detailBlock}>
          <Text style={[TYPOGRAPHY.caption, { color: colors.textMuted }]}>一种可能</Text>
          <Text style={[TYPOGRAPHY.body, { color: colors.textPrimary, marginTop: SPACING.sm }]}>
            {item.candidate.possibleExplanation}
          </Text>
        </View>
      )}
      {item.candidate.uncertainty === undefined ? null : (
        <Text style={[TYPOGRAPHY.caption, { color: colors.textMuted, marginTop: SPACING.lg }]}>
          需要留意：{item.candidate.uncertainty}
        </Text>
      )}

      <View style={[styles.detailBlock, { borderTopColor: colors.dividerWeak, borderTopWidth: 1 }]}>
        <Text style={[TYPOGRAPHY.caption, { color: colors.textMuted }]}>你的回应</Text>
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
                    borderBottomColor: active ? colors.accent : colors.divider,
                  },
                ]}
              >
                <Text
                  style={[
                    TYPOGRAPHY.caption,
                    { color: active ? colors.accent : colors.textSecondary },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {meaning !== null && meaning !== 'not_my_experience' ? (
        <TextInput
          testID={`awareness-reflection-${item.candidateId}`}
          value={reflectionText}
          onChangeText={setReflectionText}
          multiline
          placeholder="写下你自己的理解……"
          placeholderTextColor={colors.textMuted}
          style={[styles.reflectionInput, TYPOGRAPHY.body, { color: colors.textPrimary }]}
        />
      ) : null}

      <View style={styles.detailActions}>
        <Pressable
          testID={`awareness-submit-${item.candidateId}`}
          accessibilityRole="button"
          disabled={meaning === null || saveState === 'saving'}
          onPress={() => void submit()}
          style={[
            styles.secondaryButton,
            {
              backgroundColor: meaning === null ? colors.dividerWeak : colors.accentSoft,
            },
          ]}
        >
          <Text style={[TYPOGRAPHY.action, { color: colors.textPrimary }]}>
            {reflectionSaveLabel(saveState)}
          </Text>
        </Pressable>
        <Pressable
          testID={`awareness-close-${item.candidateId}`}
          accessibilityRole="button"
          onPress={close}
          style={styles.linkButton}
        >
          <Text style={[TYPOGRAPHY.action, { color: colors.textSecondary }]}>收起</Text>
        </Pressable>
      </View>

      {result !== null && result.status !== 'idle' ? (
        <Text
          testID={`awareness-result-${item.candidateId}`}
          style={[
            TYPOGRAPHY.caption,
            {
              color: saveState === 'saved' ? colors.success : colors.textSecondary,
              marginTop: SPACING.md,
            },
          ]}
        >
          {result.message}
        </Text>
      ) : null}
      <Text style={[TYPOGRAPHY.caption, { color: colors.textFaint, marginTop: SPACING.lg }]}>
        不是你确认的结论；你的回应只表示立场，不会自动成为理解。
      </Text>
    </Animated.View>
  );
};

export const AwarenessSpace = ({ searchQuery = '' }: { readonly searchQuery?: string }) => {
  const runtime = useRuntime();
  const { theme } = useTheme();
  const { colors } = theme;
  const motion = useMotion();

  const [latestRecordId, setLatestRecordId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SuggestionState>({ kind: 'idle' });
  const [history, setHistory] = useState<readonly AwarenessHistoryItem[]>([]);
  const [openItem, setOpenItem] = useState<AwarenessHistoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const closing = useRef(false);

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
          runtime.listRecent(5),
          runtime.awarenessHistory(),
        ]);
        if (cancelled) return;
        setLatestRecordId(recent[0]?.id ?? null);
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
        next.find((candidate) => candidate.candidateId === item.candidateId) ?? item,
      );
    },
    [refreshHistory, runtime],
  );

  const closeDetail = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setOpenItem(null);
    setTimeout(() => {
      closing.current = false;
    }, motion.reduceMotion ? MOTION_DURATION.fast : MOTION_DURATION.normal);
  }, [motion.reduceMotion]);

  const start = useCallback(async () => {
    if (latestRecordId === null) return;
    setSuggestion({ kind: 'loading' });
    const experience = await runtime.suggestRelations(latestRecordId ?? undefined);
    setSuggestion({ kind: 'result', experience });
    await refreshHistory();
  }, [refreshHistory, runtime, latestRecordId]);

  const submit = useCallback(
    async (
      item: AwarenessHistoryItem,
      meaning: ObservationMeaning,
      reflectionText: string,
      onPersisted?: (reflectionRecordId: string) => void,
    ) => {
      try {
        const result = await runtime.submitObservationReflection({
          candidateId: item.candidateId,
          meaning,
          ...(reflectionText.length === 0 ? {} : { reflectionText }),
          ...(onPersisted === undefined ? {} : { onPersisted }),
        });
        await refreshHistory();
        return result;
      } catch (caught) {
        return {
          status: 'unavailable' as const,
          message: caught instanceof Error ? caught.message : '保存失败，请重试。',
        };
      }
    },
    [refreshHistory, runtime],
  );

  const result =
    suggestion.kind === 'result' && suggestion.experience.status === 'candidates'
      ? suggestion.experience
      : null;
  const inbox = useMemo(
    () =>
      history
        .filter((item) => item.status === 'pending')
        .filter((item) => matchesLocalQuery(searchQuery, [item.candidate.observation])),
    [history, searchQuery],
  );
  const manualCandidates =
    result?.candidates.filter((candidate) =>
      history.every((item) => item.candidateId !== candidate.candidateId),
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
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          {openItem !== null ? (
            <AwarenessDetail item={openItem} onClose={closeDetail} onRespond={submit} />
          ) : null}

          <Animated.View
            testID="awareness-rest"
            pointerEvents={openItem === null ? 'auto' : 'none'}
            style={[
              styles.rest,
              {
                opacity: openItem === null ? 1 : 0.28,
                transform: [{ scale: openItem === null ? 1 : 0.985 }],
              },
            ]}
          >
            {inbox.length === 0 ? (
              <>
                <View testID="awareness-stage" style={styles.stage}>
                  <View
                    pointerEvents="none"
                    style={[
                      styles.halo,
                      styles.haloOuter,
                      { borderColor: colors.awarenessHalo },
                    ]}
                  />
                  <View
                    pointerEvents="none"
                    style={[
                      styles.halo,
                      styles.haloInner,
                      { borderColor: colors.awarenessEdge },
                    ]}
                  />
                  <Text
                    testID="awareness-empty"
                    style={[TYPOGRAPHY.body, { color: colors.textMuted, textAlign: 'center' }]}
                  >
                    {searchQuery.trim().length > 0
                      ? '没有找到相关内容'
                      : '这里还没有新的觉察。你可以继续记录，或主动开始一次觉察。'}
                  </Text>
                </View>

                <Pressable
                  testID="awareness-start"
                  accessibilityRole="button"
                  disabled={latestRecordId === null || suggestion.kind === 'loading'}
                  onPress={() => void start()}
                  style={[
                    styles.primaryButton,
                    {
                      borderTopColor: colors.divider,
                    },
                  ]}
                >
                  {suggestion.kind === 'loading' ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : (
                    <Text
                      style={[
                        TYPOGRAPHY.action,
                        {
                          color:
                            latestRecordId === null ? colors.textMuted : colors.accent,
                        },
                      ]}
                    >
                      开始一次觉察
                    </Text>
                  )}
                </Pressable>

                {suggestion.kind === 'result' &&
                suggestion.experience.status !== 'candidates' ? (
                  <Text
                    testID="awareness-status"
                    style={[TYPOGRAPHY.body, { color: colors.textSecondary }]}
                  >
                    {suggestion.experience.message}
                  </Text>
                ) : null}

                {manualCandidates.map((candidate) => (
                  <AwarenessBubble
                    key={candidate.candidateId}
                    item={openManualCandidate(candidate)}
                    onOpen={(item) => setOpenItem(item)}
                  />
                ))}
              </>
            ) : (
              inbox.map((item) => (
                <AwarenessBubble key={item.candidateId} item={item} onOpen={open} />
              ))
            )}
          </Animated.View>
        </>
      )}
    </ScrollView>
  );
};

export const AwarenessHistoryView = ({ searchQuery = '' }: { readonly searchQuery?: string }) => {
  const runtime = useRuntime();
  const { theme } = useTheme();
  const { colors } = theme;
  const [history, setHistory] = useState<readonly AwarenessHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const storedHistory = await runtime.awarenessHistory();
        if (!cancelled) setHistory(storedHistory);
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
      if (item.status === 'pending') await runtime.markAwarenessViewed(item.candidateId);
      setHistory(await runtime.awarenessHistory());
    },
    [runtime],
  );

  const historyItems = useMemo(
    () =>
      history.filter((item) =>
        matchesLocalQuery(searchQuery, [item.candidate.observation]),
      ),
    [history, searchQuery],
  );

  return (
    <ScrollView
      testID="space-awareness-history"
      style={[styles.root, { backgroundColor: colors.canvas }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[TYPOGRAPHY.navTitle, { color: colors.textPrimary }]}>觉察历史</Text>
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : historyItems.length === 0 ? (
        <Text
          testID="awareness-history-empty"
          style={[TYPOGRAPHY.empty, { color: colors.textMuted }]}
        >
          {searchQuery.trim().length > 0 ? '没有找到相关内容' : '查看过的觉察会留在这里。'}
        </Text>
      ) : (
        historyItems.map((item) => (
          <AwarenessHistoryCard key={item.candidateId} item={item} onOpen={open} />
        ))
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingHorizontal: SPACING.screen,
    gap: SPACING.section,
    paddingBottom: SPACING.xxl,
  },
  rest: { gap: SPACING.section },
  stage: {
    minHeight: 340,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    paddingHorizontal: SPACING.lg,
  },
  halo: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
  },
  haloOuter: { width: 300, height: 300 },
  haloInner: { width: 218, height: 218 },
  primaryButton: {
    minHeight: 44,
    borderTopWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleShell: { position: 'relative', minHeight: 180, justifyContent: 'center' },
  bubbleGhost: {
    position: 'absolute',
    left: SPACING.xl,
    right: SPACING.xl,
    top: SPACING.lg,
    bottom: SPACING.lg,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    transform: [{ scale: 0.94 }],
  },
  ripple: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  bubble: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    minHeight: 150,
    justifyContent: 'center',
  },
  bubbleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dot: { width: 6, height: 6, borderRadius: 999 },
  detail: {
    borderTopWidth: 1,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  detailBlock: { marginTop: SPACING.section, paddingTop: SPACING.md },
  choiceRow: { flexDirection: 'row', gap: SPACING.section, marginTop: SPACING.lg },
  choice: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    borderBottomWidth: 1,
  },
  reflectionInput: {
    minHeight: 96,
    borderLeftWidth: 1,
    borderColor: 'transparent',
    paddingLeft: SPACING.md,
    paddingRight: SPACING.sm,
    marginTop: SPACING.section,
    textAlignVertical: 'top',
  },
  detailActions: {
    flexDirection: 'row',
    gap: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING.section,
  },
  linkButton: { minHeight: 44, justifyContent: 'center' },
  historyCard: {
    borderBottomWidth: 1,
    borderColor: 'transparent',
    paddingVertical: SPACING.lg,
  },
  historyHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
