import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('web feature configuration', () => {
  it('loads in production without backend credentials', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BETTER_AUTH_SECRET', undefined);
    vi.stubEnv('BETTER_AUTH_URL', undefined);
    vi.stubEnv('CONSULTATIONS_ENABLED', undefined);
    const { config } = await import('../src/features.js');
    expect(config.CONSULTATIONS_ENABLED).toBe(false);
  });

  it('validates explicit feature values and defaults to disabled', async () => {
    const { parseFeatureFlags } = await import('../src/features.js');
    expect(parseFeatureFlags({}).CONSULTATIONS_ENABLED).toBe(false);
    expect(parseFeatureFlags({ CONSULTATIONS_ENABLED: 'true' }).CONSULTATIONS_ENABLED).toBe(true);
    expect(parseFeatureFlags({ CONSULTATIONS_ENABLED: 'false' }).CONSULTATIONS_ENABLED).toBe(false);
    expect(() => parseFeatureFlags({ CONSULTATIONS_ENABLED: 'invalid' })).toThrow(
      'Invalid CONSULTATIONS_ENABLED',
    );
  });
});
