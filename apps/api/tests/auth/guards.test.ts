import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { AuthVariables, Ownership } from '../../src/lib/auth-middleware.js';
import {
  requireRole,
  requireAnyRole,
  requireOwnership,
} from '../../src/lib/auth-middleware.js';
import { onError } from '../../src/lib/errors.js';

const { isOrgMemberMock } = vi.hoisted(() => ({ isOrgMemberMock: vi.fn() }));
vi.mock('../../src/modules/orgs/repository.js', () => ({ isOrgMember: isOrgMemberMock }));

function appWithUser(user: { id: string; role: string } | null, ownership?: Ownership | null) {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.onError(onError);
  app.use('*', async (c, next) => {
    c.set('user', user as AuthVariables['user']);
    c.set('session', null);
    await next();
  });
  app.get('/admin', requireAnyRole(['admin']), (c) => c.json({ ok: true }));
  app.get('/designer', requireRole('designer'), (c) => c.json({ ok: true }));
  app.get('/staff', requireAnyRole(['admin', 'designer']), (c) => c.json({ ok: true }));
  app.get('/owned', requireOwnership(async () => ownership ?? null), (c) => c.json({ ok: true }));
  return app;
}

describe('RBAC guards (unit)', () => {
  beforeEach(() => {
    isOrgMemberMock.mockReset();
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
    expect(
      (await appWithUser(su, { ownerUserId: 'someone-else' }).request('/owned')).status,
    ).toBe(200);
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
});
