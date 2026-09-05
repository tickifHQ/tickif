import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TestProject } from 'vitest/node';
import { testEnv } from '@repo/vitest-config/node';

const mocks = vi.hoisted(() => ({ migrateTestDb: vi.fn() }));

vi.mock('@repo/db/testing', () => ({ migrateTestDb: mocks.migrateTestDb }));

import setup from './global-setup';

function project(): TestProject {
  return {
    config: {
      env: {
        ...testEnv(),
        DATABASE_URL: 'postgresql://tickif:tickif@localhost:5432/tickif_worker_test',
      },
    },
  } as unknown as TestProject;
}

describe('worker global setup cleanup', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('BETTER_AUTH_SECRET', 'runner-auth-secret-before-global-setup');
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3999');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('restores the runner environment when migration fails', async () => {
    mocks.migrateTestDb.mockRejectedValueOnce(new Error('migration failed'));

    await expect(setup(project())).rejects.toThrow('migration failed');

    expect(process.env.BETTER_AUTH_SECRET).toBe('runner-auth-secret-before-global-setup');
    expect(process.env.BETTER_AUTH_URL).toBe('http://localhost:3999');
  });
});
