import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Integration tests, which run against the real MySQL database.
 *
 * Kept separate from `npm test` so the unit suite stays fast and needs no
 * database. Run with `npm run test:int`.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // See tests/server-only-stub.ts.
      'server-only': fileURLToPath(new URL('./tests/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.int.test.ts'],
    setupFiles: ['./tests/integration-setup.ts'],
    // These share one database, so they must not run concurrently.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
