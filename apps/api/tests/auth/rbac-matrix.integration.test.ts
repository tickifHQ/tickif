import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
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
import { createRoleSession, createAuthedSession, backdateSession } from '../helpers/auth.js';
import { seedProjectOwnedBy, seedOrgWithMember } from '../helpers/seed.js';

/**
 * E-89: the explicit authorization matrix. Every actor class against every gate
 * class, the ownership triangle, and role-escalation attempts. Expected statuses
 * are data — changing who may do what MUST show up as a diff in these tables.
 */

type ActorName = 'anon' | 'expired' | 'visitor' | 'designer' | 'admin' | 'superadmin';
type Actors = Record<ActorName, string | undefined>;

const ROLES = ['visitor', 'designer', 'admin', 'superadmin'] as const;

/**
 * Mint one session per role (+ an expired one). Sequential on purpose:
 * createAuthedSession reads the globally-latest OTP, so concurrent flows would
 * steal each other's codes. Phones are unique per call-site block.
 */
async function mintActors(phoneBlock: number): Promise<Actors> {
  const phone = (n: number) => `+9198000${phoneBlock}${String(n).padStart(3, '0')}`;
  const sessions: string[] = [];
  for (const [i, role] of ROLES.entries()) {
    const { cookie } = await createRoleSession(phone(i), role);
    sessions.push(cookie);
  }
  const expired = await createRoleSession(phone(9), 'admin');
  await backdateSession(expired.userId, { expiresAt: new Date(Date.now() - 60_000) });
  return {
    anon: undefined,
    expired: expired.cookie,
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

// The gate-class matrix: expected status per actor per gate.
const GATE_MATRIX: Array<{ path: string } & Record<ActorName, number>> = [
  { path: '/public', anon: 200, expired: 200, visitor: 200, designer: 200, admin: 200, superadmin: 200 },
  { path: '/authed', anon: 401, expired: 401, visitor: 200, designer: 200, admin: 200, superadmin: 200 },
  { path: '/designer-only', anon: 401, expired: 401, visitor: 403, designer: 200, admin: 403, superadmin: 200 },
  { path: '/admin-only', anon: 401, expired: 401, visitor: 403, designer: 403, admin: 200, superadmin: 200 },
  { path: '/staff', anon: 401, expired: 401, visitor: 403, designer: 200, admin: 200, superadmin: 200 },
];

const ACTOR_NAMES: ActorName[] = ['anon', 'expired', 'visitor', 'designer', 'admin', 'superadmin'];

describe('RBAC matrix: gate classes × actors (E-89)', () => {
  it('matches the full gate matrix', async () => {
    const sample = gateApp();
    const actors = await mintActors(10);

    for (const row of GATE_MATRIX) {
      for (const actor of ACTOR_NAMES) {
        const res = await request(sample, row.path, actors[actor]);
        expect(res.status, `${actor} → GET ${row.path}`).toBe(row[actor]);
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
    const designer = await makeDesigner();

    // public routes: everyone, including anon
    for (const actor of ACTOR_NAMES) {
      expect(
        (await app.request('/health', { headers: actors[actor] ? { cookie: actors[actor]! } : {} }))
          .status,
        `${actor} → GET /health`,
      ).toBe(200);
      expect(
        (
          await app.request('/api/projects', {
            headers: actors[actor] ? { cookie: actors[actor]! } : {},
          })
        ).status,
        `${actor} → GET /api/projects`,
      ).toBe(200);
    }

    // POST /api/projects is requireAuth-only TODAY: anon/expired 401, every role 201.
    // When project creation gets role-gated, this table must be edited deliberately.
    const post = (cookie?: string) =>
      app.request('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ designerId: designer.id, title: `M ${cookie?.length ?? 0}` }),
      });
    expect((await post(actors.anon)).status, 'anon → POST /api/projects').toBe(401);
    expect((await post(actors.expired)).status, 'expired → POST /api/projects').toBe(401);
    for (const role of ROLES) {
      expect((await post(actors[role])).status, `${role} → POST /api/projects`).toBe(201);
    }
  });
});

describe('RBAC matrix: escalation attempts (E-89)', () => {
  function postSetRole(cookie: string, body: { userId: string; role: string }) {
    return auth.handler(
      new Request('http://localhost:3000/api/auth/admin/set-role', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(body),
      }),
    );
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

  it('update-user cannot smuggle a role change', async () => {
    const { cookie } = await createAuthedSession('+919800011023');
    const me = await getSession(new Headers({ cookie }));

    const res = await auth.handler(
      new Request('http://localhost:3000/api/auth/update-user', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: 'Innocent Rename', role: 'superadmin' }),
      }),
    );
    // whether better-auth ignores or rejects the extra field, the role must not change
    expect(res.status).toBeLessThan(500);
    const [row] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, me!.user.id));
    expect(row!.role).toBe('visitor');
  });
});
