import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '@repo/auth';
import { db, eq, schema } from '@repo/db';
import { app } from '../../src/app.js';
import { readLatestOtp } from '../helpers/auth.js';

const PHONE = '+919811200001';
const EMAIL = 'studio@example.com';

function post(path: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return app.request(`/api/auth${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', ...headers },
    body: JSON.stringify(body),
  });
}

const sendPhoneCode = (phoneNumber = PHONE, headers?: Record<string, string>) =>
  post('/phone-number/send-otp', { phoneNumber }, headers);
const verifyPhoneCode = (code: string, phoneNumber = PHONE) =>
  post('/phone-number/verify', { phoneNumber, code });
const sendEmailCode = (email = EMAIL) =>
  post('/email-otp/send-verification-otp', { email, type: 'sign-in' });
const signInWithEmailCode = (otp: string, email = EMAIL) =>
  post('/sign-in/email-otp', { email, otp });

const wrongCode = (code: string) => (code === '000000' ? '111111' : '000000');
const advanceSeconds = (seconds: number) => vi.setSystemTime(Date.now() + seconds * 1000);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-14T09:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('phone OTP limits', () => {
  it('keeps counting wrong guesses across resends and locks the number after ten', async () => {
    for (let round = 0; round < 3; round += 1) {
      expect((await sendPhoneCode()).status).toBe(200);
      const { code } = await readLatestOtp();
      for (let guess = 0; guess < 3; guess += 1) {
        expect((await verifyPhoneCode(wrongCode(code))).status).toBe(400);
      }
      advanceSeconds(61);
    }
    expect((await sendPhoneCode()).status).toBe(200);
    const { code } = await readLatestOtp();
    expect((await verifyPhoneCode(wrongCode(code))).status).toBe(400);

    const locked = await verifyPhoneCode(code);
    expect(locked.status).toBe(429);
    await expect(locked.json()).resolves.toMatchObject({
      code: 'OTP_LOCKED',
      message: 'Too many incorrect codes. Try again in 60 minutes.',
    });
    advanceSeconds(61);
    expect((await sendPhoneCode()).status).toBe(429);

    advanceSeconds(60 * 60);
    expect((await sendPhoneCode()).status).toBe(200);
    const fresh = await readLatestOtp();
    expect((await verifyPhoneCode(fresh.code)).status).toBe(200);
  });

  it('sends at most one code a minute and five an hour to a number', async () => {
    expect((await sendPhoneCode()).status).toBe(200);

    const tooSoon = await sendPhoneCode();
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.headers.get('retry-after')).toBe('60');
    await expect(tooSoon.json()).resolves.toMatchObject({
      code: 'OTP_SEND_LIMITED',
      message: 'Too many codes requested. Try again in 60 seconds.',
    });
    expect(await db.select().from(schema.verification)).toHaveLength(1);
    expect((await sendPhoneCode('+919811200002')).status).toBe(200);

    for (let send = 0; send < 4; send += 1) {
      advanceSeconds(61);
      expect((await sendPhoneCode()).status).toBe(200);
    }
    advanceSeconds(61);
    const sixth = await sendPhoneCode();
    expect(sixth.status).toBe(429);
    await expect(sixth.json()).resolves.toMatchObject({
      message: 'Too many codes requested. Try again in 55 minutes.',
    });

    advanceSeconds(60 * 60 - 5 * 61);
    expect((await sendPhoneCode()).status).toBe(200);
  });

  it('shares the limits with a freshly started auth instance', async () => {
    expect((await sendPhoneCode()).status).toBe(200);

    vi.resetModules();
    const { auth: restarted } = await import('@repo/auth');

    await expect(
      restarted.api.sendPhoneNumberOTP({ body: { phoneNumber: PHONE } }),
    ).rejects.toMatchObject({ statusCode: 429, body: { code: 'OTP_SEND_LIMITED' } });
  });

  it('refuses to send when the limit storage is unavailable', async () => {
    vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('connection refused'));

    const response = await sendPhoneCode();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'OTP_LIMIT_UNAVAILABLE' });
    expect(await db.select().from(schema.verification)).toHaveLength(0);
  });

  it('rejects malformed and unsupported numbers before storing or sending a code', async () => {
    for (const phoneNumber of ['not-a-phone', '+91 98112 00001', '+9198112', '+14155550123']) {
      const response = await sendPhoneCode(phoneNumber);
      expect(response.status, phoneNumber).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_PHONE_NUMBER' });
    }
    expect(await db.select().from(schema.verification)).toHaveLength(0);
  });

  it('does not expose password reset codes, which would bypass the guess limit', async () => {
    const paths = [
      '/phone-number/request-password-reset',
      '/phone-number/reset-password',
      '/email-otp/request-password-reset',
      '/email-otp/reset-password',
    ];
    for (const path of paths) {
      const response = await post(path, { phoneNumber: PHONE, email: EMAIL });
      expect(response.status, path).toBe(404);
    }
    expect(await db.select().from(schema.verification)).toHaveLength(0);
  });
});

describe('email OTP limits', () => {
  it('applies the same limits to an address regardless of letter case', async () => {
    expect((await sendEmailCode('Studio@Example.com')).status).toBe(200);
    expect((await sendEmailCode()).status).toBe(429);

    for (let round = 0; round < 3; round += 1) {
      for (let guess = 0; guess < 3; guess += 1) {
        expect((await signInWithEmailCode('000000')).status).toBe(400);
      }
      advanceSeconds(61);
      expect((await sendEmailCode()).status).toBe(200);
    }
    expect((await signInWithEmailCode('000000')).status).toBe(400);

    const locked = await signInWithEmailCode('000000');
    expect(locked.status).toBe(429);
    await expect(locked.json()).resolves.toMatchObject({ code: 'OTP_LOCKED' });
    advanceSeconds(61);
    expect((await sendEmailCode()).status).toBe(429);
  });
});

describe('wrong-guess lockout', () => {
  it('does not let guesses against an address with no live code lock it out', async () => {
    for (let guess = 0; guess < 12; guess += 1) {
      expect((await signInWithEmailCode('000000')).status).not.toBe(429);
    }
    expect((await sendEmailCode()).status).toBe(200);

    advanceSeconds(6 * 60);
    for (let guess = 0; guess < 12; guess += 1) {
      expect((await signInWithEmailCode('000000')).status).not.toBe(429);
    }
    advanceSeconds(61);
    expect((await sendEmailCode()).status).toBe(200);
  });
});

describe('per-IP auth limit', () => {
  it('counts requests in shared storage and gives spoofed forwarding chains no fresh bucket', async () => {
    const context = await auth.$context;
    context.rateLimit.enabled = true;
    try {
      const client = { 'x-forwarded-for': '203.0.113.7' };
      for (let index = 0; index < 10; index += 1) {
        expect((await sendPhoneCode(`+9198113000${index}0`, client)).status).toBe(200);
      }
      expect((await sendPhoneCode('+919811300099', client)).status).toBe(429);
      expect(
        await db
          .select()
          .from(schema.rateLimit)
          .where(eq(schema.rateLimit.key, '203.0.113.7|/phone-number/send-otp')),
      ).toHaveLength(1);

      for (let index = 0; index < 10; index += 1) {
        const spoofed = { 'x-forwarded-for': `198.51.100.${index}, 203.0.113.8` };
        await sendPhoneCode(`+9198114000${index}0`, spoofed);
      }
      const spoofed = { 'x-forwarded-for': '198.51.100.99, 203.0.113.8' };
      expect((await sendPhoneCode('+919811400099', spoofed)).status).toBe(429);
    } finally {
      context.rateLimit.enabled = false;
    }
  });
});
