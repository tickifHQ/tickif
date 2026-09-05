import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/index.js';

const environment = {
  NODE_ENV: 'production',
  BETTER_AUTH_SECRET: 'synthetic-auth-secret',
  BETTER_AUTH_URL: 'https://staging.example.com',
  R2_ACCESS_KEY_ID: 'synthetic-access',
  R2_SECRET_ACCESS_KEY: 'synthetic-secret',
  R2_BUCKET: 'staging-media',
};

describe('production R2 endpoint', () => {
  it.each([
    'http://localhost:9000',
    'https://localhost',
    'https://minio:9000',
    'https://127.0.0.1',
    'https://[::1]',
    'https://account.r2.cloudflarestorage.com',
    'http://account.r2.cloudflarestorage.com',
    'https://account.r2.cloudflarestorage.com.evil.example',
    'https://evil.example/account.r2.cloudflarestorage.com',
    'https://user:password@account.r2.cloudflarestorage.com',
    'https://account.r2.cloudflarestorage.com:9000',
    'https://account.r2.cloudflarestorage.com/bucket',
    'https://account.r2.cloudflarestorage.com?key=value',
    'https://account.r2.cloudflarestorage.com#fragment',
  ])('rejects %s', (R2_ENDPOINT) => {
    expect(() => parseConfig({ ...environment, R2_ENDPOINT })).toThrow('R2_ENDPOINT');
  });

  it('accepts the Cloudflare S3 origin and an omitted endpoint with a valid account label', () => {
    expect(() =>
      parseConfig({
        ...environment,
        R2_ENDPOINT: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
      }),
    ).not.toThrow();
    expect(() =>
      parseConfig({ ...environment, R2_ACCOUNT_ID: 'a'.repeat(32), R2_ENDPOINT: '' }),
    ).not.toThrow();
    expect(() => parseConfig({ ...environment, R2_ACCOUNT_ID: 'bad.example/path' })).toThrow(
      'R2_ACCOUNT_ID',
    );
  });

  it.each(['development', 'test'])('preserves local MinIO in %s', (NODE_ENV) => {
    expect(
      parseConfig({ ...environment, NODE_ENV, R2_ENDPOINT: 'http://localhost:9000' }).R2_ENDPOINT,
    ).toBe('http://localhost:9000');
  });
});
