import { defineConfig } from 'vitest/config';
import { integrationEnv } from '@repo/vitest-config/node';

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
          env: {
            ...integrationEnv(),
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
