import { defineConfig } from 'vitest/config';

// Unit tests: no network, no database.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    exclude: ['src/**/*.int.spec.ts'],
  },
});
