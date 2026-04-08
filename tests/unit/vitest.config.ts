import { defineConfig } from '../integration/node_modules/vitest/dist/config.js';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    testTimeout: 30_000,
  },
});
