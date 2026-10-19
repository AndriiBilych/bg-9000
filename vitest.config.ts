import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts: that config's `serve` branch re-roots at
// the playground so the dev server can run, which would hide src/ from Vitest.
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Lets a test exercise an example, which imports the package by name.
    alias: { 'bg-9000': fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.{test,spec}.ts', 'examples/**/*.{test,spec}.ts'],
    environment: 'node',
  },
});
