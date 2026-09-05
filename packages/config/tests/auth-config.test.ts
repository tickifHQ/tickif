import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installTestEnv,
  integrationEnv,
  nodePreset,
  testEnv,
  workerTestDatabaseUrl,
} from '@repo/vitest-config/node';
import { config, parseConfig } from '../src/index.js';

afterEach(() => vi.unstubAllEnvs());

describe('test auth environment', () => {
  it('boots the config singleton without a developer .env or exported auth credentials', () => {
    expect(config.NODE_ENV).toBe('test');
    expect(config.BETTER_AUTH_SECRET).toBe(testEnv().BETTER_AUTH_SECRET);
    expect(config.BETTER_AUTH_URL).toBe('http://localhost:3000');
  });

  it.each(['development', 'test', 'production'])(
    'still rejects missing auth credentials in %s',
    (mode) => {
      expect(() => parseConfig({ NODE_ENV: mode })).toThrow('BETTER_AUTH_SECRET');
      expect(() =>
        parseConfig({ NODE_ENV: mode, BETTER_AUTH_SECRET: testEnv().BETTER_AUTH_SECRET }),
      ).toThrow('BETTER_AUTH_URL');
    },
  );

  it('preserves shared credentials when a package supplies its own service stubs', () => {
    const preset = nodePreset({ env: { R2_BUCKET: 'test-bucket' } });
    expect(preset.test?.env).toEqual({ ...testEnv(), R2_BUCKET: 'test-bucket' });
  });

  it('binds API and worker databases separately and honors the test Redis target', () => {
    vi.stubEnv('DATABASE_URL_TEST', 'postgresql://test:test@localhost:5432/isolated_test');
    vi.stubEnv('REDIS_URL_TEST', 'redis://localhost:6379/13');
    expect(integrationEnv()).toEqual({
      ...testEnv(),
      DATABASE_URL: 'postgresql://test:test@localhost:5432/isolated_test',
      REDIS_URL: 'redis://localhost:6379/13',
    });
    expect(workerTestDatabaseUrl()).toBe(
      'postgresql://test:test@localhost:5432/isolated_worker_test',
    );
  });

  it('installs credentials before a global-setup config import and restores the runner afterwards', async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'previous-test-runner-auth-secret');
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3001');
    const restore = installTestEnv(testEnv());
    try {
      vi.resetModules();
      const initialized = await import('../src/index.js');
      expect(initialized.config.BETTER_AUTH_SECRET).toBe(testEnv().BETTER_AUTH_SECRET);
    } finally {
      restore();
    }
    vi.resetModules();
    const restored = await import('../src/index.js');
    expect(restored.config.BETTER_AUTH_SECRET).toBe('previous-test-runner-auth-secret');
    expect(restored.config.BETTER_AUTH_URL).toBe('http://localhost:3001');
  });
});
