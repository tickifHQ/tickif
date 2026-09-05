import { describe, expect, it } from 'vitest';
import { buildE2eEnvironment } from '../src/e2e';

describe('isolated E2E environment', () => {
  it('uses synthetic providers and isolated stores without touching default dev stores', () => {
    const env = buildE2eEnvironment({});
    expect(env.DATABASE_URL).toBe(env.DATABASE_URL_TEST);
    expect(env.DATABASE_URL).toContain('stage12_test');
    expect(env.REDIS_URL).toBe('redis://localhost:6379/12');
    expect(env.TYPESENSE_COLLECTION_PREFIX).toBe('tickif_e2e');
    expect(env.RESEND_API_KEY).toBe('re_tickif_e2e_provider_double');
  });
  it.each([
    { NODE_ENV: 'production' },
    { DATABASE_URL_TEST: 'postgresql://tickif:tickif@localhost:5432/tickif' },
    { DATABASE_URL_TEST: 'postgresql://tickif:tickif@production.example:5432/tickif_test' },
    { DATABASE_URL: 'postgresql://tickif:tickif@localhost:5432/tickif' },
    { REDIS_URL_TEST: 'redis://localhost:6379/0' },
    { TYPESENSE_COLLECTION_PREFIX: 'tickif' },
    { R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com' },
    { R2_BUCKET: 'production' },
    { PUBLIC_WEB_URL: 'http://localhost:3001' },
  ])('refuses an unsafe environment %j', (environment) => {
    expect(() => buildE2eEnvironment(environment)).toThrow();
  });
});
