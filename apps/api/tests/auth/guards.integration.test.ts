import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getSession } from '@repo/auth';
import { db, schema } from '@repo/db';
import {
  withSession,
  withFreshSession,
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
  mergeResponseCookies,
} from '../helpers/auth.js';
import { seedProjectOwnedBy, seedOrgWithMember } from '../helpers/seed.js';

/**
 * E-87: the guards proven on sample routes with REAL sessions, roles, projects, and
 * org membership. The full role×route matrix over production routes is E-89.
 */
function sampleApp() {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.onError(onError);
  app.use('*', withSession);
  // Identity-only read: no authorization decision hangs off it, so the ≤5-min
  // session cookie cache is fine here.
  app.get('/session-role', (c) => c.json({ role: c.get('user')?.role ?? null }));
  // Mirrors GET /api/projects/{id}: anonymous callers must still be served, so it
  // cannot use requireAuth — but draft visibility is decided from the caller's live
  // role/ban state, so it must not read those from the cookie cache either.
  app.get('/draft-read', withFreshSession, (c) => {
    const user = c.get('user');
    return c.json({ role: user?.role ?? null, banned: !!user?.banned });
  });
  app.get('/admin-area', requireAnyRole(['admin']), (c) => c.json({ ok: true }));
  app.get('/designer-area', requireRole('designer'), (c) => c.json({ ok: true }));
  app.get('/session-org', requireRole('designer'), (c) =>
    c.json({ activeOrganizationId: c.get('session')?.activeOrganizationId ?? null }),
  );
  app.get('/session-context', requireRole('designer'), (c) =>
    c.json({
      activeOrganizationId: c.get('session')?.activeOrganizationId ?? null,
      activeTeamId: c.get('session')?.activeTeamId ?? null,
    }),
  );
  app.get(
    '/projects/:id/manage',
    requireOwnership(async (c) => {
      const id = c.req.param('id');
      if (!id) return null;
      const [row] = await db
        .select({ ownerUserId: schema.designerProfile.userId })
        .from(schema.project)
        .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
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

  it('decides authorization on fresh state, cached only for identity-only reads', async () => {
    const app = sampleApp();
    // createAuthedSession keeps the warm session_data blob (createRoleSession strips it),
    // so every request below carries a ≤5-min cached copy of the role/ban state.
    const { cookie } = await createAuthedSession('+919800000062');
    const session = await getSession(new Headers({ cookie }));
    const userId = session!.user.id;

    expect(await (await get(app, '/session-role', cookie)).json()).toEqual({ role: 'visitor' });
    expect((await get(app, '/admin-area', cookie)).status).toBe(403);
    expect(await (await get(app, '/draft-read', cookie)).json()).toEqual({
      role: 'visitor',
      banned: false,
    });

    await db.update(schema.user).set({ role: 'superadmin' }).where(eq(schema.user.id, userId));

    // The identity-only read may serve the cached role …
    expect(await (await get(app, '/session-role', cookie)).json()).toEqual({ role: 'visitor' });
    // … but every route that authorizes off it sees the promotion, guarded or not.
    expect((await get(app, '/admin-area', cookie)).status).toBe(200);
    expect(await (await get(app, '/draft-read', cookie)).json()).toEqual({
      role: 'superadmin',
      banned: false,
    });

    // A demotion + ban bites immediately instead of surviving the cookie cache TTL —
    // otherwise a demoted superadmin keeps reading every draft on the platform.
    await db
      .update(schema.user)
      .set({ role: 'visitor', banned: true })
      .where(eq(schema.user.id, userId));

    expect((await get(app, '/admin-area', cookie)).status).toBe(403);
    expect(await (await get(app, '/draft-read', cookie)).json()).toEqual({
      role: 'visitor',
      banned: true,
    });
  });

  it('replaces the stale session_data cookie on the response instead of letting it live out its TTL', async () => {
    const app = sampleApp();
    const { cookie } = await createAuthedSession('+919800000064');
    const session = await getSession(new Headers({ cookie }));
    await db.update(schema.user).set({ role: 'admin' }).where(eq(schema.user.id, session!.user.id));

    const response = await get(app, '/admin-area', cookie);
    expect(response.status).toBe(200);

    // The guard's fresh read re-issued the cache blob; a client that keeps it now reads
    // the new role even from a cached, unguarded route.
    const refreshed = mergeResponseCookies(cookie, response);
    expect(refreshed).not.toBe(cookie);
    expect(await (await get(app, '/session-role', refreshed)).json()).toEqual({ role: 'admin' });
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
      (await get(app, '/projects/00000000-0000-4000-8000-000000000000/manage', owner.cookie))
        .status,
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

  it('keeps a sole organization member in personal context until they select it', async () => {
    const app = sampleApp();
    const designer = await createRoleSession('+919800000060', 'designer');
    const organizationId = await seedOrgWithMember(designer.userId);
    await db.insert(schema.member).values({
      id: `duplicate-membership-${designer.userId}`,
      organizationId,
      userId: designer.userId,
      role: 'member',
      createdAt: new Date(),
    });

    const response = await get(app, '/session-org', designer.cookie);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ activeOrganizationId: null });
    const repairedCookie = mergeResponseCookies(designer.cookie, response);
    const repairedSession = await getSession(new Headers({ cookie: repairedCookie }));
    expect(repairedSession?.session.activeOrganizationId).toBeNull();
    const [session] = await db
      .select({ activeOrganizationId: schema.session.activeOrganizationId })
      .from(schema.session)
      .where(eq(schema.session.userId, designer.userId));
    expect(session?.activeOrganizationId).toBeNull();
  });

  it('does not guess an active organization for a multi-org legacy session', async () => {
    const app = sampleApp();
    const designer = await createRoleSession('+919800000061', 'designer');
    const firstOrgId = await seedOrgWithMember(designer.userId);
    const secondOrgId = `${firstOrgId}-second`;
    await db.insert(schema.organization).values({
      id: secondOrgId,
      name: 'Second Studio',
      slug: secondOrgId,
      createdAt: new Date(),
    });
    await db.insert(schema.member).values({
      id: `mem-second-${designer.userId}`,
      organizationId: secondOrgId,
      userId: designer.userId,
      role: 'member',
      createdAt: new Date(),
    });

    const response = await get(app, '/session-org', designer.cookie);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ activeOrganizationId: null });
  });

  it('preserves organization roll-up when reconciliation clears the session branch', async () => {
    const app = sampleApp();
    const designer = await createRoleSession('+919800000065', 'designer');
    const organizationId = await seedOrgWithMember(designer.userId);
    const teamId = `remaining-team-${designer.userId}`;
    await db.insert(schema.team).values({
      id: teamId,
      organizationId,
      name: 'Remaining Branch',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await db.insert(schema.teamMember).values({
      id: `remaining-team-member-${designer.userId}`,
      teamId,
      userId: designer.userId,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await db
      .update(schema.session)
      .set({ activeOrganizationId: organizationId, activeTeamId: null })
      .where(eq(schema.session.userId, designer.userId));

    const response = await get(app, '/session-context', designer.cookie);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      activeOrganizationId: organizationId,
      activeTeamId: null,
    });
    const [session] = await db
      .select({ activeTeamId: schema.session.activeTeamId })
      .from(schema.session)
      .where(eq(schema.session.userId, designer.userId));
    expect(session?.activeTeamId).toBeNull();
  });

  /**
   * E-184 regression: onboarding creates the studio and activates it server-side, but the
   * client keeps the session_data blob it minted BEFORE onboarding. A protected route that
   * reads `activeOrganizationId` from that blob works against the previous organization for
   * up to the cache TTL — the designer lands in the wrong workspace right after signing up.
   */
  it('reads the organization activated during onboarding, not the pre-onboarding cached one (E-184)', async () => {
    const app = sampleApp();
    const { cookie } = await createAuthedSession('+919800000063');
    const minted = await getSession(new Headers({ cookie }));
    const userId = minted!.user.id;
    await db.update(schema.user).set({ role: 'designer' }).where(eq(schema.user.id, userId));

    // Pre-onboarding state: the designer was already invited into someone else's studio,
    // and their warm cookie caches that as the active organization.
    const invitedOrgId = await seedOrgWithMember(userId);
    const staleCookie = await activateOrganization(cookie, invitedOrgId);
    expect(
      (await getSession(new Headers({ cookie: staleCookie })))?.session.activeOrganizationId,
    ).toBe(invitedOrgId);

    // Onboarding: their own studio is created and activated exactly as POST /api/profiles/me
    // does — and the refreshed cookie is dropped, as it is whenever the browser is not the
    // caller that completed onboarding (server component, another tab, a retried request).
    const ownOrgId = `${invitedOrgId}-own-studio`;
    await db.insert(schema.organization).values({
      id: ownOrgId,
      name: 'Own Studio',
      slug: ownOrgId,
      createdAt: new Date(),
    });
    await db.insert(schema.member).values({
      id: `mem-own-${userId}`,
      organizationId: ownOrgId,
      userId,
      role: 'owner',
      createdAt: new Date(),
    });
    await activateOrganization(staleCookie, ownOrgId);

    // The cached blob still points at the old studio …
    expect(
      (await getSession(new Headers({ cookie: staleCookie })))?.session.activeOrganizationId,
    ).toBe(invitedOrgId);
    // … while the protected route must work against the newly onboarded one.
    const response = await get(app, '/session-org', staleCookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ activeOrganizationId: ownOrgId });
  });

  it('denies a banned account on a live session', async () => {
    const app = sampleApp();
    const { cookie, userId } = await createRoleSession('+919800000059', 'admin');
    expect((await get(app, '/admin-area', cookie)).status).toBe(200);

    await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, userId));
    expect((await get(app, '/admin-area', cookie)).status).toBe(403);
  });
});
