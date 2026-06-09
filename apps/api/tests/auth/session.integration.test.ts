import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { auth, getSession } from '@repo/auth';
import { db, schema } from '@repo/db';
import { createAuthedSession, backdateSession } from '../helpers/auth.js';

describe('session lifecycle (E-85)', () => {
  it('persists across repeated getSession calls', async () => {
    const { cookie } = await createAuthedSession('+919800000020');

    const a = await getSession(new Headers({ cookie }));
    const b = await getSession(new Headers({ cookie }));

    expect(a).not.toBeNull();
    expect(a!.user.id).toBe(b!.user.id);

    const rows = await db
      .select()
      .from(schema.session)
      .where(eq(schema.session.userId, a!.user.id));
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('rolling refresh extends expiry once inside the updateAge window', async () => {
    const { cookie } = await createAuthedSession('+919800000021');
    const me = await getSession(new Headers({ cookie }));
    const userId = me!.user.id;

    // Refresh fires when `expiresAt - expiresIn + updateAge <= now` (expiresIn 7d, updateAge 1d),
    // i.e. once the session is within ~6 days of expiry. Backdate expiresAt to 1 day out to trip it.
    const staleExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await backdateSession(userId, { expiresAt: staleExpiry });

    // disableCookieCache forces the DB read + rolling-refresh logic (the cache would skip both).
    await getSession(new Headers({ cookie }), { disableCookieCache: true });

    const [row] = await db
      .select()
      .from(schema.session)
      .where(eq(schema.session.userId, userId));
    expect(row!.expiresAt.getTime()).toBeGreaterThan(staleExpiry.getTime());
  });

  it('logout revokes the session server-side', async () => {
    const { cookie } = await createAuthedSession('+919800000022');

    await auth.api.signOut({ headers: new Headers({ cookie }) });

    // disableCookieCache is load-bearing: without it the ≤5-min cached session_data blob the client
    // still holds would resolve as valid (see the cached-window test below).
    const after = await getSession(new Headers({ cookie }), { disableCookieCache: true });
    expect(after).toBeNull();
  });

  it('still serves the cached session within the cookie-cache window after logout (documented tradeoff)', async () => {
    const { cookie } = await createAuthedSession('+919800000024');

    await auth.api.signOut({ headers: new Headers({ cookie }) });

    // The client-held session_data cookie stays valid for cookieCache.maxAge (5 min) — logout
    // revokes server-side but can't retroactively invalidate a cached copy already on the wire.
    // This is the accepted cookie-cache tradeoff, not a bug; it's why getSession exposes the bypass.
    const cached = await getSession(new Headers({ cookie }));
    expect(cached).not.toBeNull();
  });

  it('rejects an expired session', async () => {
    const { cookie } = await createAuthedSession('+919800000023');
    const me = await getSession(new Headers({ cookie }));

    await backdateSession(me!.user.id, { expiresAt: new Date(Date.now() - 60_000) });

    const after = await getSession(new Headers({ cookie }), { disableCookieCache: true });
    expect(after).toBeNull();
  });
});
