import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['fixtures/next-app-router/tests/react-compiler.test.ts'],
    globals: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
