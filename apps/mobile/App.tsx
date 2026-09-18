/**
 * App entry.
 *
 * Startup is asynchronous (opening the SQLite file, running migrations, probing
 * the Keychain), so the app paints a themed loading state and then either the
 * shell or a fatal state.
 *
 * WHY A FAILED DATABASE OPEN IS FATAL
 * There is nowhere to persist a Record if the database cannot be opened. Showing
 * a working-looking Record screen in that state would accept the user's words and
 * silently discard them, so the app says what happened instead.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { bootstrapMobileRuntime } from './src/runtime/bootstrap';
import type { MobileRuntime } from './src/runtime/mobile-runtime';
import { AppShell } from './src/shell/app-shell';
import { RuntimeProvider } from './src/shell/runtime-context';
import { ThemeProvider } from './src/theme/theme-context';
import { MOBILE_THEME_STORAGE } from './src/theme/theme-storage';
import { DARK_COLORS, LIGHT_COLORS, SPACING, TYPOGRAPHY } from './src/theme/tokens';

/** Themed wrapper for states that exist before or without a runtime. */
const Centered = ({ children }: { readonly children: ReactNode }) => (
  <SafeAreaView style={[styles.root, { backgroundColor: LIGHT_COLORS.canvas }]}>
    <View style={styles.center}>{children}</View>
  </SafeAreaView>
);

export default function App() {
  const [runtime, setRuntime] = useState<MobileRuntime | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const bootstrapped = await bootstrapMobileRuntime();
        if (!cancelled) setRuntime(bootstrapped.runtime);
      } catch (error) {
        if (!cancelled) {
          setFailure(error instanceof Error ? error.message : String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failure !== null) {
    return (
      <Centered>
        <Text testID="startup-failure" style={[TYPOGRAPHY.title, { color: DARK_COLORS.danger }]}>
          数据库无法打开
        </Text>
        <Text style={[TYPOGRAPHY.meta, { color: LIGHT_COLORS.textMuted, marginTop: SPACING.sm }]}>
          {failure}
        </Text>
      </Centered>
    );
  }

  if (runtime === null) {
    return (
      <Centered>
        <ActivityIndicator testID="startup-loading" color={LIGHT_COLORS.accent} />
      </Centered>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider storage={MOBILE_THEME_STORAGE}>
        <RuntimeProvider runtime={runtime}>
          <AppShell />
        </RuntimeProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
});
