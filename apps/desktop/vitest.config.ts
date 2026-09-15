import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['runtime/tests/**/*.test.ts', 'src/tests/**/*.test.ts'],
  },
});
