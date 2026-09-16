/**
 * Understanding space — the user's own persisted Reflections.
 *
 * The read model starts from the persisted UserReflectionRecord, not from a
 * Relation. A relation target is optional context: the user's words remain when
 * the Core Gate admits no Relation.
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
import type { ReflectionTargetReadModel } from '../../../../packages/core/application/reflection-flow-service';
import { useRuntime } from '../shell/runtime-context';
import { matchesLocalQuery } from '../shell/local-search';
import { useTheme } from '../theme/theme-context';
import { RADIUS, SPACING, TYPOGRAPHY } from '../theme/tokens';

interface UnderstandingItem {
  readonly key: string;
  readonly reflectionId: string;
  readonly verbatim: string;
  readonly createdAt: Date;
  readonly relation: ReflectionTargetReadModel | null;
  readonly sourceRecords: readonly RecordReadModel[];
}

const formatDate = (value: Date): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const UnderstandingSpace = ({ searchQuery = '' }: { readonly searchQuery?: string }) => {
  const runtime = useRuntime();
  const { theme } = useTheme();
  const { colors } = theme;

  const [items, setItems] = useState<readonly UnderstandingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const persisted = await runtime.listUnderstandingReflections();
      const resolved = await Promise.all(
        persisted.map(async (reflection): Promise<UnderstandingItem> => {
          const relation =
            reflection.targetRef === null
              ? null
              : await runtime.getReflectionTarget(reflection.targetRef);
          const sourceRecords =
            relation === null
              ? []
              : await Promise.all(
                  relation.relation.recordRefs.map((id) => runtime.getRecord(id)),
                );
          return {
            key: reflection.reflectionRecordId,
            reflectionId: reflection.reflectionRecordId,
            verbatim: reflection.verbatim,
            createdAt: reflection.createdAt,
            relation,
            sourceRecords: sourceRecords.filter(
              (record): record is RecordReadModel => record !== null,
            ),
          };
        }),
      );
      setItems(resolved.filter((item) => matchesLocalQuery(searchQuery, [item.verbatim])));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [runtime, searchQuery]);

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
           {searchQuery.trim().length > 0 ? '没有找到相关内容' : '还没有可以理解的内容。你在觉察里写下的理解会保存在这里。'}
        </Text>
      ) : (
        items.map((item) => {
          const isOpen = expanded === item.key;
          return (
            <View
              key={item.key}
              testID={`understanding-item-${item.key}`}
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
              <Text
                testID={`understanding-reflection-${item.reflectionId}`}
                style={[
                  TYPOGRAPHY.lead,
                  { color: colors.textPrimary, lineHeight: 26, marginTop: SPACING.xs },
                ]}
              >
                {item.verbatim || '（这条回应没有可显示的原话）'}
              </Text>

              <Text style={[TYPOGRAPHY.meta, { color: colors.textMuted, marginTop: SPACING.sm }]}>
                {item.relation === null
                  ? `写下于 ${formatDate(item.createdAt)}`
                  : `联系方向：${item.relation.relation.dimension} · ${formatDate(item.relation.relation.createdAt)}`}
              </Text>
              {item.relation === null ? null : (
                <Text style={[TYPOGRAPHY.body, { color: colors.textSecondary, marginTop: SPACING.sm }]}>
                  当时的问题：{item.relation.relation.question}
                </Text>
              )}

              {item.relation === null ? null : (
                <>
                  <Pressable
                    testID={`understanding-toggle-${item.key}`}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                    onPress={() => setExpanded(isOpen ? null : item.key)}
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
                    <View testID={`understanding-sources-${item.key}`} style={styles.sources}>
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
                </>
              )}
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
