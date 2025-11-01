import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Make vitest resolve globs relative to this app directory
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [tsconfigPaths()],

  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    globals: true,
    coverage: { provider: 'v8' },
  },
});
