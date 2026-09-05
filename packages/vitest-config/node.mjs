import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

/**
 * Shared Vitest base for Node packages/apps. Extend per package:
 *
 *   import { nodePreset } from '@repo/vitest-config/node';
 *   export default nodePreset();
 *
 * Pass overrides (e.g. globalSetup, setupFiles, env for integration tests).
 *
 * Authored as plain ESM (.mjs) so it loads on the project's minimum Node (20),
 * which cannot import `.ts` natively. Types live in node.d.ts.
 */
export function nodePreset(overrides = {}) {
  return defineConfig({
    test: {
      globals: true,
      environment: 'node',
      // Turbo also runs packages in parallel. Bound each package's CPU/memory use.
      maxWorkers: 2,
      include: ['tests/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        reportsDirectory: './coverage',
        include: ['src/**/*.ts'],
        exclude: ['src/**/index.ts', 'src/**/*.d.ts'],
      },
      ...overrides,
      env: { ...testEnv(), ...overrides.env },
    },
  });
}

/** Synthetic credentials for test runners only; application validation stays strict. */
export function testEnv() {
  return {
    NODE_ENV: 'test',
    BETTER_AUTH_SECRET: 'tickif-test-only-auth-secret-0000000000000000',
    BETTER_AUTH_URL: 'http://localhost:3000',
  };
}

/**
 * Vitest globalSetup runs outside test workers, before test.env is applied.
 * Install the project's environment before dynamically importing DB/auth modules.
 * Return a teardown that restores the runner's original environment.
 */
export function installTestEnv(environment) {
  if (environment.NODE_ENV !== 'test') throw new Error('Expected a test environment');
  const previous = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

/** Load the repo-root `.env` (walking up from cwd) so *_TEST vars are available. */
function loadRootEnv() {
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
 * then builds the URL from the POSTGRES_* parts (with a `_test` database name),
 * honouring an explicit `DATABASE_URL_TEST` override if one is set. The name
 * must end in `_test` — repository test helpers guard on this.
 *
 * Note: this intentionally rebuilds the URL from parts rather than importing
 * @repo/config, so loading the Vitest config never triggers full env validation.
 */
export function testDatabaseUrl() {
  loadRootEnv();
  if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST;
  const host = process.env.POSTGRES_HOST ?? 'localhost';
  const port = process.env.POSTGRES_PORT ?? '5432';
  const user = encodeURIComponent(process.env.POSTGRES_USER ?? 'tickif');
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? 'tickif');
  const database = process.env.POSTGRES_DB ?? 'tickif';
  return `postgresql://${user}:${password}@${host}:${port}/${database}_test`;
}

/**
 * A test database distinct from the api's, so the worker's integration suite never
 * shares (migrate/truncate) state with the api's when turbo runs both in parallel.
 */
export function workerTestDatabaseUrl() {
  return testDatabaseUrl().replace(/_test$/, '_worker_test');
}

/**
 * Resolve the test Redis URL. Mirrors the Postgres `_test` convention so
 * destructive queue cleanup targets a throwaway DB index, never the dev
 * default (`/0`). Defaults to a dedicated DB index.
 */
export function testRedisUrl() {
  loadRootEnv();
  return process.env.REDIS_URL_TEST ?? 'redis://localhost:6379/15';
}

/**
 * `test.env` block for integration suites: binds the @repo/db / @repo/auth
 * singletons to the test DB before @repo/config loads (dotenv won't override
 * these because real process env wins).
 */
export function integrationEnv() {
  return {
    ...testEnv(),
    DATABASE_URL: testDatabaseUrl(),
    REDIS_URL: testRedisUrl(),
  };
}
