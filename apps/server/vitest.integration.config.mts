import { defineConfig } from 'vitest/config';

// Integration tests: run against the board-games-dev database (DATABASE_URL from .env.dev).
export default defineConfig({
  test: {
    include: ['src/**/*.int.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
