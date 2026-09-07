import { describe, expect, it, vi } from 'vitest';
import { auth } from '@repo/auth';
import { db, schema } from '@repo/db';
import { makeUser } from '@repo/db/testing';
import { systemAdminRepository } from '../../../src/modules/system-admin/repository.js';

const email = 'system-admin@example.com';

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock('../../../../../packages/auth/src/email.js', () => ({
  sendEmail,
  escapeHtml: (value: string) => value,
}));

describe('startup system admin seed', () => {
  it('signs in through real email OTP verification with the superadmin role', async () => {
    await systemAdminRepository.seed(email);
    await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
    const message = sendEmail.mock.lastCall?.[0] as { to: string; html: string } | undefined;
    expect(message?.to).toBe(email);
    const otp = message?.html.match(/\b\d{6}\b/)?.[0];
    expect(otp).toBeDefined();
    const result = await auth.api.signInEmailOTP({ body: { email, otp: otp! } });
    expect(result.user).toMatchObject({ email, role: 'superadmin' });
    const [storedUser] = await db.select().from(schema.user);
    expect(storedUser).toMatchObject({ email, emailVerified: true, role: 'superadmin' });
  });

  it('creates one active superadmin across concurrent starts without claiming email verification', async () => {
    await Promise.all([systemAdminRepository.seed(email), systemAdminRepository.seed(email)]);
    const users = await db.select().from(schema.user);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      email,
      role: 'superadmin',
      status: 'active',
      emailVerified: false,
    });
    expect(await db.select().from(schema.account)).toHaveLength(0);
  });

  it('preserves an existing account, including bans and deliberate demotions', async () => {
    await makeUser({ email, role: 'visitor', banned: true, status: 'suspended' });
    const before = await db.select().from(schema.user);
    await systemAdminRepository.seed(email);
    expect(await db.select().from(schema.user)).toEqual(before);
  });

  it('does not create a second identity for differently cased email', async () => {
    await makeUser({ email: 'System-Admin@example.com' });
    await systemAdminRepository.seed(email);
    expect(await db.select().from(schema.user)).toHaveLength(1);
  });
});
