import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { auth, getSession } from '@repo/auth';
import { db, schema } from '@repo/db';
import { createAuthedSession, readLatestOtp, expireLatestOtp } from '../helpers/auth.js';

const PHONE = '+919800000010';

describe('phone OTP (E-85)', () => {
  it('send → verify → establishes a session for the user', async () => {
    const { cookie, phoneNumber } = await createAuthedSession(PHONE);
    const session = await getSession(new Headers({ cookie }));

    expect(session).not.toBeNull();
    expect(session!.user.phoneNumber).toBe(phoneNumber);
    expect(session!.user.phoneNumberVerified).toBe(true);
  });

  it('verifies the correct code even after an earlier wrong attempt (within the budget)', async () => {
    await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: PHONE } });
    const { code } = await readLatestOtp();

    // One fat-fingered attempt does not poison the subsequent correct one.
    await expect(
      auth.api.verifyPhoneNumber({ body: { phoneNumber: PHONE, code: '000000' } }),
    ).rejects.toMatchObject({ body: { code: 'INVALID_OTP' } });

    const res = await auth.api.verifyPhoneNumber({
      body: { phoneNumber: PHONE, code },
      asResponse: true,
    });
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const session = await getSession(new Headers({ cookie }));
    expect(session).not.toBeNull();
    expect(session!.user.phoneNumberVerified).toBe(true);
  });

  it('rejects an expired OTP', async () => {
    await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: PHONE } });
    const { code } = await readLatestOtp();
    await expireLatestOtp();

    await expect(
      auth.api.verifyPhoneNumber({ body: { phoneNumber: PHONE, code } }),
    ).rejects.toMatchObject({ body: { code: 'OTP_EXPIRED' } });
  });

  it('cannot reuse a code once it has been verified', async () => {
    await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: PHONE } });
    const { code } = await readLatestOtp();

    // First verify consumes (deletes) the OTP.
    await auth.api.verifyPhoneNumber({ body: { phoneNumber: PHONE, code } });

    // Replaying the same code finds no outstanding OTP.
    await expect(
      auth.api.verifyPhoneNumber({ body: { phoneNumber: PHONE, code } }),
    ).rejects.toMatchObject({ body: { code: 'OTP_NOT_FOUND' } });
  });

  it('locks out after the allowed attempts are exhausted', async () => {
    await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: PHONE } });
    const { code } = await readLatestOtp();

    // allowedAttempts: 3 — each wrong attempt is an INVALID_OTP.
    for (let i = 0; i < 3; i++) {
      await expect(
        auth.api.verifyPhoneNumber({ body: { phoneNumber: PHONE, code: '000000' } }),
      ).rejects.toMatchObject({ body: { code: 'INVALID_OTP' } });
    }
    // The budget is spent, so even the correct code is rejected as TOO_MANY_ATTEMPTS
    // (and the OTP is dropped).
    await expect(
      auth.api.verifyPhoneNumber({ body: { phoneNumber: PHONE, code } }),
    ).rejects.toMatchObject({ body: { code: 'TOO_MANY_ATTEMPTS' } });

    // No user was created from the failed flow.
    const users = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.phoneNumber, PHONE));
    expect(users).toHaveLength(0);
  });
});
