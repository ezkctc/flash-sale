import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),

  plugins: [tsconfigPaths()],

  test: {
    environment: 'jsdom',

    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    globals: true,
    coverage: { provider: 'v8' },
  },
});
