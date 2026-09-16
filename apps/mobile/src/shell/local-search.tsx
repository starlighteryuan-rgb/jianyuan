/**
 * Local, presentation-only search for the four primary Mobile spaces.
 *
 * The component never calls the Provider and never writes to Core or SQLite.
 * It only controls a transient query string; each space decides what local
 * collection is filtered.
 */

import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTheme } from '../theme/theme-context';
import { RADIUS, SPACING, TYPOGRAPHY } from '../theme/tokens';

export const LocalSearchControl = ({
  testID,
  placeholder,
  query,
  onChangeQuery,
  open,
  onOpenChange,
}: {
  readonly testID: string;
  readonly placeholder: string;
  readonly query: string;
  readonly onChangeQuery: (value: string) => void;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) => {
  const { theme } = useTheme();
  const { colors } = theme;

  if (!open) {
    return (
      <Pressable
        testID={`${testID}-open`}
        accessibilityRole="button"
        accessibilityLabel="搜索"
        onPress={() => onOpenChange(true)}
        style={[
          styles.button,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderSubtle,
            borderRadius: 999,
          },
        ]}
      >
        <Text style={[TYPOGRAPHY.lead, { color: colors.textSecondary }]}>⌕</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
      <TextInput
        testID={`${testID}-input`}
        value={query}
        onChangeText={onChangeQuery}
        autoFocus
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, TYPOGRAPHY.body, { color: colors.textPrimary }]}
      />
      {query.length > 0 ? (
        <Pressable
          testID={`${testID}-clear`}
          accessibilityRole="button"
          accessibilityLabel="清空搜索"
          onPress={() => onChangeQuery('')}
          style={styles.action}
        >
          <Text style={[TYPOGRAPHY.meta, { color: colors.textSecondary }]}>清空</Text>
        </Pressable>
      ) : null}
      <Pressable
        testID={`${testID}-cancel`}
        accessibilityRole="button"
        accessibilityLabel="取消搜索"
        onPress={() => {
          onChangeQuery('');
          onOpenChange(false);
        }}
        style={styles.action}
      >
        <Text style={[TYPOGRAPHY.meta, { color: colors.accent }]}>取消</Text>
      </Pressable>
    </View>
  );
};

export const matchesLocalQuery = (query: string, values: readonly (string | null | undefined)[]): boolean => {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0) return true;
  return values.some((value) => (value ?? '').toLocaleLowerCase().includes(needle));
};

const styles = StyleSheet.create({
  button: {
    width: 34,
    height: 34,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    minHeight: 38,
    flex: 1,
  },
  input: { flex: 1, minWidth: 80, paddingVertical: SPACING.xs },
  action: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
});
