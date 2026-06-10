import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db, schema } from '@repo/db';
import {
  withSession,
  requireAnyRole,
  requireRole,
  requireOwnership,
  type AuthVariables,
} from '../../src/lib/auth-middleware.js';
import { onError } from '../../src/lib/errors.js';
import { createRoleSession, backdateSession } from '../helpers/auth.js';

/**
 * E-87: the guards proven on sample routes with REAL sessions, roles, projects, and
 * org membership. The full role×route matrix over production routes is E-89.
 */
function sampleApp() {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.onError(onError);
  app.use('*', withSession);
  app.get('/admin-area', requireAnyRole(['admin']), (c) => c.json({ ok: true }));
  app.get('/designer-area', requireRole('designer'), (c) => c.json({ ok: true }));
  app.get(
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
  app.get(
    '/org-resources/:orgId/manage',
    requireOwnership(async (c) => ({
      ownerUserId: null,
      organizationId: c.req.param('orgId'),
    })),
    (c) => c.json({ ok: true }),
  );
  return app;
}

function get(app: ReturnType<typeof sampleApp>, path: string, cookie?: string) {
  return app.request(path, { headers: cookie ? { cookie } : {} });
}

async function seedProjectOwnedBy(userId: string): Promise<string> {
  const [profile] = await db
    .insert(schema.designerProfile)
    .values({ userId, studioName: 'Studio X' })
    .returning({ id: schema.designerProfile.id });
  const [project] = await db
    .insert(schema.project)
    .values({ designerId: profile!.id, title: 'P', slug: `p-${userId.slice(0, 8)}` })
    .returning({ id: schema.project.id });
  return project!.id;
}

async function seedOrgWithMember(userId: string): Promise<string> {
  const orgId = `org-${userId.slice(0, 8)}`;
  await db.insert(schema.organization).values({
    id: orgId,
    name: 'Acme Studio',
    slug: orgId,
    createdAt: new Date(),
  });
  await db.insert(schema.member).values({
    id: `mem-${userId.slice(0, 8)}`,
    organizationId: orgId,
    userId,
    role: 'member',
    createdAt: new Date(),
  });
  return orgId;
}

describe('RBAC guards (integration, E-87)', () => {
  it('401s without a session and after the session expires', async () => {
    const app = sampleApp();
    expect((await get(app, '/admin-area')).status).toBe(401);

    const { cookie, userId } = await createRoleSession('+919800000050', 'admin');
    expect((await get(app, '/admin-area', cookie)).status).toBe(200);

    await backdateSession(userId, { expiresAt: new Date(Date.now() - 60_000) });
    expect((await get(app, '/admin-area', cookie)).status).toBe(401);
  });

  it('enforces roles end-to-end: visitor 403, admin 200, superadmin 200, no hierarchy', async () => {
    const app = sampleApp();
    const visitor = await createRoleSession('+919800000051', 'visitor');
    const admin = await createRoleSession('+919800000052', 'admin');
    const superadmin = await createRoleSession('+919800000053', 'superadmin');

    expect((await get(app, '/admin-area', visitor.cookie)).status).toBe(403);
    expect((await get(app, '/admin-area', admin.cookie)).status).toBe(200);
    expect((await get(app, '/admin-area', superadmin.cookie)).status).toBe(200);
    // no hierarchy: admin does not pass the designer-only gate; superadmin does
    expect((await get(app, '/designer-area', admin.cookie)).status).toBe(403);
    expect((await get(app, '/designer-area', superadmin.cookie)).status).toBe(200);
  });

  it('ownership: owner 200, other designer 403, superadmin 200, unknown id 404', async () => {
    const app = sampleApp();
    const owner = await createRoleSession('+919800000054', 'designer');
    const stranger = await createRoleSession('+919800000055', 'designer');
    const superadmin = await createRoleSession('+919800000056', 'superadmin');
    const projectId = await seedProjectOwnedBy(owner.userId);

    expect((await get(app, `/projects/${projectId}/manage`, owner.cookie)).status).toBe(200);
    expect((await get(app, `/projects/${projectId}/manage`, stranger.cookie)).status).toBe(403);
    expect((await get(app, `/projects/${projectId}/manage`, superadmin.cookie)).status).toBe(200);
    expect(
      (
        await get(
          app,
          '/projects/00000000-0000-4000-8000-000000000000/manage',
          owner.cookie,
        )
      ).status,
    ).toBe(404);
  });

  it('ownership via org membership: member 200, member of a DIFFERENT org 403', async () => {
    const app = sampleApp();
    const member = await createRoleSession('+919800000057', 'designer');
    const outsider = await createRoleSession('+919800000058', 'designer');
    const orgA = await seedOrgWithMember(member.userId);
    // tenant isolation: the outsider IS a member somewhere — just not of org A
    await seedOrgWithMember(outsider.userId);

    expect((await get(app, `/org-resources/${orgA}/manage`, member.cookie)).status).toBe(200);
    expect((await get(app, `/org-resources/${orgA}/manage`, outsider.cookie)).status).toBe(403);
  });

  it('denies a banned account on a live session', async () => {
    const app = sampleApp();
    const { cookie, userId } = await createRoleSession('+919800000059', 'admin');
    expect((await get(app, '/admin-area', cookie)).status).toBe(200);

    await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, userId));
    expect((await get(app, '/admin-area', cookie)).status).toBe(403);
  });
});
