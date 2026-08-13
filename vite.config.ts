import { defineConfig, type UserConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('./src/index.ts', import.meta.url));

export default defineConfig(({ command }): UserConfig => {
  // `npm run dev` serves the playground with the library aliased to source, so
  // edits hot-reload without a build step.
  if (command === 'serve') {
    return {
      root: 'examples/vanilla',
      resolve: { alias: { 'bg-9000': entry } },
      server: { open: true },
    };
  }

  // `npm run build` emits the distributable library.
  return {
    build: {
      lib: {
        entry,
        name: 'BG9000',
        fileName: (format) => (format === 'es' ? 'bg-9000.js' : 'bg-9000.cjs'),
        formats: ['es', 'cjs'],
      },
      sourcemap: true,
      target: 'es2022',
      emptyOutDir: true,
    },
    plugins: [dts({ include: ['src'], rollupTypes: true })],
  };
});
