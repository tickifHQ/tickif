import { desc, eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { db, schema } from '@repo/db';
import { auth } from '@repo/auth';

/**
 * Mints a real authenticated session by driving the actual phone-OTP flow
 * against the test DB, then returns a `Cookie` header value usable on requests.
 *
 * We read the OTP from the `verification` table (the dev sender only logs it).
 * The resulting session is real — it verifies under the same secret the app uses.
 */
export async function createAuthedSession(
  phoneNumber = '+919800000001',
): Promise<{ cookie: string; phoneNumber: string }> {
  await auth.api.sendPhoneNumberOTP({ body: { phoneNumber } });

  const { code } = await readLatestOtp();

  const res = await auth.api.verifyPhoneNumber({
    body: { phoneNumber, code },
    asResponse: true,
  });

  const setCookies = res.headers.getSetCookie();
  if (setCookies.length === 0) {
    throw new Error('createAuthedSession: verify did not return a session cookie');
  }
  // Convert Set-Cookie entries into a single Cookie request header.
  const cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  return { cookie, phoneNumber };
}

/** Latest OTP row — the phoneNumber plugin writes the code into `verification.value`. */
export async function readLatestOtp(): Promise<{ id: string; code: string }> {
  const [row] = await db
    .select()
    .from(schema.verification)
    .orderBy(desc(schema.verification.createdAt))
    .limit(1);
  const code = row?.value.match(/\d{4,8}/)?.[0];
  if (!row || !code) {
    throw new Error('readLatestOtp: could not read OTP from verification table');
  }
  return { id: row.id, code };
}

/** Force the latest OTP to be expired — exercises the expiry path without a wall-clock wait. */
export async function expireLatestOtp(): Promise<void> {
  const { id } = await readLatestOtp();
  await db
    .update(schema.verification)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(eq(schema.verification.id, id));
}

/**
 * Build an unsigned Google `id_token`. On the authorization-code callback path better-auth's
 * `getUserInfo` uses `decodeJwt` (no signature/JWKS check), so a hand-crafted token is accepted.
 */
export function makeGoogleIdToken(claims: {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', kid: 'test', typ: 'JWT' };
  const payload = {
    iss: 'https://accounts.google.com',
    aud: process.env.GOOGLE_CLIENT_ID ?? 'test-google-client-id',
    sub: claims.sub,
    email: claims.email,
    email_verified: true,
    name: claims.name ?? claims.email,
    picture: claims.picture,
    iat: now,
    exp: now + 3600,
  };
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64(header)}.${b64(payload)}.sig`;
}

/**
 * Drive a full Google authorization-code sign-in against the real auth instance, mocking only
 * Google's token endpoint. Returns the callback Response (its Set-Cookie carries the session)
 * plus a ready-to-use Cookie header.
 */
export async function signInWithGoogle(profile: {
  sub: string;
  email: string;
  name?: string;
}): Promise<{ response: Response; cookie: string }> {
  // 1. Kick off social sign-in → authorization URL (+ any state cookies).
  const start = await auth.api.signInSocial({
    body: { provider: 'google', callbackURL: 'http://localhost:3000/' },
    asResponse: true,
  });
  const startCookies = start.headers.getSetCookie();
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get('state');
  if (!state) {
    throw new Error('signInWithGoogle: no state in authorization URL');
  }

  // 2. Mock Google's token endpoint to return our crafted id_token; pass everything else through.
  const realFetch = globalThis.fetch;
  const stub = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const href =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (href.includes('oauth2.googleapis.com/token')) {
      return new Response(
        JSON.stringify({
          access_token: 'mock-access-token',
          id_token: makeGoogleIdToken(profile),
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'openid email profile',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return realFetch(input, init);
  });

  try {
    vi.stubGlobal('fetch', stub);
    // 3. Hit the callback carrying the state cookies.
    const cookieHeader = startCookies.map((c) => c.split(';')[0]).join('; ');
    const cbUrl = `http://localhost:3000/api/auth/callback/google?code=mock-code&state=${encodeURIComponent(state)}`;
    const response = await auth.handler(
      new Request(cbUrl, { headers: cookieHeader ? { cookie: cookieHeader } : {} }),
    );
    const cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    return { response, cookie };
  } finally {
    globalThis.fetch = realFetch;
  }
}

/** Backdate a user's session row so time-based paths (refresh / expiry) fire deterministically. */
export async function backdateSession(
  userId: string,
  patch: { updatedAt?: Date; expiresAt?: Date },
): Promise<void> {
  await db.update(schema.session).set(patch).where(eq(schema.session.userId, userId));
}

/**
 * Mint a real session, promote the user's platform role via the DB (the bootstrap
 * path for admin/superadmin), and return a cookie whose cached session_data blob is
 * stripped so guards read the fresh role from the DB.
 */
export async function createRoleSession(
  phoneNumber: string,
  role: 'visitor' | 'designer' | 'admin' | 'superadmin',
): Promise<{ cookie: string; userId: string }> {
  const { cookie } = await createAuthedSession(phoneNumber);
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  if (!session) {
    throw new Error('createRoleSession: could not resolve the freshly minted session');
  }
  const userId = session.user.id;
  if (role !== 'visitor') {
    await db.update(schema.user).set({ role }).where(eq(schema.user.id, userId));
  }
  const fresh = cookie
    .split('; ')
    .filter((c) => !c.startsWith('better-auth.session_data'))
    .join('; ');
  return { cookie: fresh, userId };
}

/** Merge Set-Cookie response values into a Cookie request header for follow-up requests. */
export function mergeResponseCookies(cookie: string, response: Response): string {
  const values = new Map<string, string>();
  for (const pair of cookie.split('; ')) {
    const separator = pair.indexOf('=');
    if (separator > 0) values.set(pair.slice(0, separator), pair);
  }
  for (const setCookie of response.headers.getSetCookie()) {
    const pair = setCookie.split(';')[0];
    if (!pair) continue;
    const separator = pair.indexOf('=');
    if (separator > 0) values.set(pair.slice(0, separator), pair);
  }
  return [...values.values()].join('; ');
}

/** Select an organization through Better Auth and return the refreshed Cookie header. */
export async function activateOrganization(
  cookie: string,
  organizationId: string,
): Promise<string> {
  const response = await auth.api.setActiveOrganization({
    headers: new Headers({ cookie }),
    body: { organizationId },
    asResponse: true,
  });
  if (!response.ok) {
    throw new Error(`activateOrganization: Better Auth returned ${response.status}`);
  }
  return mergeResponseCookies(cookie, response);
}
