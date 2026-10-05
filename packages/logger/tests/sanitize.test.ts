import { describe, expect, it } from 'vitest';
import { sanitizeLogFields, sanitizeText } from '../src/index.js';

describe('shared sanitizer', () => {
  it('removes private keys at any supported depth and scrubs strings', () => {
    const result = sanitizeLogFields({
      nested: { Password: 'do-not-export', auth_token: 'do-not-export', cookie: 'do-not-export', safe: true },
      message: 'Failure https://storage.example/object?token=do-not-export person@example.com +919876543210 bearer do-not-export',
      q: 'private search', payload: { code: '123456' },
      R2_SECRET_ACCESS_KEY: 'do-not-export', SIGNOZ_INGESTION_KEY: 'do-not-export',
    });
    const encoded = JSON.stringify(result);
    expect(encoded).not.toContain('do-not-export');
    expect(encoded).not.toContain('private search');
    expect(encoded).not.toContain('123456');
    expect(encoded).not.toContain('9876543210');
    expect(result.nested).toEqual({ safe: true });
  });

  it('normalizes cyclic data without invoking getters or exposing provider error metadata', () => {
    let calls = 0;
    const value: Record<string, unknown> = { count: 2n, infinity: Infinity };
    value.self = value;
    Object.defineProperty(value, 'getter', { enumerable: true, get: () => { calls++; return 'unsafe'; } });
    const error = new Error('Unable to reach https://user:credential@example.com/api');
    Object.assign(error, { request: { body: 'do-not-export' }, secret: 'do-not-export' });
    const result = sanitizeLogFields({ value, err: error });
    expect(calls).toBe(0);
    expect(result.value).toEqual({ count: '2', infinity: null, self: '[Circular]' });
    expect(JSON.stringify(result.err)).not.toContain('credential');
    expect(JSON.stringify(result.err)).not.toContain('do-not-export');
  });

  it('bounds deep and wide data and tolerates revoked proxies', () => {
    const values = Array.from({ length: 100 }, () => 'x'.repeat(10_000));
    const result = sanitizeLogFields({ values });
    expect(Array.isArray(result.values) && result.values.length).toBe(20);
    expect(Array.isArray(result.values) && String(result.values[0]).length).toBe(2_048);
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(sanitizeLogFields(proxy)).toEqual({ serialization_failed: true });
  });

  it('scrubs OTP text and control characters without changing event names', () => {
    expect(sanitizeText('OTP is 123456')).toBe('[OTP]');
    expect(sanitizeText('OTP for +919876543210: 123456')).toBe('[OTP]');
    expect(sanitizeText('worker.job.failed')).toBe('worker.job.failed');
    expect(sanitizeText('before\u0000after')).toBe('before after');
  });

  it('preserves full valid UUID context while still removing phone numbers', () => {
    const requestId = '12345678-1234-4234-8234-123456789012';
    expect(sanitizeText(requestId)).toBe(requestId);
    expect(sanitizeLogFields({ requestId })).toEqual({ requestId });
    expect(sanitizeText('+919876543210')).toBe('[PHONE]');
    expect(sanitizeText('98765-43210')).toBe('[PHONE]');
    expect(sanitizeText('12345678-1234-0234-0234-123456789012')).not.toBe('12345678-1234-0234-0234-123456789012');
  });

  it('preserves canonical UTC timestamps without exempting phone prose', () => {
    const timestamp = '2026-10-05T12:00:00.000Z';
    expect(sanitizeText(timestamp)).toBe(timestamp);
    expect(sanitizeLogFields({ browserTimestamp: timestamp })).toEqual({ browserTimestamp: timestamp });
    expect(sanitizeText('Call +919876543210 on 2026-10-05')).not.toContain('9876543210');
    expect(sanitizeText('2026-10-05T12:00:00.000Z extra +919876543210')).not.toContain('9876543210');
  });
});
