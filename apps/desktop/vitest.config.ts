import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['src/tests/**/*.test.tsx', 'jsdom'],
    ],
    include: ['runtime/tests/**/*.test.ts', 'src/tests/**/*.test.ts', 'src/tests/**/*.test.tsx'],
  },
});
