import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { auth, getSession } from '@repo/auth';
import { db, schema } from '@repo/db';
import { createAuthedSession, createRoleSession } from '../helpers/auth.js';

/**
 * Platform role changes are superadmin-only. Better Auth validates configured role
 * names, and the user_role pgEnum remains the persistence backstop.
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

describe('superadmin platform-role administration', () => {
  it('rejects an unknown role and leaves the row unchanged', async () => {
    const { cookie: superadminCookie } = await createRoleSession('+919800000040', 'superadmin');
    const { cookie: targetCookie } = await createAuthedSession('+919800000041');
    const target = await getSession(new Headers({ cookie: targetCookie }));
    const targetId = target!.user.id;

    const res = await postSetRole(superadminCookie, { userId: targetId, role: 'manager' });
    // Better Auth rejects roles absent from its configured role map before PostgreSQL sees them.
    expect(res.status).toBe(400);

    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, targetId));
    expect(row!.role).toBe('visitor');
  });

  it('lets a superadmin call set-role (adminRoles includes superadmin, E-87)', async () => {
    const { cookie: suCookie } = await createRoleSession('+919800000046', 'superadmin');
    const { cookie: targetCookie } = await createAuthedSession('+919800000047');
    const target = await getSession(new Headers({ cookie: targetCookie }));

    const res = await postSetRole(suCookie, { userId: target!.user.id, role: 'designer' });
    expect(res.ok).toBe(true);
  });

  it('sets a valid enum role', async () => {
    const { cookie: superadminCookie } = await createRoleSession('+919800000042', 'superadmin');
    const { cookie: targetCookie } = await createAuthedSession('+919800000043');
    const target = await getSession(new Headers({ cookie: targetCookie }));
    const targetId = target!.user.id;

    const res = await postSetRole(superadminCookie, { userId: targetId, role: 'designer' });
    expect(res.ok).toBe(true);

    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, targetId));
    expect(row!.role).toBe('designer');
  });

  it('forbids a regular admin from changing platform roles', async () => {
    const { cookie: adminCookie } = await createRoleSession('+919800000048', 'admin');
    const { cookie: targetCookie } = await createAuthedSession('+919800000049');
    const target = await getSession(new Headers({ cookie: targetCookie }));

    const res = await postSetRole(adminCookie, {
      userId: target!.user.id,
      role: 'superadmin',
    });
    expect(res.status).toBe(403);

    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, target!.user.id));
    expect(row!.role).toBe('visitor');
  });

  it('forbids a non-admin caller', async () => {
    // A session alone never grants Better Auth account-administration permissions.
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
