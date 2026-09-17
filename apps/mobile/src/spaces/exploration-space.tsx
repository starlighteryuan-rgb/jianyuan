/**
 * Exploration space — long-term Relations admitted by the Core Gate.
 *
 * The page reads the same Discovery stream the rest of the product uses and
 * shows only `kind: 'relation'` subjects. Those are the persistent claims that
 * already passed the Core Gate; opening this tab performs no AI inference and
 * writes nothing.
 *
 * The trace is Relation -> source Records -> user Reflection. The Reflection
 * text is fetched through the existing read model rather than copied into a
 * Mobile-only table.
 *
 * DIRECTION AB
 * B2 contributes the spatial relation structure. A contributes the material:
 * typography, hairlines, weak surfaces, and quiet connectors. Nodes are text
 * anchors, not rounded cards, and the field is read-only; it is never a graph
 * editor.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { RecordReadModel } from '../../../../packages/core/index';
import type { DiscoveryStreamItem } from '../../../../packages/core/application/discovery-service';
import type { ReflectionTargetReadModel } from '../../../../packages/core/application/reflection-flow-service';
import { useRuntime } from '../shell/runtime-context';
import { matchesLocalQuery } from '../shell/local-search';
import { useTheme } from '../theme/theme-context';
import { DEPTH, SPACING, TYPOGRAPHY } from '../theme/tokens';

interface ExplorationItem {
  readonly relation: Extract<DiscoveryStreamItem, { readonly kind: 'relation' }>;
  readonly target: ReflectionTargetReadModel | null;
  readonly sourceRecords: readonly RecordReadModel[];
}

const formatDate = (value: Date): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const shortDate = (value: Date): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}月${pad(date.getDate())}日`;
};

export const ExplorationSpace = ({ searchQuery = '' }: { readonly searchQuery?: string }) => {
  const runtime = useRuntime();
  const { theme } = useTheme();
  const { colors } = theme;

  const [items, setItems] = useState<readonly ExplorationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const discoveries = await runtime.listDiscoveries();
    const relations = discoveries.filter(
      (item): item is Extract<DiscoveryStreamItem, { readonly kind: 'relation' }> =>
        item.kind === 'relation',
    );
    const resolved = await Promise.all(
      relations.map(async (relation): Promise<ExplorationItem> => {
        const target = await runtime.getReflectionTarget(relation.subject.id);
        const recordRefs = target?.relation.recordRefs ?? relation.subject.recordRefs;
        const records = await Promise.all(
          recordRefs.map((id) => runtime.getRecord(id)),
        );
        return {
          relation,
          target,
          sourceRecords: records.filter(
            (record): record is RecordReadModel => record !== null,
          ),
        };
      }),
    );
    setItems(
      resolved.filter((item) =>
        matchesLocalQuery(searchQuery, [
          item.relation.subject.comparisonAxis.dimension,
          item.relation.subject.evidenceSummary,
          item.target?.reflections[0]?.verbatim,
        ]),
      ),
    );
    setLoading(false);
  }, [runtime, searchQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      testID="space-exploration"
      style={[styles.root, { backgroundColor: colors.canvas }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.masthead}>
        <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textFaint }]}>探索 · 长期结构</Text>
        <View style={[styles.mastheadRule, { backgroundColor: colors.dividerWeak }]} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : items.length === 0 ? (
        <Text testID="exploration-empty" style={[TYPOGRAPHY.empty, { color: colors.textMuted }]}>
          {searchQuery.trim().length > 0
            ? '没有找到相关内容'
            : '还没有长期联系。觉察得到你的自由文字回应并通过 Core 判断后，才会出现在这里。'}
        </Text>
      ) : (
        items.map((item, itemIndex) => {
          const relation = item.relation.subject;
          const reflection = item.target?.reflections[0] ?? null;
          const nodes = item.sourceRecords.slice(0, 5);
          return (
            <View
              key={relation.id}
              testID={`exploration-item-${relation.id}`}
              style={[styles.relationBlock, itemIndex > 0 && styles.relationBlockSpaced]}
            >
              <View style={styles.relationHead}>
                <Text style={[TYPOGRAPHY.caption, { color: colors.accent }]}>
                  {String(itemIndex + 1).padStart(2, '0')}
                </Text>
                <Text
                  style={[
                    TYPOGRAPHY.lead,
                    { color: colors.textPrimary, flex: 1, marginLeft: SPACING.md },
                  ]}
                >
                  {relation.comparisonAxis.dimension}
                </Text>
              </View>
              <Text
                style={[TYPOGRAPHY.caption, { color: colors.textMuted, marginTop: SPACING.sm }]}
              >
                {shortDate(relation.createdAt)} · {relation.recordRefs.length} 条记录 · 支持程度
                {relation.evidenceSummary.length > 0 ? '中等' : '待观察'}
              </Text>

              <View style={styles.field}>
                <View
                  pointerEvents="none"
                  style={[styles.fieldAxis, { backgroundColor: colors.connector }]}
                />
                {nodes.map((record, nodeIndex) => {
                  const near = nodeIndex === 0;
                  const left = nodeIndex % 2 === 0 ? 0 : 44;
                  const width = nodeIndex % 3 === 2 ? '86%' : '100%';
                  return (
                    <View
                      key={record.id}
                      style={[
                        styles.node,
                        {
                          marginLeft: left,
                          width,
                          borderTopColor: near ? colors.accent : colors.divider,
                          opacity: near ? 1 : DEPTH.recedeOpacity,
                        },
                      ]}
                    >
                      <Text style={[TYPOGRAPHY.caption, { color: colors.textFaint }]}>
                        {shortDate(record.capturedAt)}
                      </Text>
                      <Text
                        style={[
                          TYPOGRAPHY.body,
                          {
                            color: near ? colors.textPrimary : colors.textSecondary,
                            marginTop: SPACING.xs,
                          },
                        ]}
                      >
                        {record.verbatim ?? '（没有可显示的原话）'}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.relationFoot}>
                <Text style={[TYPOGRAPHY.caption, { color: colors.textFaint }]}>
                  你写下的理解
                </Text>
                <Text
                  testID={`exploration-reflection-${relation.id}`}
                  style={[
                    TYPOGRAPHY.reflection,
                    { color: colors.textPrimary, marginTop: SPACING.sm },
                  ]}
                >
                  {reflection?.verbatim ?? '（这条联系还没有你的文字回应）'}
                </Text>
                {relation.evidenceSummary.length > 0 ? (
                  <Text
                    style={[TYPOGRAPHY.caption, { color: colors.textMuted, marginTop: SPACING.md }]}
                  >
                    {relation.evidenceSummary}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })
      )}
      <Text style={[TYPOGRAPHY.caption, { color: colors.textFaint, marginTop: SPACING.section }]}>
        这是可能的结构，不是结论。
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingHorizontal: SPACING.screen,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xxl,
  },
  masthead: { marginBottom: SPACING.section },
  mastheadRule: { height: 1, marginTop: SPACING.md },
  relationBlock: {},
  relationBlockSpaced: {
    marginTop: SPACING.xxl,
    paddingTop: SPACING.section,
    borderTopWidth: 1,
  },
  relationHead: { flexDirection: 'row', alignItems: 'baseline' },
  field: {
    position: 'relative',
    marginTop: SPACING.section,
    paddingLeft: SPACING.md,
    gap: SPACING.section,
  },
  fieldAxis: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 1,
  },
  node: {
    borderTopWidth: 1,
    paddingTop: SPACING.sm,
    paddingRight: SPACING.sm,
  },
  relationFoot: {
    marginTop: SPACING.section,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
  },
});
