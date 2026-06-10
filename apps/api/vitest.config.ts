import { defineConfig } from 'vitest/config';
import { integrationEnv } from '@repo/vitest-config/node';

/**
 * Two projects:
 *  - unit:        *.test.ts — pure, no DB, no infra (services via vi.mock).
 *  - integration: *.integration.test.ts — binds the singleton db/auth to the
 *    test DB (DATABASE_URL = DATABASE_URL_TEST), migrates once, truncates per test.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/server.ts'],
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
          // Dummy Google creds so socialProviders.google is configured for SSO tests.
          // vitest `env` sets real process.env, so dotenv won't override these — the suite
          // never uses the real .env creds and the token endpoint is mocked. CI-safe.
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
