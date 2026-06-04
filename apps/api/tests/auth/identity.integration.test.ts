import { describe, it, expect } from 'vitest';
import { getSession } from '@repo/auth';
import { createAuthedSession } from '../helpers/auth.js';

describe('getSession helper (E-80)', () => {
  it('returns null when no session cookie is present', async () => {
    const result = await getSession(new Headers());
    expect(result).toBeNull();
  });

  it('resolves the real session (user + session) from a cookie header', async () => {
    const { cookie, phoneNumber } = await createAuthedSession();
    const result = await getSession(new Headers({ cookie }));

    expect(result).not.toBeNull();
    expect(result!.user.phoneNumber).toBe(phoneNumber);
    expect(result!.user.phoneNumberVerified).toBe(true);
    expect(result!.session.token).toMatch(/.+/);
  });

  it('defaults a newly signed-up user to status "pending"', async () => {
    const { cookie } = await createAuthedSession();
    const result = await getSession(new Headers({ cookie }));

    expect(result).not.toBeNull();
    expect(result!.user.status).toBe('pending');
  });
});
