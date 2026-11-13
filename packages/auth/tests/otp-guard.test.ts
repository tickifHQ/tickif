import { describe, expect, it } from 'vitest';
import { isAllowedPhoneNumber, OTP_LIMITS, otpRefusal } from '../src/otp-guard.js';

const now = new Date('2026-11-14T09:00:00.000Z');
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);
const sends = (...secondsAgo: number[]) =>
  secondsAgo.map((seconds) => ({ kind: 'send' as const, createdAt: ago(seconds) }));
const wrongGuesses = (count: number, newestSecondsAgo: number) =>
  Array.from({ length: count }, (_, index) => ({
    kind: 'wrong_guess' as const,
    createdAt: ago(newestSecondsAgo + index),
  }));

describe('login code limits', () => {
  it('uses the product defaults', () => {
    expect(OTP_LIMITS).toEqual({
      sendCooldownSeconds: 60,
      sendsPerHour: 5,
      wrongGuessesPerDay: 10,
      lockoutSeconds: 3600,
    });
  });

  it('allows a send once the cooldown and the rolling hour have passed', () => {
    expect(otpRefusal(sends(59), 'send', now)?.body?.code).toBe('OTP_SEND_LIMITED');
    expect(otpRefusal(sends(60), 'send', now)).toBeNull();
    expect(otpRefusal(sends(3599, 900, 800, 700, 600), 'send', now)?.headers).toMatchObject({
      'Retry-After': '1',
    });
    expect(otpRefusal(sends(3600, 900, 800, 700, 600), 'send', now)).toBeNull();
  });

  it('locks sends and verification for an hour after ten wrong guesses in a day', () => {
    expect(otpRefusal(wrongGuesses(9, 0), 'verify', now)).toBeNull();
    expect(otpRefusal(wrongGuesses(10, 0), 'send', now)?.body).toMatchObject({
      code: 'OTP_LOCKED',
      message: 'Too many incorrect codes. Try again in 60 minutes.',
    });
    expect(otpRefusal(wrongGuesses(10, 3600), 'verify', now)).toBeNull();
  });

  it('locks again on each further wrong guess within the same day', () => {
    const attempts = [...wrongGuesses(10, 7200), ...wrongGuesses(1, 5)];
    expect(otpRefusal(attempts, 'verify', now)?.body?.code).toBe('OTP_LOCKED');
    expect(otpRefusal(wrongGuesses(10, 24 * 3600), 'verify', now)).toBeNull();
  });

  it('accepts only E.164 numbers in the allowed calling codes', () => {
    expect(isAllowedPhoneNumber('+919812345678')).toBe(true);
    expect(isAllowedPhoneNumber('919812345678')).toBe(false);
    expect(isAllowedPhoneNumber('+91 98123 45678')).toBe(false);
    expect(isAllowedPhoneNumber('+14155550123')).toBe(false);
  });
});
