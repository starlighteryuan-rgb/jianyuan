import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Mobile test configuration.
 *
 * Separate from the root vitest.config.ts on purpose: the root config includes
 * only `tests/**` relative to the repository root and resolves nothing outside
 * it, while these tests import straight from `packages/core` and run against a
 * real `node:sqlite` file. Mobile owns its own runner rather than widening the
 * root include list.
 *
 * The environment is `node`, not jsdom. That is the point of the driver seam in
 * src/storage/sql-driver.ts: the adapter's real SQL executes against real
 * SQLite here, so persistence, restart behaviour, and ordering are verified for
 * real rather than asserted about a mock.
 *
 * Component tests additionally alias `react-native` to a host-primitive double
 * (tests/support/react-native-double.tsx). React Native 0.86 ships Flow-typed
 * entry source that Vite cannot parse; the double substitutes only the rendering
 * primitives, so the components under test are the real ones.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@jianyuan/core': fileURLToPath(new URL('../../packages/core/index.ts', import.meta.url)),
      'react-native': fileURLToPath(
        new URL('./tests/support/react-native-double.tsx', import.meta.url),
      ),
      'react-native-reanimated': fileURLToPath(
        new URL('./tests/support/reanimated-double.ts', import.meta.url),
      ),
    },
  },
});
