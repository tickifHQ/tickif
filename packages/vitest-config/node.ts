import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig, type ViteUserConfig } from 'vitest/config';

/**
 * Shared Vitest base for Node packages/apps. Extend per package:
 *
 *   import { nodePreset } from '@repo/vitest-config/node';
 *   export default nodePreset();
 *
 * Pass overrides (e.g. globalSetup, setupFiles, env for integration tests).
 */
export function nodePreset(overrides: ViteUserConfig['test'] = {}): ViteUserConfig {
  return defineConfig({
    test: {
      globals: true,
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        reportsDirectory: './coverage',
        include: ['src/**/*.ts'],
        exclude: ['src/**/index.ts', 'src/**/*.d.ts'],
      },
      ...overrides,
    },
  });
}

/** Load the repo-root `.env` (walking up from cwd) so *_TEST vars are available. */
function loadRootEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

/**
 * Resolve the test database URL at config-eval time. Loads the repo-root `.env`
 * (so `DATABASE_URL_TEST` is picked up if set), falling back to the docker
 * default. The name must end in `_test` — repository test helpers guard on this.
 */
export function testDatabaseUrl(): string {
  loadRootEnv();
  return (
    process.env.DATABASE_URL_TEST ??
    'postgresql://tickif:tickif@localhost:5432/tickif_test'
  );
}

/**
 * Resolve the test Redis URL. Mirrors the Postgres `_test` convention so
 * destructive queue cleanup targets a throwaway DB index, never the dev
 * default (`/0`). Defaults to a dedicated DB index.
 */
export function testRedisUrl(): string {
  loadRootEnv();
  return process.env.REDIS_URL_TEST ?? 'redis://localhost:6379/15';
}

/**
 * `test.env` block for integration suites: binds the @repo/db / @repo/auth
 * singletons to the test DB before @repo/config loads (dotenv won't override
 * these because real process env wins).
 */
export function integrationEnv(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: testDatabaseUrl(),
    REDIS_URL: testRedisUrl(),
  };
}
