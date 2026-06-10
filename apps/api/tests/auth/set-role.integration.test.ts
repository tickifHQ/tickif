import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { auth, getSession } from '@repo/auth';
import { db, schema } from '@repo/db';
import { createAuthedSession } from '../helpers/auth.js';

/**
 * E-86 interim window: the admin plugin's /admin/* endpoints are live with
 * adminRoles defaulting to ['admin'], and set-role does no role-value validation
 * upstream. These tests pin that the user_role pgEnum is the write backstop.
 *
 * Driven through auth.handler (the real HTTP surface) because auth.api.setRole's
 * body is typed to better-auth's default roles until E-87 defines ours via
 * createAccessControl.
 */

/** Cookie header without the cached session_data blob, so a DB role change is read fresh. */
function dropSessionDataCookie(cookie: string): string {
  return cookie
    .split('; ')
    .filter((c) => !c.startsWith('better-auth.session_data'))
    .join('; ');
}

/** Mint a session and promote its user to 'admin' via the DB (the pre-E-87 bootstrap path). */
async function createAdminCookie(phoneNumber: string): Promise<string> {
  const { cookie } = await createAuthedSession(phoneNumber);
  const session = await getSession(new Headers({ cookie }));
  await db
    .update(schema.user)
    .set({ role: 'admin' })
    .where(eq(schema.user.id, session!.user.id));
  return dropSessionDataCookie(cookie);
}

function postSetRole(cookie: string, body: { userId: string; role: string }): Promise<Response> {
  return auth.handler(
    new Request('http://localhost:3000/api/auth/admin/set-role', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    }),
  );
}

describe('admin set-role vs user_role enum (E-86)', () => {
  it('rejects an out-of-enum role at the database boundary and leaves the row unchanged', async () => {
    const adminCookie = await createAdminCookie('+919800000040');
    const { cookie: targetCookie } = await createAuthedSession('+919800000041');
    const target = await getSession(new Headers({ cookie: targetCookie }));
    const targetId = target!.user.id;

    // better-auth's set-role accepts any string; the pgEnum rejects it (DB error → 500,
    // not a 400 — request-level validation is an E-87 follow-up, see ADR 0001).
    const res = await postSetRole(adminCookie, { userId: targetId, role: 'manager' });
    expect(res.ok).toBe(false);

    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, targetId));
    expect(row!.role).toBe('visitor');
  });

  it('sets a valid enum role', async () => {
    const adminCookie = await createAdminCookie('+919800000042');
    const { cookie: targetCookie } = await createAuthedSession('+919800000043');
    const target = await getSession(new Headers({ cookie: targetCookie }));
    const targetId = target!.user.id;

    const res = await postSetRole(adminCookie, { userId: targetId, role: 'designer' });
    expect(res.ok).toBe(true);

    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, targetId));
    expect(row!.role).toBe('designer');
  });

  it('forbids a non-admin caller', async () => {
    // visitor caller (no DB promotion) — adminRoles defaults to ['admin'].
    const { cookie } = await createAuthedSession('+919800000044');
    const { cookie: targetCookie } = await createAuthedSession('+919800000045');
    const target = await getSession(new Headers({ cookie: targetCookie }));

    const res = await postSetRole(dropSessionDataCookie(cookie), {
      userId: target!.user.id,
      role: 'designer',
    });
    expect(res.status).toBe(403);
  });
});
