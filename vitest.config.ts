import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@meridian/compiler': fileURLToPath(new URL('./packages/compiler/src/index.ts', import.meta.url)),
      meridian: fileURLToPath(new URL('./packages/meridian/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx'],
    globals: false,
  },
});
