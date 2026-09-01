import { describe, expect, it } from 'vitest';
import { and, db, eq, schema, sql } from '@repo/db';
import { makeOrganization, makeTeam } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';

async function createOrganizationContext(phone: string) {
  const account = await createRoleSession(phone, 'designer');
  const organization = await makeOrganization({ slug: `context-${account.userId}` });
  const team = await makeTeam({ organizationId: organization.id, name: 'Main Branch' });
  await db.insert(schema.member).values({
    id: `member-${account.userId}`,
    organizationId: organization.id,
    userId: account.userId,
    role: 'owner',
    createdAt: new Date(),
  });
  await db.insert(schema.teamMember).values({
    id: `team-member-${account.userId}`,
    teamId: team.id,
    userId: account.userId,
    createdAt: new Date(),
  });
  return { ...account, organization, team };
}

function setContext(cookie: string, body: unknown) {
  return app.request('/api/orgs/context', {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('personal and organization context', () => {
  it('defaults a user with no organization to personal context', async () => {
    const account = await createRoleSession('+919800004201', 'designer');

    const response = await app.request('/api/orgs/context', {
      headers: { cookie: account.cookie },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ context: { kind: 'personal' } });
  });

  it('validates, selects, and persists organization plus branch together', async () => {
    const account = await createOrganizationContext('+919800004202');

    const response = await setContext(account.cookie, {
      kind: 'organization',
      organizationId: account.organization.id,
      teamId: account.team.id,
    });

    expect(response.status).toBe(200);
    const [session] = await db
      .select({
        organizationId: schema.session.activeOrganizationId,
        teamId: schema.session.activeTeamId,
      })
      .from(schema.session)
      .where(eq(schema.session.userId, account.userId));
    const [preference] = await db
      .select()
      .from(schema.userContextPreference)
      .where(eq(schema.userContextPreference.userId, account.userId));
    expect(session).toEqual({
      organizationId: account.organization.id,
      teamId: account.team.id,
    });
    expect(preference).toMatchObject({
      contextKind: 'organization',
      organizationId: account.organization.id,
      teamId: account.team.id,
    });
  });

  it('restores the last valid organization context on the next request', async () => {
    const account = await createOrganizationContext('+919800004203');
    await db.insert(schema.userContextPreference).values({
      userId: account.userId,
      contextKind: 'organization',
      organizationId: account.organization.id,
      teamId: account.team.id,
    });

    const response = await app.request('/api/orgs/context', {
      headers: { cookie: account.cookie },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      context: {
        kind: 'organization',
        organizationId: account.organization.id,
        teamId: account.team.id,
      },
    });
  });

  it('rejects frozen context targets and repairs a stale preference to personal', async () => {
    const account = await createOrganizationContext('+919800004204');
    await db.insert(schema.userContextPreference).values({
      userId: account.userId,
      contextKind: 'organization',
      organizationId: account.organization.id,
      teamId: account.team.id,
    });
    await db
      .update(schema.team)
      .set({ frozen: true, frozenAt: new Date(), freezeRank: 1 })
      .where(eq(schema.team.id, account.team.id));

    const response = await setContext(account.cookie, {
      kind: 'organization',
      organizationId: account.organization.id,
      teamId: account.team.id,
    });

    expect(response.status).toBe(403);
    const [preference] = await db
      .select()
      .from(schema.userContextPreference)
      .where(eq(schema.userContextPreference.userId, account.userId));
    expect(preference).toMatchObject({
      contextKind: 'personal',
      organizationId: null,
      teamId: null,
    });
  });

  it('lets a visitor create multiple transactional organizations', async () => {
    const account = await createRoleSession('+919800004205', 'visitor');

    for (const userName of ['First Studio', 'Second Studio']) {
      const response = await app.request('/api/orgs', {
        method: 'POST',
        headers: { cookie: account.cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ entityType: 'individual', userName }),
      });
      expect(response.status).toBe(201);
    }

    const [counts] = await db
      .select({
        memberships: sql<number>`count(distinct ${schema.member.organizationId})::int`,
        branches: sql<number>`count(distinct ${schema.teamMember.teamId})::int`,
        profiles: sql<number>`count(distinct ${schema.designerProfile.id})::int`,
      })
      .from(schema.member)
      .innerJoin(schema.teamMember, eq(schema.teamMember.userId, schema.member.userId))
      .innerJoin(
        schema.designerProfile,
        and(
          eq(schema.designerProfile.orgId, schema.member.organizationId),
          eq(schema.designerProfile.teamId, schema.teamMember.teamId),
        ),
      )
      .where(eq(schema.member.userId, account.userId));
    const [user] = await db
      .select({ role: schema.user.role })
      .from(schema.user)
      .where(eq(schema.user.id, account.userId));
    expect(counts).toEqual({ memberships: 2, branches: 2, profiles: 2 });
    expect(user?.role).toBe('designer');
  });
});
