import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/index.js';

const productionEnvironment = {
  NODE_ENV: 'production',
  BETTER_AUTH_SECRET: 'production-auth-secret',
  BETTER_AUTH_URL: 'https://api.tickif.com',
  R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
  R2_ACCESS_KEY_ID: 'r2-access-key',
  R2_SECRET_ACCESS_KEY: 'r2-secret-key',
  R2_BUCKET: 'tickif-media',
} satisfies NodeJS.ProcessEnv;

describe('email environment configuration', () => {
  it('requires an explicit Resend API key in production', () => {
    expect(() => parseConfig(productionEnvironment)).toThrow('RESEND_API_KEY');
    expect(() =>
      parseConfig({
        ...productionEnvironment,
        RESEND_API_KEY: '   ',
      }),
    ).toThrow('RESEND_API_KEY');
  });

  it('accepts explicit Resend credentials in production', () => {
    const parsed = parseConfig({
      ...productionEnvironment,
      RESEND_API_KEY: 'resend-production-key',
      EMAIL_FROM: 'Tickif <hello@tickif.com>',
    });

    expect(parsed.RESEND_API_KEY).toBe('resend-production-key');
    expect(parsed.EMAIL_FROM).toBe('Tickif <hello@tickif.com>');
  });

  it('rejects an empty sender value', () => {
    expect(() =>
      parseConfig({
        ...productionEnvironment,
        RESEND_API_KEY: 'resend-production-key',
        EMAIL_FROM: '   ',
      }),
    ).toThrow('EMAIL_FROM');
  });

  it('preserves the credential-free development fallback', () => {
    const parsed = parseConfig({
      NODE_ENV: 'development',
      BETTER_AUTH_SECRET: 'development-auth-secret',
      BETTER_AUTH_URL: 'http://localhost:3001',
    });

    expect(parsed.RESEND_API_KEY).toBeUndefined();
    expect(parsed.EMAIL_FROM).toBe('Tickif <noreply@tickif.com>');
  });
});
