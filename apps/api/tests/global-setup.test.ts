import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TestProject } from 'vitest/node';
import { testEnv } from '@repo/vitest-config/node';

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  migrateTestDb: vi.fn(),
  obliterate: vi.fn(),
}));

vi.mock('@repo/db/testing', () => ({ migrateTestDb: mocks.migrateTestDb }));
vi.mock('@repo/queue', () => ({ QUEUES: { sms: 'test-sms' } }));
vi.mock('bullmq', () => ({
  Queue: class {
    close = mocks.close;
    obliterate = mocks.obliterate;
  },
}));

import setup from './global-setup';

function project(): TestProject {
  return {
    config: {
      env: {
        ...testEnv(),
        DATABASE_URL: 'postgresql://tickif:tickif@localhost:5432/tickif_test',
        REDIS_URL: 'redis://localhost:6379/15',
      },
    },
  } as unknown as TestProject;
}

describe('API global setup cleanup', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.migrateTestDb.mockResolvedValue(undefined);
    mocks.obliterate.mockResolvedValue(undefined);
    mocks.close.mockResolvedValue(undefined);
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

  it('closes the Redis queue and restores the runner environment when cleanup fails', async () => {
    mocks.obliterate.mockRejectedValueOnce(new Error('redis failed'));

    await expect(setup(project())).rejects.toThrow('redis failed');

    expect(mocks.close).toHaveBeenCalledOnce();
    expect(process.env.BETTER_AUTH_SECRET).toBe('runner-auth-secret-before-global-setup');
    expect(process.env.BETTER_AUTH_URL).toBe('http://localhost:3999');
  });
});
