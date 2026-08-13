import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts: that config's `serve` branch re-roots at
// the playground so the dev server can run, which would hide src/ from Vitest.
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'node',
  },
});
