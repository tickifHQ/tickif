import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { auth, getSession } from '@repo/auth';
import { db, schema } from '@repo/db';
import { createAuthedSession, signInWithGoogle } from '../helpers/auth.js';

describe('Google SSO (E-85)', () => {
  it('creates a user + session on first Google sign-in', async () => {
    const { cookie } = await signInWithGoogle({
      sub: 'g-1',
      email: 'alice@gmail.com',
      name: 'Alice',
    });

    expect(cookie).toMatch(/session/);
    const session = await getSession(new Headers({ cookie }));
    expect(session).not.toBeNull();
    expect(session!.user.email).toBe('alice@gmail.com');

    const accounts = await db
      .select()
      .from(schema.account)
      .where(eq(schema.account.providerId, 'google'));
    expect(accounts).toHaveLength(1);
  });

  it('links to an existing user with a verified matching email instead of duplicating', async () => {
    // Existing phone user who has since completed their profile with a *verified* email
    // matching the Google account. better-auth's default `requireLocalEmailVerified` links
    // only when the local email is verified.
    const { cookie: phoneCookie } = await createAuthedSession('+919800000030');
    const phoneUser = await getSession(new Headers({ cookie: phoneCookie }));
    await db
      .update(schema.user)
      .set({ email: 'bob@gmail.com', emailVerified: true })
      .where(eq(schema.user.id, phoneUser!.user.id));

    await signInWithGoogle({ sub: 'g-2', email: 'bob@gmail.com', name: 'Bob' });

    const users = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, 'bob@gmail.com'));
    expect(users).toHaveLength(1); // linked, not duplicated
    expect(users[0]!.id).toBe(phoneUser!.user.id);

    const accounts = await db
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, phoneUser!.user.id));
    expect(accounts.some((a) => a.providerId === 'google')).toBe(true);
  });

  it('refuses to link Google to an existing user whose local email is unverified', async () => {
    // Security gate: better-auth's `requireLocalEmailVerified` (default true) blocks linking when
    // the EXISTING user's local email is unverified, even though the incoming Google email is
    // verified. A phone user keeps an unverified temp email, so a Google sign-in on the same
    // address must NOT silently link (that would enable account takeover).
    const { cookie: phoneCookie } = await createAuthedSession('+919800000031');
    const phoneUser = await getSession(new Headers({ cookie: phoneCookie }));
    await db
      .update(schema.user)
      .set({ email: 'carol@gmail.com' }) // emailVerified stays false
      .where(eq(schema.user.id, phoneUser!.user.id));

    const { cookie: googleCookie } = await signInWithGoogle({
      sub: 'g-3',
      email: 'carol@gmail.com',
      name: 'Carol',
    });

    // No session, no Google account attached, and crucially no duplicate user created.
    expect(googleCookie).not.toMatch(/session_token/);
    const accounts = await db
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, phoneUser!.user.id));
    expect(accounts.some((a) => a.providerId === 'google')).toBe(false);
    const users = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, 'carol@gmail.com'));
    expect(users).toHaveLength(1);
  });

  it('re-uses the account on a repeat Google sign-in (idempotent, no duplicate)', async () => {
    await signInWithGoogle({ sub: 'g-4', email: 'dave@gmail.com', name: 'Dave' });
    await signInWithGoogle({ sub: 'g-4', email: 'dave@gmail.com', name: 'Dave' });

    const users = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, 'dave@gmail.com'));
    expect(users).toHaveLength(1);

    const accounts = await db
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, users[0]!.id));
    expect(accounts.filter((a) => a.providerId === 'google')).toHaveLength(1);
  });

  it('does not create a session when the user denies consent', async () => {
    const before = await db.select().from(schema.user);

    // Drive the callback with an OAuth error instead of a code — no token mock needed.
    const start = await auth.api.signInSocial({
      body: { provider: 'google', callbackURL: 'http://localhost:3000/' },
      asResponse: true,
    });
    const cookieHeader = start.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const { url } = (await start.json()) as { url: string };
    const state = new URL(url).searchParams.get('state')!;

    const res = await auth.handler(
      new Request(
        `http://localhost:3000/api/auth/callback/google?error=access_denied&state=${encodeURIComponent(state)}`,
        { headers: cookieHeader ? { cookie: cookieHeader } : {} },
      ),
    );

    // Redirects to the error URL, sets no session, and creates no user.
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('location') ?? '').toMatch(/error/);
    expect(res.headers.getSetCookie().some((c) => c.includes('session_token'))).toBe(false);
    const after = await db.select().from(schema.user);
    expect(after.length).toBe(before.length);
  });
});
