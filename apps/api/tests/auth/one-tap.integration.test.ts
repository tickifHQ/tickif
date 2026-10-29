import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getSession } from '@repo/auth';
import { db, schema } from '@repo/db';
import { app } from '../../src/app.js';
import { createAuthedSession, signInWithGoogle } from '../helpers/auth.js';

// One Tap verifies the token signature, so these tests sign real RS256 tokens and serve the
// matching key from Google's JWKS URL. Nothing else is stubbed.
const KID = 'one-tap-test-key';
const googleKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 });

function googleIdToken(claims: Record<string, unknown>, privateKey = googleKey.privateKey): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${encode({ alg: 'RS256', kid: KID, typ: 'JWT' })}.${encode({
    iss: 'https://accounts.google.com',
    aud: 'test-google-client-id',
    email_verified: true,
    iat: now,
    exp: now + 3600,
    ...claims,
  })}`;
  return `${body}.${sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url')}`;
}

async function oneTap(idToken: string): Promise<{ response: Response; cookie: string }> {
  const response = await app.request('/api/auth/one-tap/callback', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify({ idToken }),
  });
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  return { response, cookie };
}

function usersWithEmail(email: string) {
  return db.select().from(schema.user).where(eq(schema.user.email, email));
}

describe('Google One Tap', () => {
  beforeEach(() => {
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const href =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (href === 'https://www.googleapis.com/oauth2/v3/certs') {
        const jwk = { ...googleKey.publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256' };
        return Response.json({ keys: [jwk] });
      }
      return realFetch(input, init);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a user and a session from a verified token', async () => {
    const { response, cookie } = await oneTap(
      googleIdToken({ sub: 'ot-1', email: 'Asha@gmail.com', name: 'Asha' }),
    );

    expect(response.status).toBe(200);
    const session = await getSession(new Headers({ cookie }));
    expect(session?.user.email).toBe('asha@gmail.com');
    const accounts = await db
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, session!.user.id));
    expect(accounts.map((account) => [account.providerId, account.accountId])).toEqual([
      ['google', 'ot-1'],
    ]);
  });

  it('signs in the account created by Continue with Google instead of adding another', async () => {
    await signInWithGoogle({ sub: 'ot-2', email: 'bina@gmail.com', name: 'Bina' });
    const [existing] = await usersWithEmail('bina@gmail.com');

    const { response, cookie } = await oneTap(
      googleIdToken({ sub: 'ot-2', email: 'bina@gmail.com' }),
    );

    expect(response.status).toBe(200);
    expect((await getSession(new Headers({ cookie })))?.user.id).toBe(existing!.id);
    expect(await usersWithEmail('bina@gmail.com')).toHaveLength(1);
    const accounts = await db
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, existing!.id));
    expect(accounts.filter((account) => account.providerId === 'google')).toHaveLength(1);
  });

  it('links Google to an existing user with the same verified email', async () => {
    const { cookie: phoneCookie } = await createAuthedSession('+919800000040');
    const phoneUser = await getSession(new Headers({ cookie: phoneCookie }));
    await db
      .update(schema.user)
      .set({ email: 'chitra@gmail.com', emailVerified: true })
      .where(eq(schema.user.id, phoneUser!.user.id));

    const { response, cookie } = await oneTap(
      googleIdToken({ sub: 'ot-3', email: 'chitra@gmail.com' }),
    );

    expect(response.status).toBe(200);
    expect((await getSession(new Headers({ cookie })))?.user.id).toBe(phoneUser!.user.id);
    expect(await usersWithEmail('chitra@gmail.com')).toHaveLength(1);
  });

  it.each([
    ['another client id', { aud: 'someone-elses-client-id' }],
    ['another issuer', { iss: 'https://evil.example.com' }],
    ['an expired token', { iat: 1_700_000_000, exp: 1_700_003_600 }],
  ])('rejects a token for %s', async (_case, claims) => {
    const { response, cookie } = await oneTap(
      googleIdToken({ sub: 'ot-4', email: 'dev@gmail.com', ...claims }),
    );

    expect(response.status).toBe(400);
    expect(cookie).not.toMatch(/session_token/);
    expect(await usersWithEmail('dev@gmail.com')).toHaveLength(0);
  });

  it('rejects a token not signed by Google', async () => {
    const { response } = await oneTap(
      googleIdToken({ sub: 'ot-5', email: 'esha@gmail.com' }, otherKey.privateKey),
    );

    expect(response.status).toBe(400);
    expect(await usersWithEmail('esha@gmail.com')).toHaveLength(0);
  });

  it('rejects an email Google has not verified', async () => {
    const { response, cookie } = await oneTap(
      googleIdToken({ sub: 'ot-6', email: 'farah@example.com', email_verified: false }),
    );

    expect(response.status).toBe(403);
    expect(cookie).not.toMatch(/session_token/);
    expect(await usersWithEmail('farah@example.com')).toHaveLength(0);
  });
});
