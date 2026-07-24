import { parseConfig } from '@repo/config';
import { describe, expect, it } from 'vitest';

const productionEnvironment = {
  NODE_ENV: 'production',
  BETTER_AUTH_SECRET: 'production-auth-secret',
  BETTER_AUTH_URL: 'https://api.tickif.com',
  R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
  R2_ACCESS_KEY_ID: 'r2-access-key',
  R2_SECRET_ACCESS_KEY: 'r2-secret-key',
  R2_BUCKET: 'tickif-media',
} satisfies NodeJS.ProcessEnv;

describe('Typesense environment configuration', () => {
  it('requires explicit host and separate admin and search keys in production', () => {
    expect(() => parseConfig(productionEnvironment)).toThrow('TYPESENSE_HOST');

    expect(() =>
      parseConfig({
        ...productionEnvironment,
        TYPESENSE_HOST: 'https://search.tickif.com',
        TYPESENSE_API_KEY: 'production-admin-key',
      }),
    ).toThrow('TYPESENSE_SEARCH_API_KEY');

    expect(() =>
      parseConfig({
        ...productionEnvironment,
        TYPESENSE_HOST: 'https://search.tickif.com',
        TYPESENSE_API_KEY: 'production-shared-key',
        TYPESENSE_SEARCH_API_KEY: 'production-shared-key',
      }),
    ).toThrow('must differ from TYPESENSE_API_KEY');

    expect(() =>
      parseConfig({
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
  });
});
