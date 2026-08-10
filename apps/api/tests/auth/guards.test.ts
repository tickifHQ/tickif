import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { AuthVariables, Ownership } from '../../src/lib/auth-middleware.js';
import { requireRole, requireAnyRole, requireOwnership } from '../../src/lib/auth-middleware.js';
import { onError } from '../../src/lib/errors.js';

const { isOrgMemberMock, getSessionWithHeadersMock } = vi.hoisted(() => ({
  isOrgMemberMock: vi.fn(),
  getSessionWithHeadersMock: vi.fn(),
}));
vi.mock('../../src/modules/orgs/service.js', () => ({
  orgsService: {
    findSoleOrganizationForUser: vi.fn(),
    isMember: isOrgMemberMock,
  },
}));
vi.mock('@repo/auth', () => ({
  getSession: vi.fn(),
  getSessionWithHeaders: getSessionWithHeadersMock,
  setActiveOrganization: vi.fn(),
}));

type StubUser = {
  id: string;
  role?: string | null;
  banned?: boolean | null;
  banExpires?: Date | null;
} | null;

function appWithUser(user: StubUser, ownership?: Ownership | null) {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.onError(onError);
  app.use('*', async (c, next) => {
    c.set('user', user as AuthVariables['user']);
    c.set('session', null);
    c.set('sessionFresh', true);
    await next();
  });
  app.get('/admin', requireAnyRole(['admin']), (c) => c.json({ ok: true }));
  app.get('/designer', requireRole('designer'), (c) => c.json({ ok: true }));
  app.get('/staff', requireAnyRole(['admin', 'designer']), (c) => c.json({ ok: true }));
  app.get('/none', requireAnyRole([]), (c) => c.json({ ok: true }));
  app.get(
    '/owned',
    requireOwnership(async () => ownership ?? null),
    (c) => c.json({ ok: true }),
  );
  app.get(
    '/owned-throws',
    requireOwnership(async () => {
      throw new Error('resolver boom');
    }),
    (c) => c.json({ ok: true }),
  );
  return app;
}

describe('RBAC guards (unit)', () => {
  beforeEach(() => {
    isOrgMemberMock.mockReset();
    getSessionWithHeadersMock.mockReset();
  });

  it('401s unauthenticated users on role and ownership gates', async () => {
    const app = appWithUser(null);
    expect((await app.request('/admin')).status).toBe(401);
    expect((await app.request('/designer')).status).toBe(401);
    expect((await app.request('/owned')).status).toBe(401);
  });

  it('enforces exact role match with no hierarchy', async () => {
    expect((await appWithUser({ id: 'u1', role: 'admin' }).request('/admin')).status).toBe(200);
    expect((await appWithUser({ id: 'u1', role: 'designer' }).request('/admin')).status).toBe(403);
    expect((await appWithUser({ id: 'u1', role: 'visitor' }).request('/admin')).status).toBe(403);
    // no hierarchy: admin does not pass a designer-only gate
    expect((await appWithUser({ id: 'u1', role: 'admin' }).request('/designer')).status).toBe(403);
  });

  it('requireAnyRole accepts any of the listed roles', async () => {
    expect((await appWithUser({ id: 'u1', role: 'designer' }).request('/staff')).status).toBe(200);
    expect((await appWithUser({ id: 'u1', role: 'admin' }).request('/staff')).status).toBe(200);
    expect((await appWithUser({ id: 'u1', role: 'visitor' }).request('/staff')).status).toBe(403);
  });

  it('superadmin passes every gate', async () => {
    const su = { id: 'su', role: 'superadmin' };
    expect((await appWithUser(su).request('/admin')).status).toBe(200);
    expect((await appWithUser(su).request('/designer')).status).toBe(200);
    expect((await appWithUser(su, { ownerUserId: 'someone-else' }).request('/owned')).status).toBe(
      200,
    );
  });

  it('ownership: owner passes, stranger 403, missing resource 404', async () => {
    const u = { id: 'u1', role: 'designer' };
    expect((await appWithUser(u, { ownerUserId: 'u1' }).request('/owned')).status).toBe(200);
    expect((await appWithUser(u, { ownerUserId: 'u2' }).request('/owned')).status).toBe(403);
    expect((await appWithUser(u, null).request('/owned')).status).toBe(404);
  });

  it('ownership: org membership grants access, non-membership does not', async () => {
    const u = { id: 'u1', role: 'designer' };
    isOrgMemberMock.mockResolvedValueOnce(true);
    expect(
      (await appWithUser(u, { ownerUserId: 'u2', organizationId: 'org1' }).request('/owned'))
        .status,
    ).toBe(200);
    isOrgMemberMock.mockResolvedValueOnce(false);
    expect(
      (await appWithUser(u, { ownerUserId: 'u2', organizationId: 'org1' }).request('/owned'))
        .status,
    ).toBe(403);
  });

  it('ownership: does not query membership for the owner', async () => {
    const u = { id: 'u1', role: 'designer' };
    await appWithUser(u, { ownerUserId: 'u1', organizationId: 'org1' }).request('/owned');
    expect(isOrgMemberMock).not.toHaveBeenCalled();
  });

  it('ownership: platform admin gets no implicit pass', async () => {
    const admin = { id: 'a1', role: 'admin' };
    expect((await appWithUser(admin, { ownerUserId: 'u2' }).request('/owned')).status).toBe(403);
  });

  it('fails closed on degenerate input: ownerless resource, empty role list, missing role', async () => {
    const u = { id: 'u1', role: 'designer' };
    // no owner, no org → nobody but superadmin
    expect((await appWithUser(u, { ownerUserId: null }).request('/owned')).status).toBe(403);
    // empty allow-list → only superadmin
    expect((await appWithUser(u).request('/none')).status).toBe(403);
    expect((await appWithUser({ id: 's', role: 'superadmin' }).request('/none')).status).toBe(200);
    // missing/unknown role → 403, not a crash
    expect((await appWithUser({ id: 'u2', role: null }).request('/staff')).status).toBe(403);
    expect((await appWithUser({ id: 'u3', role: 'banana' }).request('/staff')).status).toBe(403);
  });

  it('denies banned accounts on every gate, honoring banExpires', async () => {
    const banned = { id: 'b1', role: 'admin', banned: true };
    expect((await appWithUser(banned).request('/admin')).status).toBe(403);
    expect((await appWithUser(banned, { ownerUserId: 'b1' }).request('/owned')).status).toBe(403);
    // lapsed ban no longer blocks
    const lapsed = {
      id: 'b2',
      role: 'admin',
      banned: true,
      banExpires: new Date(Date.now() - 1000),
    };
    expect((await appWithUser(lapsed).request('/admin')).status).toBe(200);
    // future-dated ban still blocks
    const active = {
      id: 'b4',
      role: 'admin',
      banned: true,
      banExpires: new Date(Date.now() + 60_000),
    };
    expect((await appWithUser(active).request('/admin')).status).toBe(403);
    // banned superadmin is still banned
    const bannedSu = { id: 'b3', role: 'superadmin', banned: true };
    expect((await appWithUser(bannedSu).request('/admin')).status).toBe(403);
  });

  it('does not re-read the session when the cached read already found nobody', async () => {
    const app = new Hono<{ Variables: AuthVariables }>();
    app.onError(onError);
    app.use('*', async (c, next) => {
      c.set('user', null);
      c.set('session', null);
      c.set('sessionFresh', false);
      await next();
    });
    app.get('/admin', requireAnyRole(['admin']), (c) => c.json({ ok: true }));

    expect((await app.request('/admin')).status).toBe(401);
    // The cookie cache only ever caches a positive session, so a second lookup could not
    // change the answer — a revoked-cookie replay must not double the query cost.
    expect(getSessionWithHeadersMock).not.toHaveBeenCalled();
  });

  it('ownership: a throwing resolver surfaces as 500, never a pass', async () => {
    const u = { id: 'u1', role: 'designer' };
    expect((await appWithUser(u).request('/owned-throws')).status).toBe(500);
  });
});
