import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { eq, inArray } from 'drizzle-orm';
import { auth, getSession } from '@repo/auth';
import { db, schema } from '@repo/db';
import { makeDesigner } from '@repo/db/testing';
import { app } from '../../src/app.js';
import {
  withSession,
  requireAuth,
  requireAnyRole,
  requireRole,
  requireOwnership,
  type AuthVariables,
} from '../../src/lib/auth-middleware.js';
import { onError } from '../../src/lib/errors.js';
import {
  activateOrganization,
  backdateSession,
  createAuthedSession,
  createRoleSession,
} from '../helpers/auth.js';
import { seedProjectOwnedBy, seedOrgWithMember } from '../helpers/seed.js';

/**
 * E-89: the explicit authorization matrix. Every actor class against every gate
 * class, the ownership triangle, and role-escalation attempts. Expected statuses
 * are data — changing who may do what MUST show up as a diff in these tables.
 */

type ActorName = 'anon' | 'expired' | 'banned' | 'visitor' | 'designer' | 'admin' | 'superadmin';
type Actors = Record<ActorName, string | undefined>;

const ROLES = ['visitor', 'designer', 'admin', 'superadmin'] as const;

/**
 * Mint one session per role (+ an expired and a banned one). Sequential on purpose:
 * createAuthedSession reads the globally-latest OTP, so concurrent flows would
 * steal each other's codes. Phones are unique per call-site block.
 *
 * Phone-block registry for this file (avoid collisions when adding tests):
 * 10 + 12 = mintActors call sites; 11 + 13 = hardcoded +919800011xxx/013xxx
 * literals below. Pick an unused block for anything new.
 */
async function mintActors(phoneBlock: number): Promise<Actors> {
  const phone = (n: number) => `+9198000${phoneBlock}${String(n).padStart(3, '0')}`;
  const sessions: string[] = [];
  for (const [i, role] of ROLES.entries()) {
    const { cookie } = await createRoleSession(phone(i), role);
    sessions.push(cookie);
  }
  const expired = await createRoleSession(phone(8), 'admin');
  await backdateSession(expired.userId, { expiresAt: new Date(Date.now() - 60_000) });
  const banned = await createRoleSession(phone(9), 'admin');
  await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, banned.userId));
  return {
    anon: undefined,
    expired: expired.cookie,
    banned: banned.cookie,
    visitor: sessions[0],
    designer: sessions[1],
    admin: sessions[2],
    superadmin: sessions[3],
  };
}

function gateApp() {
  const sample = new Hono<{ Variables: AuthVariables }>();
  sample.onError(onError);
  sample.use('*', withSession);
  sample.get('/public', (c) => c.json({ ok: true }));
  sample.get('/authed', requireAuth, (c) => c.json({ ok: true }));
  sample.get('/designer-only', requireRole('designer'), (c) => c.json({ ok: true }));
  sample.get('/admin-only', requireAnyRole(['admin']), (c) => c.json({ ok: true }));
  sample.get('/staff', requireAnyRole(['admin', 'designer']), (c) => c.json({ ok: true }));
  return sample;
}

function request(target: Hono<{ Variables: AuthVariables }>, path: string, cookie?: string) {
  return target.request(path, { headers: cookie ? { cookie } : {} });
}

// The gate-class matrix: expected status per actor per gate. The banned actor holds
// the admin role — a ban beats any role (403 everywhere except public routes).
const GATE_MATRIX: Array<{ path: string } & Record<ActorName, number>> = [
  {
    path: '/public',
    anon: 200,
    expired: 200,
    banned: 200,
    visitor: 200,
    designer: 200,
    admin: 200,
    superadmin: 200,
  },
  {
    path: '/authed',
    anon: 401,
    expired: 401,
    banned: 403,
    visitor: 200,
    designer: 200,
    admin: 200,
    superadmin: 200,
  },
  {
    path: '/designer-only',
    anon: 401,
    expired: 401,
    banned: 403,
    visitor: 403,
    designer: 200,
    admin: 403,
    superadmin: 200,
  },
  {
    path: '/admin-only',
    anon: 401,
    expired: 401,
    banned: 403,
    visitor: 403,
    designer: 403,
    admin: 200,
    superadmin: 200,
  },
  {
    path: '/staff',
    anon: 401,
    expired: 401,
    banned: 403,
    visitor: 403,
    designer: 200,
    admin: 200,
    superadmin: 200,
  },
];

const ACTOR_NAMES: ActorName[] = [
  'anon',
  'expired',
  'banned',
  'visitor',
  'designer',
  'admin',
  'superadmin',
];

describe('RBAC matrix: gate classes × actors (E-89)', () => {
  it('matches the full gate matrix', async () => {
    const sample = gateApp();
    const actors = await mintActors(10);

    for (const row of GATE_MATRIX) {
      for (const actor of ACTOR_NAMES) {
        const res = await request(sample, row.path, actors[actor]);
        // soft: report every broken cell in one run, not just the first
        expect.soft(res.status, `${actor} → GET ${row.path}`).toBe(row[actor]);
      }
    }
  });
});

describe('RBAC matrix: ownership triangle (E-89)', () => {
  it('user-owned resource: owner / stranger / admin / superadmin / missing', async () => {
    const owner = await createRoleSession('+919800011001', 'designer');
    const stranger = await createRoleSession('+919800011002', 'designer');
    const admin = await createRoleSession('+919800011003', 'admin');
    const superadmin = await createRoleSession('+919800011004', 'superadmin');
    const projectId = await seedProjectOwnedBy(owner.userId);

    const sample = new Hono<{ Variables: AuthVariables }>();
    sample.onError(onError);
    sample.use('*', withSession);
    sample.get(
      '/projects/:id/manage',
      requireOwnership(async (c) => {
        const id = c.req.param('id');
        if (!id) return null;
        const [row] = await db
          .select({ ownerUserId: schema.designerProfile.userId })
          .from(schema.project)
          .innerJoin(
            schema.designerProfile,
            eq(schema.project.designerId, schema.designerProfile.id),
          )
          .where(eq(schema.project.id, id))
          .limit(1);
        return row ?? null;
      }),
      (c) => c.json({ ok: true }),
    );

    const path = `/projects/${projectId}/manage`;
    expect((await request(sample, path, owner.cookie)).status, 'owner').toBe(200);
    expect((await request(sample, path, stranger.cookie)).status, 'stranger').toBe(403);
    // platform admin has NO implicit ownership pass (ADR 0001)
    expect((await request(sample, path, admin.cookie)).status, 'admin').toBe(403);
    expect((await request(sample, path, superadmin.cookie)).status, 'superadmin').toBe(200);
    expect((await request(sample, path)).status, 'anon').toBe(401);
    expect(
      (await request(sample, '/projects/00000000-0000-4000-8000-000000000000/manage', owner.cookie))
        .status,
      'missing resource',
    ).toBe(404);
  });

  it('org-owned resource: member / cross-org member / non-member / superadmin', async () => {
    const member = await createRoleSession('+919800011011', 'designer');
    const crossOrg = await createRoleSession('+919800011012', 'designer');
    const nonMember = await createRoleSession('+919800011013', 'designer');
    const superadmin = await createRoleSession('+919800011014', 'superadmin');
    const orgA = await seedOrgWithMember(member.userId);
    await seedOrgWithMember(crossOrg.userId); // member elsewhere — must NOT open org A

    const sample = new Hono<{ Variables: AuthVariables }>();
    sample.onError(onError);
    sample.use('*', withSession);
    sample.get(
      '/org-resources/:orgId/manage',
      requireOwnership(async (c) => ({
        ownerUserId: null,
        organizationId: c.req.param('orgId'),
      })),
      (c) => c.json({ ok: true }),
    );

    const path = `/org-resources/${orgA}/manage`;
    expect((await request(sample, path, member.cookie)).status, 'member').toBe(200);
    expect((await request(sample, path, crossOrg.cookie)).status, 'cross-org member').toBe(403);
    expect((await request(sample, path, nonMember.cookie)).status, 'non-member').toBe(403);
    expect((await request(sample, path, superadmin.cookie)).status, 'superadmin').toBe(200);
    expect((await request(sample, path)).status, 'anon').toBe(401);
  });
});

describe('RBAC matrix: real app routes (E-89)', () => {
  it('locks the current production gating', async () => {
    const actors = await mintActors(12);
    const designerSession = await getSession(new Headers({ cookie: actors.designer! }));
    if (!designerSession) throw new Error('expected designer session');
    const designer = await makeDesigner({ userId: designerSession.user.id });
    await db.insert(schema.member).values({
      id: `mem-matrix-designer-${designerSession.user.id}`,
      organizationId: designer.orgId,
      userId: designerSession.user.id,
      role: 'owner',
      createdAt: new Date(),
    });
    actors.designer = await activateOrganization(actors.designer!, designer.orgId);

    // public routes: everyone, including anon
    for (const actor of ACTOR_NAMES) {
      expect(
        (await app.request('/health', { headers: actors[actor] ? { cookie: actors[actor]! } : {} }))
          .status,
        `${actor} → GET /health`,
      ).toBe(200);
    }

    // GET /api/projects is now the authenticated owner dashboard list (E-142).
    const getProjects = (cookie?: string) =>
      app.request('/api/projects', { headers: cookie ? { cookie } : {} });
    expect((await getProjects(actors.anon)).status, 'anon → GET /api/projects').toBe(401);
    expect((await getProjects(actors.expired)).status, 'expired → GET /api/projects').toBe(401);
    expect((await getProjects(actors.banned)).status, 'banned → GET /api/projects').toBe(403);
    expect((await getProjects(actors.visitor)).status, 'visitor → GET /api/projects').toBe(422);
    expect((await getProjects(actors.designer)).status, 'designer → GET /api/projects').toBe(200);
    expect((await getProjects(actors.admin)).status, 'admin → GET /api/projects').toBe(422);
    expect((await getProjects(actors.superadmin)).status, 'superadmin → GET /api/projects').toBe(
      422,
    );

    // POST /api/projects is authenticated and requires a designer profile owned by the caller.
    const post = (label: string, cookie?: string) =>
      app.request('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ title: `Matrix ${label}` }),
      });
    expect((await post('anon', actors.anon)).status, 'anon → POST /api/projects').toBe(401);
    expect((await post('expired', actors.expired)).status, 'expired → POST /api/projects').toBe(
      401,
    );
    expect((await post('banned', actors.banned)).status, 'banned → POST /api/projects').toBe(403);
    expect((await post('visitor', actors.visitor)).status, 'visitor → POST /api/projects').toBe(
      403,
    );
    expect((await post('designer', actors.designer)).status, 'designer → POST /api/projects').toBe(
      201,
    );
    expect((await post('admin', actors.admin)).status, 'admin → POST /api/projects').toBe(403);
    expect(
      (await post('superadmin', actors.superadmin)).status,
      'superadmin → POST /api/projects',
    ).toBe(403);
  });
});

describe('RBAC matrix: fresh session state (E-184)', () => {
  it('a warm session_data cookie cannot bypass a server-side ban', async () => {
    // createAuthedSession returns the FULL cookie, including the cached session_data
    // blob — unlike createRoleSession, which strips it. This pins the production
    // behavior: requireAuth must bypass the cache so a server-side ban takes effect
    // immediately even when the client still holds a warm cookie.
    const { cookie } = await createAuthedSession('+919800013001');
    const me = await getSession(new Headers({ cookie }));

    const sample = new Hono<{ Variables: AuthVariables }>();
    sample.onError(onError);
    sample.use('*', withSession);
    sample.get('/authed', requireAuth, (c) => c.json({ ok: true }));

    expect((await request(sample, '/authed', cookie)).status).toBe(200);

    await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, me!.user.id));

    expect((await request(sample, '/authed', cookie)).status).toBe(403);
  });
});

describe('RBAC matrix: escalation attempts (E-89)', () => {
  function adminRequest(
    cookie: string,
    path: string,
    options: { method?: 'GET' | 'POST'; body?: unknown } = {},
  ) {
    const headers: Record<string, string> = { cookie };
    if (options.body !== undefined) headers['content-type'] = 'application/json';

    return auth.handler(
      new Request(`http://localhost:3000/api/auth/admin/${path}`, {
        method: options.method ?? 'POST',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      }),
    );
  }

  function postAdminRequest(cookie: string, path: string, body: unknown) {
    return adminRequest(cookie, path, { body });
  }

  function postSetRole(cookie: string, body: { userId: string; role: string }) {
    return postAdminRequest(cookie, 'set-role', body);
  }

  it.each(['visitor', 'designer'] as const)(
    'a %s cannot promote themselves via set-role',
    async (role) => {
      const { cookie, userId } = await createRoleSession(
        role === 'visitor' ? '+919800011021' : '+919800011022',
        role,
      );

      const res = await postSetRole(cookie, { userId, role: 'superadmin' });
      expect(res.status).toBe(403);

      const [row] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
      expect(row!.role).toBe(role);
    },
  );

  it('an admin cannot administer accounts or mint a superadmin through Better Auth', async () => {
    const admin = await createRoleSession('+919800011024', 'admin');
    const target = await createRoleSession('+919800011025', 'visitor');
    const bannedTarget = await createRoleSession('+919800011026', 'visitor');
    await db
      .update(schema.user)
      .set({ banned: true })
      .where(eq(schema.user.id, bannedTarget.userId));

    const selfPromotion = await postSetRole(admin.cookie, {
      userId: admin.userId,
      role: 'superadmin',
    });
    const targetPromotion = await postSetRole(admin.cookie, {
      userId: target.userId,
      role: 'superadmin',
    });
    const updatePromotion = await postAdminRequest(admin.cookie, 'update-user', {
      userId: target.userId,
      data: { role: 'superadmin' },
    });
    const createPromotion = await postAdminRequest(admin.cookie, 'create-user', {
      name: 'Unauthorized Superadmin',
      email: 'unauthorized-superadmin@tickif.test',
      role: 'superadmin',
    });
    const banTarget = await postAdminRequest(admin.cookie, 'ban-user', {
      userId: target.userId,
      banReason: 'Unauthorized action',
    });
    const removeTarget = await postAdminRequest(admin.cookie, 'remove-user', {
      userId: target.userId,
    });
    const replacePassword = await postAdminRequest(admin.cookie, 'set-user-password', {
      userId: target.userId,
      newPassword: 'unauthorized-password-change',
    });
    const impersonateTarget = await postAdminRequest(admin.cookie, 'impersonate-user', {
      userId: target.userId,
    });
    const listUsers = await adminRequest(admin.cookie, 'list-users?limit=1', { method: 'GET' });
    const listSessions = await postAdminRequest(admin.cookie, 'list-user-sessions', {
      userId: target.userId,
    });
    const revokeSession = await postAdminRequest(admin.cookie, 'revoke-user-session', {
      sessionToken: 'session-token-admin-must-not-revoke',
    });
    const revokeSessions = await postAdminRequest(admin.cookie, 'revoke-user-sessions', {
      userId: target.userId,
    });
    const unbanTarget = await postAdminRequest(admin.cookie, 'unban-user', {
      userId: bannedTarget.userId,
    });

    expect(selfPromotion.status).toBe(403);
    expect(targetPromotion.status).toBe(403);
    expect(updatePromotion.status).toBe(403);
    expect(createPromotion.status).toBe(403);
    await expect(createPromotion.json()).resolves.toMatchObject({
      code: 'YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS',
    });
    expect(banTarget.status).toBe(403);
    expect(removeTarget.status).toBe(403);
    expect(replacePassword.status).toBe(403);
    expect(impersonateTarget.status).toBe(403);
    expect(listUsers.status).toBe(403);
    expect(listSessions.status).toBe(403);
    expect(revokeSession.status).toBe(403);
    expect(revokeSessions.status).toBe(403);
    expect(unbanTarget.status).toBe(403);

    const rows = await db
      .select({ id: schema.user.id, role: schema.user.role, banned: schema.user.banned })
      .from(schema.user)
      .where(inArray(schema.user.id, [admin.userId, target.userId, bannedTarget.userId]));
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: admin.userId, role: 'admin', banned: false },
        { id: target.userId, role: 'visitor', banned: false },
        { id: bannedTarget.userId, role: 'visitor', banned: true },
      ]),
    );
    expect(rows).toHaveLength(3);

    expect(await getSession(new Headers({ cookie: target.cookie }))).not.toBeNull();

    const [created] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, 'unauthorized-superadmin@tickif.test'));
    expect(created).toBeUndefined();
  });

  it('update-user cannot smuggle a role change', async () => {
    const { cookie } = await createAuthedSession('+919800011023');
    const me = await getSession(new Headers({ cookie }));

    const update = (body: Record<string, string>) =>
      auth.handler(
        new Request('http://localhost:3000/api/auth/update-user', {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify(body),
        }),
      );

    // better-auth rejects the non-updatable field outright (FIELD_NOT_ALLOWED)
    const smuggle = await update({ name: 'Innocent Rename', role: 'superadmin' });
    expect(smuggle.status, 'smuggled role must be rejected').toBe(400);

    // positive control: a legitimate update succeeds and still cannot carry role
    const ok = await update({ name: 'Innocent Rename' });
    expect(ok.status, 'name-only update must work').toBe(200);

    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, me!.user.id));
    expect(row!.name).toBe('Innocent Rename');
    expect(row!.role).toBe('visitor');
  });
});
