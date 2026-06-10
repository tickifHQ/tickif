import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { auth, getSession } from '@repo/auth';
import { db, schema } from '@repo/db';
import { createAuthedSession, createRoleSession } from '../helpers/auth.js';

/**
 * better-auth's set-role does no role-value validation upstream; these tests pin
 * that the user_role pgEnum is the write backstop.
 *
 * Driven through auth.handler (the real HTTP surface): auth.api.setRole's body is
 * typed to the access-control role names, and exercising the raw endpoint also
 * covers what a real client can send.
 */

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
    const { cookie: adminCookie } = await createRoleSession('+919800000040', 'admin');
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
    const { cookie: adminCookie } = await createRoleSession('+919800000042', 'admin');
    const { cookie: targetCookie } = await createAuthedSession('+919800000043');
    const target = await getSession(new Headers({ cookie: targetCookie }));
    const targetId = target!.user.id;

    const res = await postSetRole(adminCookie, { userId: targetId, role: 'designer' });
    expect(res.ok).toBe(true);

    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, targetId));
    expect(row!.role).toBe('designer');
  });

  it('forbids a non-admin caller', async () => {
    // visitor caller stays unprivileged; adminRoles is ['admin', 'superadmin'].
    const { cookie } = await createRoleSession('+919800000044', 'visitor');
    const { cookie: targetCookie } = await createAuthedSession('+919800000045');
    const target = await getSession(new Headers({ cookie: targetCookie }));

    const res = await postSetRole(cookie, {
      userId: target!.user.id,
      role: 'designer',
    });
    expect(res.status).toBe(403);
  });
});
