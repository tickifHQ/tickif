import { describe, expect, it } from 'vitest';
import { assertProductionEmailConfig, parseConfig } from '../src/index.js';

const productionEnvironment = {
  NODE_ENV: 'production',
  BETTER_AUTH_SECRET: 'production-auth-secret',
  BETTER_AUTH_URL: 'https://api.tickif.com',
  R2_ENDPOINT: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
  R2_ACCESS_KEY_ID: 'r2-access-key',
  R2_SECRET_ACCESS_KEY: 'r2-secret-key',
  R2_BUCKET: 'tickif-media',
} satisfies NodeJS.ProcessEnv;

describe('email environment configuration', () => {
  it('requires an explicit Resend API key in production', () => {
    expect(() => assertProductionEmailConfig(productionEnvironment)).toThrow(
      'RESEND_API_KEY: required when NODE_ENV=production',
    );
    expect(() =>
      assertProductionEmailConfig({
        ...productionEnvironment,
        RESEND_API_KEY: '   ',
        EMAIL_FROM: 'Tickif <hello@tickif.com>',
      }),
    ).toThrow('RESEND_API_KEY: required when NODE_ENV=production');
  });

  it('accepts explicit Resend credentials in production', () => {
    const environment = {
      ...productionEnvironment,
      RESEND_API_KEY: 'resend-production-key',
      EMAIL_FROM: 'Tickif <hello@tickif.com>',
    };
    const parsed = parseConfig(environment);

    expect(() => assertProductionEmailConfig(environment)).not.toThrow();
    expect(parsed.RESEND_API_KEY).toBe('resend-production-key');
    expect(parsed.EMAIL_FROM).toBe('Tickif <hello@tickif.com>');
  });

  it('rejects missing, malformed, and placeholder production senders', () => {
    expect(() =>
      assertProductionEmailConfig({
        ...productionEnvironment,
        RESEND_API_KEY: 'resend-production-key',
        EMAIL_FROM: '   ',
      }),
    ).toThrow('EMAIL_FROM: required when NODE_ENV=production');
    expect(() =>
      assertProductionEmailConfig({
        ...productionEnvironment,
        RESEND_API_KEY: 'resend-production-key',
        EMAIL_FROM: 'noreply',
      }),
    ).toThrow('EMAIL_FROM: must be an email address');
    expect(() =>
      assertProductionEmailConfig({
        ...productionEnvironment,
        RESEND_API_KEY: 'resend-production-key',
        EMAIL_FROM: 'Tickif <noreply@tickif.com>',
      }),
    ).toThrow('EMAIL_FROM: must not use the checked-in placeholder in production');
  });

  it('preserves the credential-free development fallback', () => {
    const parsed = parseConfig({
      NODE_ENV: 'development',
      BETTER_AUTH_SECRET: 'development-auth-secret',
      BETTER_AUTH_URL: 'http://localhost:3001',
      RESEND_API_KEY: '',
    });

    expect(parsed.RESEND_API_KEY).toBeUndefined();
    expect(parsed.EMAIL_FROM).toBe('Tickif <noreply@tickif.com>');
  });

  it('does not require email credentials in production processes that do not send email', () => {
    expect(() => parseConfig(productionEnvironment)).not.toThrow();
  });
});
