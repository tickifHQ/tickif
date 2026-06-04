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

/**
 * Resolve the test database URL at config-eval time. Loads the repo-root `.env`
 * then builds the URL from the POSTGRES_* parts (with a `_test` database name),
 * honouring an explicit `DATABASE_URL_TEST` override if one is set. The name
 * must end in `_test` — repository test helpers guard on this.
 *
 * Note: this intentionally rebuilds the URL from parts rather than importing
 * @repo/config, so loading the Vitest config never triggers full env validation.
 */
export function testDatabaseUrl(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate });
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST;
  const host = process.env.POSTGRES_HOST ?? 'localhost';
  const port = process.env.POSTGRES_PORT ?? '5432';
  const user = encodeURIComponent(process.env.POSTGRES_USER ?? 'tickif');
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? 'tickif');
  const database = process.env.POSTGRES_DB ?? 'tickif';
  return `postgresql://${user}:${password}@${host}:${port}/${database}_test`;
}

/**
 * `test.env` block for integration suites: binds the @repo/db / @repo/auth
 * singletons to the test DB before @repo/config loads (dotenv won't override
 * these because real process env wins).
 */
export function integrationEnv(): Record<string, string> {
  return { NODE_ENV: 'test', DATABASE_URL: testDatabaseUrl() };
}
