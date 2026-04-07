import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['fixtures/next-app-router/tests/runtime.test.ts'],
    globals: false,
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
});
