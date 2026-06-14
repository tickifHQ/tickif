import { defineConfig } from 'vitest/config';
import { integrationEnv, workerTestDatabaseUrl } from '@repo/vitest-config/node';

/**
 * Two projects:
 *  - unit:        *.test.ts — pure, no DB (storage/repository mocked).
 *  - integration: *.integration.test.ts — real test DB via @repo/db; R2 mocked
 *    in-memory. Migrates once, truncates per test.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts'],
    },
    projects: [
      {
        test: {
          name: 'unit',
          globals: true,
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/**/*.integration.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          fileParallelism: false,
          globals: true,
          environment: 'node',
          include: ['tests/**/*.integration.test.ts'],
          // Real sharp/AVIF encoding is CPU-bound and overruns the 5s default on slow CI runners.
          testTimeout: 30_000,
          hookTimeout: 30_000,
          env: {
            ...integrationEnv(),
            // Own DB so api + worker integration suites don't truncate each other under turbo.
            DATABASE_URL: workerTestDatabaseUrl(),
            GOOGLE_CLIENT_ID: 'test-google-client-id',
            GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
            BETTER_AUTH_URL: 'http://localhost:3000',
          },
          globalSetup: ['./tests/global-setup.ts'],
          setupFiles: ['./tests/setup.ts'],
        },
      },
    ],
  },
});
