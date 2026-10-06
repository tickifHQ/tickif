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

  it('removes database query/parameter text from wrappers, PostgreSQL causes and stacks', () => {
    const cause = Object.assign(new Error('duplicate value AlicePrivate for account'), {
      code: '23505', severity: 'ERROR', detail: 'Key (name)=(AlicePrivate) already exists',
    });
    Object.defineProperty(cause, 'stack', { value: `Error: ${cause.message}\n    at driver (/app/driver.ts:7:2)`, configurable: true });
    // Matches DrizzleQueryError: SQL and bound parameters are embedded in its message.
    const query = 'insert into verification (value) values ($1)';
    const error = Object.assign(new Error(`Failed query: ${query}\nparams: 123456`), {
      query, params: ['123456'], cause,
    });
    Object.defineProperty(error, 'stack', { value: `Error: Failed query: ${query}\nparams: 123456\n    at execute (/app/repository.ts:12:3)`, configurable: true });
    const encoded = JSON.stringify(sanitizeLogFields({ err: error }));
    expect(encoded).not.toContain('123456');
    expect(encoded).not.toContain('AlicePrivate');
    expect(encoded).not.toContain('insert into verification');
    expect(encoded).toContain('DatabaseQueryError');
    expect(encoded).toContain('DatabaseError');
    expect(encoded).toContain('23505');
    expect(encoded).toContain('at execute');
    expect(encoded).toContain('at driver');
  });

  it('suppresses database text copied into outer and aggregate errors recursively', () => {
    const database = Object.assign(new Error('database echoed PrivateCustomer'), { code: '42P01' });
    const wrapper = new Error('operation failed PrivateCustomer', { cause: database });
    const aggregate = new AggregateError([wrapper], 'batch failed PrivateCustomer');
    const encoded = JSON.stringify(sanitizeLogFields({ err: aggregate }));
    expect(encoded).not.toContain('PrivateCustomer');
    expect(encoded).toContain('Database operation failed');
  });

  it('retains builtin error categories without invoking custom name or database getters', () => {
    expect(sanitizeLogFields({ err: new TypeError('Invalid value') }).err).toMatchObject({ name: 'TypeError' });
    let calls = 0;
    const error = new Error('ordinary failure');
    for (const key of ['name', 'query', 'params', 'code', 'cause']) {
      Object.defineProperty(error, key, { get: () => { calls++; return 'private'; } });
    }
    sanitizeLogFields({ err: error });
    expect(calls).toBe(0);
  });

  it('does not mistake parameter text with fake frame lines for database call frames', () => {
    const message = 'Failed query: insert into verification values ($1)\nparams: \n    at PrivateCustomer (/private/value.ts:1:2)';
    const error = Object.assign(new Error(message), { query: 'insert into verification values ($1)', params: ['PrivateCustomer'] });
    Object.defineProperty(error, 'stack', { value: `Error: ${message}\n    at execute (/app/repository.ts:12:3)`, configurable: true });
    const encoded = JSON.stringify(sanitizeLogFields({ err: error }));
    expect(encoded).not.toContain('PrivateCustomer');
    expect(encoded).not.toContain('/private/value.ts');
    expect(encoded).toContain('at execute');
  });
});
