import { describe, expect, it } from 'vitest';
import { assertProductionSearchConfig, parseConfig } from '../src/index.js';

const productionEnvironment = {
  NODE_ENV: 'production',
  BETTER_AUTH_SECRET: 'production-auth-secret',
  BETTER_AUTH_URL: 'https://api.tickif.com',
  R2_ENDPOINT: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
  R2_ACCESS_KEY_ID: 'r2-access-key',
  R2_SECRET_ACCESS_KEY: 'r2-secret-key',
  R2_BUCKET: 'tickif-media',
  RESEND_API_KEY: 'resend-production-key',
} satisfies NodeJS.ProcessEnv;

describe('Typesense environment configuration', () => {
  it.each([
    [{}, false],
    [{ TYPESENSE_HOST: 'http://localhost:8108' }, false],
    [{ TYPESENSE_SEARCH_API_KEY: 'synthetic-search-key' }, false],
    [{ TYPESENSE_HOST: 'http://localhost:8108', TYPESENSE_API_KEY: 'synthetic-admin-key' }, false],
    [
      { TYPESENSE_HOST: 'http://localhost:8108', TYPESENSE_SEARCH_API_KEY: 'synthetic-search-key' },
      true,
    ],
  ])(
    'detects explicit search configuration before applying defaults',
    (searchEnvironment, expected) => {
      const parsed = parseConfig({
        NODE_ENV: 'test',
        BETTER_AUTH_SECRET: 'synthetic-auth-secret',
        BETTER_AUTH_URL: 'http://localhost:3001',
        ...searchEnvironment,
      });

      expect(parsed.TYPESENSE_SEARCH_CONFIGURED).toBe(expected);
    },
  );

  it('does not make unrelated production processes depend on search credentials', () => {
    expect(() => parseConfig(productionEnvironment)).not.toThrow();
  });

  it('requires explicit host and separate admin and search keys at the search boundary', () => {
    expect(() => assertProductionSearchConfig(productionEnvironment)).toThrow('TYPESENSE_HOST');

    expect(() =>
      assertProductionSearchConfig({
        ...productionEnvironment,
        TYPESENSE_HOST: 'https://search.tickif.com',
        TYPESENSE_API_KEY: 'production-admin-key',
      }),
    ).toThrow('TYPESENSE_SEARCH_API_KEY');

    expect(() =>
      assertProductionSearchConfig({
        ...productionEnvironment,
        TYPESENSE_HOST: 'https://search.tickif.com',
        TYPESENSE_API_KEY: 'production-shared-key',
        TYPESENSE_SEARCH_API_KEY: 'production-shared-key',
      }),
    ).toThrow('must differ from TYPESENSE_API_KEY');

    expect(() =>
      assertProductionSearchConfig({
        ...productionEnvironment,
        TYPESENSE_HOST: 'https://search.tickif.com',
        TYPESENSE_API_KEY: 'production-admin-key',
        TYPESENSE_SEARCH_API_KEY: 'tickif-local-typesense-key',
      }),
    ).toThrow('must not use the checked-in local credential');
  });

  it('keeps local defaults for development', () => {
    const parsed = parseConfig({
      NODE_ENV: 'development',
      BETTER_AUTH_SECRET: 'development-auth-secret',
      BETTER_AUTH_URL: 'http://localhost:3001',
    });

    expect(parsed.TYPESENSE_HOST).toBe('http://localhost:8108');
    expect(parsed.TYPESENSE_API_KEY).toBe('tickif-local-typesense-key');
    expect(parsed.TYPESENSE_SEARCH_API_KEY).toBe('tickif-local-typesense-key');
    expect(parsed.SEARCH_WORKER_CONCURRENCY).toBe(4);
    expect(parsed.R2_VERIFICATION_DOWNLOAD_URL_EXPIRY_SECONDS).toBe(60);
    expect(() =>
      assertProductionSearchConfig({
        NODE_ENV: 'development',
      }),
    ).not.toThrow();
  });

  it('accepts a positive search worker concurrency override', () => {
    const parsed = parseConfig({
      NODE_ENV: 'development',
      BETTER_AUTH_SECRET: 'development-auth-secret',
      BETTER_AUTH_URL: 'http://localhost:3001',
      SEARCH_WORKER_CONCURRENCY: '8',
    });

    expect(parsed.SEARCH_WORKER_CONCURRENCY).toBe(8);
  });
});
