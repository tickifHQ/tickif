import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { organizationPageMetadataSchema } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { makeDesigner, makeOrganization, makeTeam, makeUser } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { activateOrganization, createRoleSession } from '../../helpers/auth.js';

async function fixture() {
  const actor = await createRoleSession('+919800007125', 'designer');
  const org = await makeOrganization();
  await db.insert(schema.member).values({
    id: 'list-owner',
    organizationId: org.id,
    userId: actor.userId,
    role: 'owner',
    createdAt: new Date(),
  });
  await db.insert(schema.subscription).values({ organizationId: org.id, planTier: 'corporate' });
  const teams = [] as Awaited<ReturnType<typeof makeTeam>>[];
  for (let i = 1; i <= 25; i++) {
    const team = await makeTeam({
      organizationId: org.id,
      name: `Branch ${String(i).padStart(2, '0')}`,
    });
    await makeDesigner({ orgId: org.id, teamId: team.id, userId: actor.userId, status: 'active' });
    teams.push(team);
    const user = await makeUser({
      name: `Person ${String(i).padStart(2, '0')}`,
      email: `person-${i}@example.com`,
    });
    await db.insert(schema.member).values({
      id: `list-member-${i}`,
      organizationId: org.id,
      userId: user.id,
      role: 'member',
      createdAt: new Date('2026-10-01T00:00:00Z'),
    });
    await db.insert(schema.teamMember).values({
      id: `list-assignment-${i}`,
      teamId: teams[0]!.id,
      userId: user.id,
      createdAt: new Date(),
    });
    await db.insert(schema.invitation).values({
      id: `list-invite-${i}`,
      organizationId: org.id,
      email: `invite-${String(i).padStart(2, '0')}@example.com`,
      role: 'member',
      status: 'pending',
      inviterId: actor.userId,
      expiresAt: new Date('2099-01-01T00:00:00Z'),
      createdAt: new Date('2026-10-01T00:00:00Z'),
    });
  }
  await makeDesigner({ displayName: 'Foreign branch' });
  return { cookie: await activateOrganization(actor.cookie, org.id), org, teams, actor };
}

async function get(path: string, cookie: string) {
  const response = await app.request(path, { headers: { cookie } });
  expect(response.status).toBe(200);
  return response.json();
}

describe('organization management list APIs', () => {
  it('filters in SQL before stable pagination for all four lists and clamps shrinking pages', async () => {
    const { cookie, teams } = await fixture();
    const paths = [
      '/api/orgs/branches/list',
      `/api/orgs/branches/${teams[0]!.id}/members`,
      '/api/orgs/members',
      '/api/orgs/invitations',
    ];
    for (const path of paths) {
      const pageSchema = organizationPageMetadataSchema.extend({
        items: z.array(
          z.object({ id: z.string().optional(), userId: z.string().optional() }).passthrough(),
        ),
      });
      const first = pageSchema.parse(await get(`${path}?page=1&limit=12`, cookie));
      const second = pageSchema.parse(await get(`${path}?page=2&limit=12`, cookie));
      expect(first.items).toHaveLength(12);
      expect(second.items).toHaveLength(12);
      expect(first).toMatchObject({ page: 1, limit: 12, totalPages: 3 });
      expect(first.total).toBe(path.endsWith('/members') ? 26 : 25);
      const ids = (items: Array<{ id?: string; userId?: string }>) =>
        items.map((item) => item.id ?? item.userId);
      expect(ids(first.items).some((id) => ids(second.items).includes(id))).toBe(false);
      expect(pageSchema.parse(await get(`${path}?page=2&limit=12`, cookie))).toEqual(second);
      expect(await get(`${path}?page=999&limit=24`, cookie)).toMatchObject({
        page: 2,
        limit: 24,
        totalPages: 2,
      });
      const missing = await get(`${path}?page=9&limit=12&q=not-found`, cookie);
      expect(missing).toMatchObject({ items: [], page: 1, total: 0, totalPages: 1 });
      expect(await get(`${path}?q=%25`, cookie)).toMatchObject({ items: [], total: 0 });
      expect(await get(`${path}?q=%5F`, cookie)).toMatchObject({ items: [], total: 0 });
    }
    expect(
      await get('/api/orgs/branches/list?page=3&limit=12&q=BRANCH%2025', cookie),
    ).toMatchObject({
      total: 1,
      page: 1,
      items: [expect.objectContaining({ name: 'Branch 25', members: [] })],
    });
    for (const path of [`/api/orgs/branches/${teams[0]!.id}/members`, '/api/orgs/members']) {
      expect(await get(`${path}?q=PERSON-25%40EXAMPLE.COM`, cookie)).toMatchObject({
        total: 1,
        items: [expect.objectContaining({ name: 'Person 25' })],
      });
    }
    expect(await get('/api/orgs/invitations?q=INVITE-25', cookie)).toMatchObject({ total: 1 });
    expect(
      await get(`/api/orgs/members?availableForBranchId=${teams[0]!.id}`, cookie),
    ).toMatchObject({ total: 0 });
    expect(
      await get(`/api/orgs/members?availableForBranchId=${teams[1]!.id}&q=person-25`, cookie),
    ).toMatchObject({ total: 1 });
    expect(await get('/api/orgs/members?transferEligible=true', cookie)).toMatchObject({
      total: 25,
    });
    expect(await get('/api/orgs/summary', cookie)).toMatchObject({
      members: [],
      invitations: [],
      ownerCount: 1,
      pendingInvitationCount: 25,
      currentUserMemberId: 'list-owner',
    });
  });

  it('guards authentication, organization and branch visibility, invitation permissions and query bounds', async () => {
    const { cookie, teams, org } = await fixture();
    for (const path of [
      '/api/orgs/branches/list',
      `/api/orgs/branches/${teams[0]!.id}/members`,
      '/api/orgs/members',
      '/api/orgs/invitations',
    ]) {
      expect((await app.request(path)).status).toBe(401);
      for (const query of ['page=0', 'limit=0', 'limit=101', 'page=1.5', `q=${'x'.repeat(201)}`]) {
        expect((await app.request(`${path}?${query}`, { headers: { cookie } })).status).toBe(422);
      }
    }
    const viewer = await createRoleSession('+919800007126', 'designer');
    await db.insert(schema.member).values({
      id: 'list-viewer',
      organizationId: org.id,
      userId: viewer.userId,
      role: 'viewer',
      createdAt: new Date(),
    });
    await db.insert(schema.teamMember).values({
      id: 'viewer-assignment',
      teamId: teams[0]!.id,
      userId: viewer.userId,
      createdAt: new Date(),
    });
    const viewerCookie = await activateOrganization(viewer.cookie, org.id);
    expect(await get('/api/orgs/branches/list', viewerCookie)).toMatchObject({ total: 1 });
    expect(
      (
        await app.request(`/api/orgs/branches/${teams[1]!.id}/members`, {
          headers: { cookie: viewerCookie },
        })
      ).status,
    ).toBe(404);
    expect(
      (await app.request('/api/orgs/invitations', { headers: { cookie: viewerCookie } })).status,
    ).toBe(403);
    expect(
      (
        await app.request(`/api/orgs/members?availableForBranchId=${teams[0]!.id}`, {
          headers: { cookie: viewerCookie },
        })
      ).status,
    ).toBe(403);
    const foreign = await makeTeam();
    expect(
      (await app.request(`/api/orgs/branches/${foreign.id}/members`, { headers: { cookie } }))
        .status,
    ).toBe(404);
  });
});
