/**
 * Understanding space — the user's own persisted Reflections.
 *
 * The read model is the one Core already defines: a relation target carries the
 * user's free-text Reflections, each of which points back to the Record that
 * holds the verbatim text. The page renders the user's words first and keeps the
 * relation question and source Records as secondary context.
 *
 * It performs no AI call. Understanding is a read over what the user already
 * wrote and what Core already admitted.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { RecordReadModel } from '../../../../packages/core/index';
import type {
  ReflectionTargetReadModel,
  UserReflectionReadModel,
} from '../../../../packages/core/application/reflection-flow-service';
import { useRuntime } from '../shell/runtime-context';
import { useTheme } from '../theme/theme-context';
import { RADIUS, SPACING, TYPOGRAPHY } from '../theme/tokens';

interface UnderstandingItem {
  readonly targetRef: string;
  readonly target: ReflectionTargetReadModel;
  readonly sourceRecords: readonly RecordReadModel[];
}

const formatDate = (value: Date): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const UnderstandingSpace = () => {
  const runtime = useRuntime();
  const { theme } = useTheme();
  const { colors } = theme;

  const [items, setItems] = useState<readonly UnderstandingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const discoveries = await runtime.listDiscoveries();
      const relations = discoveries.filter((item) => item.kind === 'relation');
      const resolved = await Promise.all(
        relations.map(async (item): Promise<UnderstandingItem | null> => {
          const target = await runtime.getReflectionTarget(item.subject.id);
          if (target === null) return null;
          const sourceRecords = await Promise.all(
            target.relation.recordRefs.map((id) => runtime.getRecord(id)),
          );
          return {
            targetRef: item.subject.id,
            target,
            sourceRecords: sourceRecords.filter(
              (record): record is RecordReadModel => record !== null,
            ),
          };
        }),
      );
      setItems(resolved.filter((item): item is UnderstandingItem => item !== null));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [runtime]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      testID="space-reflection"
      style={[styles.root, { backgroundColor: colors.canvas }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[TYPOGRAPHY.title, { color: colors.textPrimary }]}>理解</Text>
      <Text style={[TYPOGRAPHY.body, { color: colors.textSecondary, lineHeight: 24 }]}>
        这里保存的是你自己的话。来源记录和当时的问题只作为背景，不替代你的理解。
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : error !== null ? (
        <Text testID="understanding-error" style={[TYPOGRAPHY.body, { color: colors.danger }]}>
          {error}
        </Text>
      ) : items.length === 0 ? (
        <Text testID="understanding-empty" style={[TYPOGRAPHY.body, { color: colors.textMuted }]}>
          还没有可以理解的内容。当觉察形成一条经 Core 确认的联系后，你对它的回应会出现在这里。
        </Text>
      ) : (
        items.map((item) => {
          const isOpen = expanded === item.targetRef;
          return (
            <View
              key={item.targetRef}
              testID={`understanding-item-${item.targetRef}`}
              style={[
                styles.item,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.borderSubtle,
                  borderRadius: RADIUS.md,
                },
              ]}
            >
              <Text style={[TYPOGRAPHY.eyebrow, { color: colors.accent }]}>你的理解</Text>
              {item.target.reflections.length === 0 ? (
                <Text style={[TYPOGRAPHY.body, { color: colors.textMuted, marginTop: SPACING.xs }]}>
                  你还没有写下对这条联系的回应。
                </Text>
              ) : (
                item.target.reflections.map((reflection: UserReflectionReadModel) => (
                  <Text
                    key={reflection.id}
                    testID={`understanding-reflection-${reflection.id}`}
                    style={[
                      TYPOGRAPHY.lead,
                      { color: colors.textPrimary, lineHeight: 26, marginTop: SPACING.xs },
                    ]}
                  >
                    {reflection.verbatim ?? '（这条回应没有可显示的原话）'}
                  </Text>
                ))
              )}

              <Text style={[TYPOGRAPHY.meta, { color: colors.textMuted, marginTop: SPACING.sm }]}>
                联系方向：{item.target.relation.dimension} · {formatDate(item.target.relation.createdAt)}
              </Text>
              <Text style={[TYPOGRAPHY.body, { color: colors.textSecondary, marginTop: SPACING.sm }]}>
                当时的问题：{item.target.relation.question}
              </Text>

              <Pressable
                testID={`understanding-toggle-${item.targetRef}`}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                onPress={() => setExpanded(isOpen ? null : item.targetRef)}
                style={[
                  styles.toggle,
                  { borderColor: colors.borderSubtle, borderRadius: RADIUS.sm },
                ]}
              >
                <Text style={[TYPOGRAPHY.meta, { color: colors.accent }]}>
                  {isOpen ? '收起来源记录' : '查看来源记录'}
                </Text>
              </Pressable>

              {isOpen ? (
                <View testID={`understanding-sources-${item.targetRef}`} style={styles.sources}>
                  {item.sourceRecords.map((record) => (
                    <Text
                      key={record.id}
                      style={[TYPOGRAPHY.meta, { color: colors.textSecondary, lineHeight: 22 }]}
                    >
                      · {record.verbatim ?? '（没有可显示的原话）'}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  item: { borderWidth: 1, padding: SPACING.md },
  toggle: { borderWidth: 1, paddingVertical: SPACING.sm, alignItems: 'center', marginTop: SPACING.md },
  sources: { gap: SPACING.xs, marginTop: SPACING.sm },
});
