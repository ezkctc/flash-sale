import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// The issue is likely that the previous 'include' pattern ('src/**/*.{test,spec}.ts')
// was too restrictive for a project structure where test files are nested deeply,
// such as within an 'apps/' directory.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    // UPDATED: Using '**/*.{test,spec}.ts' ensures that Vitest finds test files
    // anywhere in the project structure, including 'apps/api/src/app/routes/'.
    include: ['**/*.{test,spec}.ts'],
    exclude: [
      '**/node_modules/**', // Removed leading space
      '**/dist/**', // Removed leading space
      '**/cypress/**', // Removed leading space
      '**/.{idea,git,cache,output,temp}/**', // Removed leading space
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*', // Removed leading space
    ],
    globals: true,
    coverage: { provider: 'v8' },
  },
});
