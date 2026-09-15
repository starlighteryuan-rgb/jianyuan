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
import { useTheme } from '../theme/theme-context';
import { RADIUS, SPACING, TYPOGRAPHY } from '../theme/tokens';

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

export const ExplorationSpace = () => {
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
    setItems(resolved);
    setLoading(false);
  }, [runtime]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      testID="space-exploration"
      style={[styles.root, { backgroundColor: colors.canvas }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[TYPOGRAPHY.title, { color: colors.textPrimary }]}>探索</Text>
      <Text style={[TYPOGRAPHY.body, { color: colors.textSecondary, lineHeight: 24 }]}>
        这里展示已经通过 Core 判断的长期联系。打开页面不会发起新的 AI 推断。
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : items.length === 0 ? (
        <Text testID="exploration-empty" style={[TYPOGRAPHY.body, { color: colors.textMuted }]}>
          还没有长期联系。觉察得到你的自由文字回应并通过 Core 判断后，才会出现在这里。
        </Text>
      ) : (
        items.map((item) => {
          const relation = item.relation.subject;
          const reflection = item.target?.reflections[0] ?? null;
          return (
            <View
              key={relation.id}
              testID={`exploration-item-${relation.id}`}
              style={[
                styles.item,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.borderSubtle,
                  borderRadius: RADIUS.md,
                },
              ]}
            >
              <Text style={[TYPOGRAPHY.eyebrow, { color: colors.accent }]}>长期联系</Text>
              <Text style={[TYPOGRAPHY.lead, { color: colors.textPrimary, marginTop: SPACING.xs }]}>
                {relation.comparisonAxis.dimension}
              </Text>
              <Text style={[TYPOGRAPHY.body, { color: colors.textSecondary, marginTop: SPACING.sm }]}>
                {relation.evidenceSummary}
              </Text>
              <Text style={[TYPOGRAPHY.meta, { color: colors.textMuted, marginTop: SPACING.sm }]}>
                {formatDate(relation.createdAt)} · 依据 {relation.recordRefs.length} 条记录
              </Text>

              <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textMuted, marginTop: SPACING.md }]}>
                你写下的理解
              </Text>
              <Text
                testID={`exploration-reflection-${relation.id}`}
                style={[TYPOGRAPHY.body, { color: colors.textPrimary, lineHeight: 24, marginTop: SPACING.xs }]}
              >
                {reflection?.verbatim ?? '（这条联系还没有你的文字回应）'}
              </Text>

              <Text style={[TYPOGRAPHY.eyebrow, { color: colors.textMuted, marginTop: SPACING.md }]}>
                来源记录
              </Text>
              {item.sourceRecords.map((record) => (
                <Text
                  key={record.id}
                  style={[TYPOGRAPHY.meta, { color: colors.textSecondary, marginTop: SPACING.xs, lineHeight: 22 }]}
                >
                  · {record.verbatim ?? '（没有可显示的原话）'}
                </Text>
              ))}
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
});
