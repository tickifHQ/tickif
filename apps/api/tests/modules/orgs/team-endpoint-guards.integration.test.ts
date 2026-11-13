import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { and, db, eq, schema } from '@repo/db';
import { makeDesigner, makeOrganization, makeTeam } from '@repo/db/testing';
import type { OrganizationMemberRole } from '@repo/contracts';
import { app } from '../../../src/app.js';
import { activateOrganization, createRoleSession } from '../../helpers/auth.js';

async function joinOrganization(
  userId: string,
  organizationId: string,
  role: OrganizationMemberRole,
  frozen = false,
) {
  const [membership] = await db
    .insert(schema.member)
    .values({
      id: `member-${organizationId}-${userId}`,
      organizationId,
      userId,
      role,
      frozen,
      frozenAt: frozen ? new Date() : null,
      freezeRank: frozen ? 1 : null,
      createdAt: new Date(),
    })
    .returning();
  await db
    .insert(schema.subscription)
    .values({ organizationId, planTier: 'corporate' })
    .onConflictDoNothing();
  return membership!;
}

async function corporateOrganization(slug: string) {
  const organization = await makeOrganization({ slug });
  const team = await makeTeam({ organizationId: organization.id, name: 'Main' });
  await makeDesigner({ orgId: organization.id, teamId: team.id, status: 'active' });
  return { organization, team };
}

function postTeam(path: string, cookie: string, body: Record<string, unknown>) {
  return app.request(`/api/auth/organization/${path}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function teamIdsFor(userId: string) {
  const rows = await db
    .select({ teamId: schema.teamMember.teamId })
    .from(schema.teamMember)
    .where(eq(schema.teamMember.userId, userId));
  return rows.map((row) => row.teamId).sort();
}

async function requestDeletion(organizationId: string, requestedByUserId: string) {
  const now = new Date();
  await db.insert(schema.organizationRetention).values({
    organizationId,
    status: 'deletion_requested',
    requestedByUserId,
    requestedAt: now,
    archiveDueAt: new Date(now.getTime() + 86_400_000),
    hardDeleteDueAt: new Date(now.getTime() + 2 * 86_400_000),
    delistWindowDays: 1,
    archiveWindowDays: 1,
  });
}

describe('Better Auth branch endpoints', () => {
  it('refuses branch changes from a frozen admin', async () => {
    const { organization, team } = await corporateOrganization('frozen-admin-branches');
    const other = await makeTeam({ organizationId: organization.id, name: 'Other' });
    const teammate = await createRoleSession('+919811300001', 'designer');
    await joinOrganization(teammate.userId, organization.id, 'member');
    await db
      .insert(schema.teamMember)
      .values({
        id: randomUUID(),
        teamId: team.id,
        userId: teammate.userId,
        createdAt: new Date(),
      });
    const admin = await createRoleSession('+919811300002', 'designer');
    await joinOrganization(admin.userId, organization.id, 'admin');
    const cookie = await activateOrganization(admin.cookie, organization.id);
    await db
      .update(schema.member)
      .set({ frozen: true, frozenAt: new Date(), freezeRank: 1 })
      .where(eq(schema.member.userId, admin.userId));

    const responses = [
      await postTeam('add-team-member', cookie, { teamId: other.id, userId: teammate.userId }),
      await postTeam('remove-team-member', cookie, { teamId: team.id, userId: teammate.userId }),
      await postTeam('update-team', cookie, { teamId: team.id, data: { name: 'Renamed' } }),
      await postTeam('create-team', cookie, { organizationId: organization.id, name: 'New' }),
    ];

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403]);
    expect(await teamIdsFor(teammate.userId)).toEqual([team.id]);
    const [unchanged] = await db.select().from(schema.team).where(eq(schema.team.id, team.id));
    expect(unchanged?.name).toBe('Main');
    expect(
      await db.select().from(schema.team).where(eq(schema.team.organizationId, organization.id)),
    ).toHaveLength(2);
  });

  it('treats an empty organizationId as the active organization, as Better Auth does', async () => {
    const { organization, team } = await corporateOrganization('empty-selector-branches');
    const admin = await createRoleSession('+919811300006', 'designer');
    await joinOrganization(admin.userId, organization.id, 'admin');
    const cookie = await activateOrganization(admin.cookie, organization.id);
    await db
      .update(schema.member)
      .set({ frozen: true, frozenAt: new Date(), freezeRank: 1 })
      .where(eq(schema.member.userId, admin.userId));

    const responses = [
      await postTeam('create-team', cookie, { organizationId: '', name: 'Empty selector' }),
      await postTeam('update-team', cookie, {
        teamId: team.id,
        data: { organizationId: '', name: 'Renamed' },
      }),
    ];

    expect(responses.map((response) => response.status)).toEqual([403, 403]);
    expect(
      await db.select().from(schema.team).where(eq(schema.team.organizationId, organization.id)),
    ).toHaveLength(1);
  });

  it('checks the organization a renamed branch belongs to, not the active one', async () => {
    const active = await corporateOrganization('active-organization');
    const frozen = await corporateOrganization('frozen-organization');
    const admin = await createRoleSession('+919811300003', 'designer');
    await joinOrganization(admin.userId, active.organization.id, 'admin');
    await joinOrganization(admin.userId, frozen.organization.id, 'admin', true);
    const cookie = await activateOrganization(admin.cookie, active.organization.id);

    const response = await postTeam('update-team', cookie, {
      teamId: frozen.team.id,
      data: { organizationId: frozen.organization.id, name: 'Renamed elsewhere' },
    });

    expect(response.status).toBe(403);
    const [team] = await db.select().from(schema.team).where(eq(schema.team.id, frozen.team.id));
    expect(team?.name).toBe('Main');
  });

  it('refuses branch changes while organization deletion is pending', async () => {
    const { organization, team } = await corporateOrganization('retained-branches');
    const owner = await createRoleSession('+919811300004', 'designer');
    await joinOrganization(owner.userId, organization.id, 'owner');
    const teammate = await createRoleSession('+919811300005', 'designer');
    await joinOrganization(teammate.userId, organization.id, 'member');
    const cookie = await activateOrganization(owner.cookie, organization.id);
    await requestDeletion(organization.id, owner.userId);

    const responses = [
      await postTeam('create-team', cookie, {
        organizationId: organization.id,
        name: 'Opened during deletion',
      }),
      await postTeam('add-team-member', cookie, { teamId: team.id, userId: teammate.userId }),
      await postTeam('update-team', cookie, { teamId: team.id, data: { name: 'Renamed' } }),
    ];

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403]);
    await expect(responses[0]!.json()).resolves.toMatchObject({
      code: 'ORGANIZATION_RETENTION_ACTIVE',
    });
    expect(
      await db
        .select()
        .from(schema.designerProfile)
        .where(
          and(
            eq(schema.designerProfile.orgId, organization.id),
            eq(schema.designerProfile.displayName, 'Opened during deletion'),
          ),
        ),
    ).toHaveLength(0);
    expect(await teamIdsFor(teammate.userId)).toEqual([]);
  });
});
