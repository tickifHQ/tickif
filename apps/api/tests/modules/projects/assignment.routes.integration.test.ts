import { describe, expect, it } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeProject } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { activateOrganization, createRoleSession } from '../../helpers/auth.js';

async function setupOrganization() {
  const ownerSession = await createRoleSession('+919800007001', 'designer');
  const designer = await makeDesigner({ userId: ownerSession.userId, status: 'active' });
  await db.insert(schema.member).values({
    id: 'assignment-owner',
    organizationId: designer.orgId,
    userId: ownerSession.userId,
    role: 'owner',
    createdAt: new Date(),
  });
  const ownerCookie = await activateOrganization(ownerSession.cookie, designer.orgId);
  const project = await makeProject({ designerId: designer.id, status: 'published' });
  return { ownerCookie, designer, project };
}

async function addMember(input: {
  phone: string;
  organizationId: string;
  teamId: string;
  id: string;
  role?: 'admin' | 'member' | 'viewer';
  frozen?: boolean;
}) {
  const session = await createRoleSession(input.phone, 'designer');
  await db.insert(schema.member).values({
    id: input.id,
    organizationId: input.organizationId,
    userId: session.userId,
    role: input.role ?? 'member',
    frozen: input.frozen ?? false,
    frozenAt: input.frozen ? new Date() : null,
    freezeRank: input.frozen ? 1 : null,
    createdAt: new Date(),
  });
  await db.insert(schema.teamMember).values({
    id: `team-${input.id}`,
    teamId: input.teamId,
    userId: session.userId,
  });
  return { ...session, cookie: await activateOrganization(session.cookie, input.organizationId) };
}

describe('PATCH /api/projects/:id/responsible-member', () => {
  it('lets an owner assign, reassign, and clear an active same-organization member', async () => {
    const { ownerCookie, designer, project } = await setupOrganization();
    await addMember({
      phone: '+919800007002',
      organizationId: designer.orgId,
      teamId: designer.teamId,
      id: 'assignment-member',
    });

    for (const responsibleMemberId of ['assignment-member', null]) {
      const response = await app.request(`/api/projects/${project.id}/responsible-member`, {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ responsibleMemberId }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ responsibleMemberId });
    }
  });

  it('rejects cross-organization and frozen assignees', async () => {
    const { ownerCookie, designer, project } = await setupOrganization();
    await addMember({
      phone: '+919800007003',
      organizationId: designer.orgId,
      teamId: designer.teamId,
      id: 'frozen-member',
      frozen: true,
    });
    const other = await makeDesigner({ status: 'active' });
    const otherUser = await createRoleSession('+919800007004', 'designer');
    await db.insert(schema.member).values({
      id: 'other-member',
      organizationId: other.orgId,
      userId: otherUser.userId,
      role: 'member',
      createdAt: new Date(),
    });

    for (const responsibleMemberId of ['frozen-member', 'other-member']) {
      const response = await app.request(`/api/projects/${project.id}/responsible-member`, {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ responsibleMemberId }),
      });
      expect(response.status).toBe(422);
    }
    const [unchanged] = await db
      .select({ responsibleMemberId: schema.project.responsibleMemberId })
      .from(schema.project)
      .where(eq(schema.project.id, project.id));
    expect(unchanged?.responsibleMemberId).toBeNull();
  });

  it('rejects project assignment by a regular member', async () => {
    const { designer, project } = await setupOrganization();
    const member = await addMember({
      phone: '+919800007005',
      organizationId: designer.orgId,
      teamId: designer.teamId,
      id: 'regular-member',
    });

    const response = await app.request(`/api/projects/${project.id}/responsible-member`, {
      method: 'PATCH',
      headers: { cookie: member.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ responsibleMemberId: 'regular-member' }),
    });
    expect(response.status).toBe(403);
  });

  it('rejects an Admin when locked lifecycle entitlements suspend RBAC', async () => {
    const { designer, project } = await setupOrganization();
    const admin = await addMember({
      phone: '+919800007006',
      organizationId: designer.orgId,
      teamId: designer.teamId,
      id: 'locked-admin',
      role: 'admin',
    });
    const graceStartedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await db.insert(schema.subscription).values({
      organizationId: designer.orgId,
      planTier: 'corporate',
      subscriptionState: 'locked',
      preLapseTier: 'corporate',
      graceStartedAt,
      lockedAt: new Date(graceStartedAt.getTime() + 24 * 60 * 60 * 1000),
    });

    const response = await app.request(`/api/projects/${project.id}/responsible-member`, {
      method: 'PATCH',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ responsibleMemberId: 'locked-admin' }),
    });
    expect(response.status).toBe(403);
  });
});
