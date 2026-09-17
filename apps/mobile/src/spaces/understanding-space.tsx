/**
 * Understanding space — the user's own persisted Reflections.
 *
 * The read model starts from the persisted UserReflectionRecord, not from a
 * Relation. A relation target is optional context: the user's words remain when
 * the Core Gate admits no Relation.
 *
 * It performs no AI call. Understanding is a read over what the user already
 * wrote and what Core already admitted.
 *
 * DIRECTION AB
 * Understanding is A-led: the reflection reads as an essay fragment, with the
 * first-person "我" as the anchor. B2 contributes only a quiet near / far
 * hierarchy; older reflections recede by contrast and spacing, not by stacking
 * more cards.
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
import { DEPTH, SPACING, TYPOGRAPHY } from '../theme/tokens';

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

const formatDay = (value: Date, now: Date = new Date()): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const startOfDay = (input: Date) =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
  const delta = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (delta === 0) return '今天';
  if (delta === 1) return '昨天';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

const firstCharacter = (value: string): string => value.trim().slice(0, 1);

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
      <View style={styles.masthead}>
        <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textFaint }]}>理解 · 你自己的话</Text>
        <View style={[styles.mastheadRule, { backgroundColor: colors.dividerWeak }]} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : error !== null ? (
        <Text testID="understanding-error" style={[TYPOGRAPHY.body, { color: colors.danger }]}>
          {error}
        </Text>
      ) : items.length === 0 ? (
        <Text testID="understanding-empty" style={[TYPOGRAPHY.empty, { color: colors.textMuted }]}>
          {searchQuery.trim().length > 0
            ? '没有找到相关内容'
            : '还没有可以理解的内容。你在觉察里写下的理解会保存在这里。'}
        </Text>
      ) : (
        items.map((item, index) => {
          const isOpen = expanded === item.key;
          const near = index === 0;
          const anchor = firstCharacter(item.verbatim);
          const body = item.verbatim.trim().slice(1);
          return (
            <View
              key={item.key}
              testID={`understanding-item-${item.key}`}
              style={[
                styles.entry,
                !near && styles.entryFar,
                near && { backgroundColor: colors.nearSurface },
                isOpen && { borderLeftColor: colors.focusIndicator },
                isOpen && styles.entryOpen,
              ]}
            >
              <View style={styles.rail}>
                <Text style={[TYPOGRAPHY.timestamp, { color: colors.textFaint }]}>
                  {formatDay(item.createdAt)}
                </Text>
                <View
                  style={[
                    styles.railMark,
                    { backgroundColor: near ? colors.accent : colors.divider },
                  ]}
                />
              </View>
              <View style={styles.entryBody}>
                <Text
                  testID={`understanding-reflection-${item.reflectionId}`}
                  style={[
                    styles.essay,
                    { color: near ? colors.textPrimary : colors.textSecondary },
                  ]}
                >
                  <Text style={[styles.firstPerson, { color: colors.accent }]}>
                    {anchor}
                  </Text>
                  {body}
                </Text>

                <View style={styles.attrib}>
                  <Text style={[TYPOGRAPHY.caption, { color: colors.textMuted }]}>
                    {item.relation === null
                      ? `写下于 ${formatDate(item.createdAt)}`
                      : `来自「${item.relation.relation.dimension}」`}
                  </Text>
                  <View style={[styles.attribDot, { backgroundColor: colors.divider }]} />
                  <Text style={[TYPOGRAPHY.caption, { color: colors.textFaint }]}>
                    {item.relation === null ? '仅保存理解' : '已形成长期联系'}
                  </Text>
                </View>

                {item.relation === null ? null : (
                  <Text style={[TYPOGRAPHY.caption, { color: colors.textMuted, marginTop: SPACING.sm }]}>
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
                      style={styles.toggle}
                    >
                      <Text style={[TYPOGRAPHY.caption, { color: colors.accent }]}>
                        {isOpen ? '收起来源记录' : '查看来源记录'}
                      </Text>
                    </Pressable>

                    {isOpen ? (
                      <View testID={`understanding-sources-${item.key}`} style={styles.sources}>
                        {item.sourceRecords.map((record) => (
                          <Text
                            key={record.id}
                            style={[
                              TYPOGRAPHY.caption,
                              { color: colors.textSecondary, lineHeight: 22 },
                            ]}
                          >
                            · {record.verbatim ?? '（没有可显示的原话）'}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingHorizontal: SPACING.screen,
    paddingBottom: SPACING.xxl,
  },
  masthead: { paddingTop: SPACING.sm },
  mastheadRule: { height: 1, marginTop: SPACING.md },
  entry: {
    flexDirection: 'row',
    gap: SPACING.lg,
    paddingVertical: SPACING.section,
    paddingLeft: SPACING.xs,
  },
  entryFar: { opacity: DEPTH.recedeOpacity },
  entryOpen: {
    marginLeft: -SPACING.sm,
    paddingLeft: SPACING.md,
    borderLeftWidth: 2,
  },
  rail: { width: 40, paddingTop: SPACING.xs },
  railMark: { width: 14, height: 1, marginTop: SPACING.sm },
  entryBody: { flex: 1, minWidth: 0 },
  essay: { ...TYPOGRAPHY.reflection },
  firstPerson: { ...TYPOGRAPHY.firstPerson },
  attrib: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  attribDot: { width: 3, height: 3, borderRadius: 999 },
  toggle: { minHeight: 44, justifyContent: 'center', marginTop: SPACING.sm },
  sources: { gap: SPACING.sm, marginTop: SPACING.sm },
});
