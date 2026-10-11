import { describe, expect, it } from 'vitest';
import { formatBytes, parseConfig } from '../src/index.js';

const environment = {
  NODE_ENV: 'production',
  BETTER_AUTH_SECRET: 'synthetic-auth-secret',
  BETTER_AUTH_URL: 'https://staging.example.com',
  R2_ACCESS_KEY_ID: 'synthetic-access',
  R2_SECRET_ACCESS_KEY: 'synthetic-secret',
  R2_BUCKET: 'staging-media',
};

describe('watermark configuration', () => {
  it('defaults to the image-page watermark and a new cache revision', () => {
    expect(parseConfig({ ...environment, NODE_ENV: 'test' })).toMatchObject({
      WATERMARK_ENABLED: true,
      WATERMARK_OPACITY: 1,
      WATERMARK_SCALE: 0.0432,
      WATERMARK_REVISION: 'wm-v6',
    });
  });

  it.each(['0.21', '0.3'])('accepts the previously supported scale %s', (WATERMARK_SCALE) => {
    expect(parseConfig({ ...environment, NODE_ENV: 'test', WATERMARK_SCALE }).WATERMARK_SCALE).toBe(
      Number(WATERMARK_SCALE),
    );
  });
});

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

describe('formatBytes', () => {
  it('renders the media upload default as a human-readable size', () => {
    // The limit users were shown as "15000000 bytes" now reads as "15 MB".
    expect(formatBytes(15_000_000)).toBe('15 MB');
  });

  it.each([
    [0, '0 bytes'],
    [512, '512 bytes'],
    [1_000, '1 KB'],
    [5_000_000, '5 MB'],
    [10_000_000, '10 MB'],
    [1_000_000_000, '1 GB'],
    [1_000_000_000_000, '1 TB'],
  ])('formats %d bytes as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it('rounds to at most one decimal place and keeps the largest unit', () => {
    expect(formatBytes(1_500_000)).toBe('1.5 MB');
    expect(formatBytes(1_234_567)).toBe('1.2 MB');
  });

  it('falls back to the raw value for invalid input', () => {
    expect(formatBytes(-1)).toBe('-1');
    expect(formatBytes(Number.NaN)).toBe('NaN');
  });
});
