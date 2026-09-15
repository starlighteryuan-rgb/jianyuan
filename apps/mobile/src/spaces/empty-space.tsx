/**
 * Honest empty-state space.
 *
 * M1 has no awareness/understanding/exploration logic wired. These spaces
 * therefore show their real state — nothing to show yet — and never fabricate a
 * card, a score, or a suggestion to look complete.
 *
 * WHY THIS MATTERS
 * A placeholder that renders invented content would violate the product's own
 * boundary: attention, relations, and hypotheses are candidates the user
 * confirms, and none of them may be manufactured for display. An empty state is
 * the truthful output of a system that has nothing to show.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/theme-context';
import { SPACING, TYPOGRAPHY } from '../theme/tokens';

export interface EmptySpaceProps {
  readonly spaceId: string;
  readonly title: string;
  readonly description: string;
}

export const EmptySpace = ({ spaceId, title, description }: EmptySpaceProps) => {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <ScrollView
      testID={`space-${spaceId}`}
      style={[styles.root, { backgroundColor: colors.canvas }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.block}>
        <Text style={[TYPOGRAPHY.title, { color: colors.textPrimary }]}>{title}</Text>
        <Text
          testID={`space-${spaceId}-empty`}
          style={[TYPOGRAPHY.body, { color: colors.textMuted, lineHeight: 26, marginTop: SPACING.sm }]}
        >
          {description}
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACING.lg },
  block: { paddingTop: SPACING.xl },
});
