import { describe, expect, it } from 'vitest';
import { testClient } from 'hono/testing';
import type { OrganizationWorkspaceResponse } from '@repo/contracts';
import type { OrganizationMemberRole } from '@repo/contracts';
import { and, db, eq, schema } from '@repo/db';
import { makeOrganization, makeProject, makeUser } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import {
  activateOrganization,
  createRoleSession,
  mergeResponseCookies,
} from '../../helpers/auth.js';

const client = testClient(app);

async function makeOrganizationSession(input: {
  phone: string;
  organizationId: string;
  role: OrganizationMemberRole;
}) {
  const { cookie, userId } = await createRoleSession(input.phone, 'designer');
  await db.insert(schema.member).values({
    id: `member-${userId}`,
    organizationId: input.organizationId,
    userId,
    role: input.role,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
  });
  await db
    .insert(schema.subscription)
    .values({ organizationId: input.organizationId, planTier: 'corporate' })
    .onConflictDoNothing();
  const [existingTeam] = await db
    .select({ id: schema.team.id })
    .from(schema.team)
    .where(eq(schema.team.organizationId, input.organizationId))
    .limit(1);
  const teamId = existingTeam?.id ?? `default-team-${input.organizationId}`;
  if (!existingTeam) {
    await db.insert(schema.team).values({
      id: teamId,
      organizationId: input.organizationId,
      name: 'Default Branch',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    await db.insert(schema.designerProfile).values({
      orgId: input.organizationId,
      teamId,
      userId,
      displayName: 'Default Branch',
      slug: `default-${input.organizationId}`,
    });
  }
  await db
    .insert(schema.teamMember)
    .values({
      id: `team-member-${teamId}-${userId}`,
      teamId,
      userId,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    })
    .onConflictDoNothing();
  return {
    userId,
    teamId,
    cookie: await activateOrganization(cookie, input.organizationId),
  };
}

function postOrganizationAction(path: string, cookie: string, body: Record<string, unknown>) {
  return app.request(`/api/auth/organization/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
    },
    body: JSON.stringify(body),
  });
}

describe('GET /api/orgs/current', () => {
  it('requires authentication', async () => {
    const response = await client.api.orgs.current.$get();

    expect(response.status).toBe(401);
  });

  it('returns active organization members and invitation lifecycle states to an owner', async () => {
    const organization = await makeOrganization({
      name: 'Studio One',
      slug: 'studio-one',
    });
    const owner = await makeOrganizationSession({
      phone: '+919800004001',
      organizationId: organization.id,
      role: 'owner',
    });
    const teammate = await makeUser({
      name: 'Rohan Shah',
      email: 'rohan@example.com',
    });
    await db.insert(schema.member).values({
      id: 'member-rohan',
      organizationId: organization.id,
      userId: teammate.id,
      role: 'admin',
      createdAt: new Date('2026-08-02T00:00:00.000Z'),
    });
    await db.insert(schema.invitation).values([
      {
        id: 'invitation-pending',
        organizationId: organization.id,
        email: 'new@example.com',
        role: 'member',
        status: 'pending',
        inviterId: owner.userId,
        createdAt: new Date('2026-08-03T00:00:00.000Z'),
        expiresAt: new Date('2099-08-05T00:00:00.000Z'),
      },
      {
        id: 'invitation-expired',
        organizationId: organization.id,
        email: 'expired@example.com',
        role: 'member',
        status: 'expired',
        inviterId: owner.userId,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        expiresAt: new Date('2026-07-02T00:00:00.000Z'),
      },
    ]);

    const response = await client.api.orgs.current.$get({}, { headers: { cookie: owner.cookie } });
    const body = (await response.json()) as OrganizationWorkspaceResponse;

    expect(response.status).toBe(200);
    expect(body.organization).toMatchObject({ name: 'Studio One', slug: 'studio-one' });
    expect(body.currentUserRole).toBe('owner');
    expect(body.canManage).toBe(true);
    expect(body.members).toHaveLength(2);
    expect(body.members[0]).toMatchObject({ userId: owner.userId, role: 'owner' });
    expect(body.invitations).toEqual([
      expect.objectContaining({
        id: 'invitation-pending',
        email: 'new@example.com',
        state: 'pending',
      }),
      expect.objectContaining({ id: 'invitation-expired', state: 'expired' }),
    ]);
  });

  it('lets a member read the roster without exposing pending invitation emails', async () => {
    const organization = await makeOrganization();
    const member = await makeOrganizationSession({
      phone: '+919800004002',
      organizationId: organization.id,
      role: 'member',
    });
    await db.insert(schema.invitation).values({
      id: 'invitation-private',
      organizationId: organization.id,
      email: 'private@example.com',
      role: 'admin',
      status: 'pending',
      inviterId: member.userId,
      expiresAt: new Date('2099-08-05T00:00:00.000Z'),
    });

    const response = await client.api.orgs.current.$get({}, { headers: { cookie: member.cookie } });
    const body = (await response.json()) as OrganizationWorkspaceResponse;

    expect(response.status).toBe(200);
    expect(body.currentUserRole).toBe('member');
    expect(body.canManage).toBe(false);
    expect(body.invitations).toEqual([]);
  });

  it.each([
    ['owner', '+919800004021'],
    ['admin', '+919800004022'],
    ['billing_admin', '+919800004023'],
    ['member', '+919800004024'],
    ['viewer', '+919800004025'],
  ] as const)('rejects a %s session forged to another studio', async (role, phone) => {
    const ownOrganization = await makeOrganization({ slug: `own-${role}-studio` });
    const victimOrganization = await makeOrganization({ slug: `victim-${role}-studio` });
    const attacker = await makeOrganizationSession({
      phone,
      organizationId: ownOrganization.id,
      role,
    });
    await db
      .update(schema.session)
      .set({ activeOrganizationId: victimOrganization.id })
      .where(eq(schema.session.userId, attacker.userId));
    const uncachedCookie = attacker.cookie
      .split('; ')
      .filter((value) => !value.startsWith('better-auth.session_data'))
      .join('; ');

    const response = await client.api.orgs.current.$get(
      {},
      { headers: { cookie: uncachedCookie } },
    );

    expect(response.status).toBe(403);
  });
});

describe('organization management', () => {
  it.each([
    ['get-full-organization', '+919800004101'],
    ['get-active-member', '+919800004102'],
    ['list-members', '+919800004103'],
    ['list-invitations', '+919800004104'],
    ['get-active-member-role', '+919800004105'],
  ] as const)('blocks frozen members from Better Auth %s reads', async (path, phone) => {
    const organization = await makeOrganization({ slug: `frozen-read-${path}` });
    const owner = await makeOrganizationSession({
      phone,
      organizationId: organization.id,
      role: 'owner',
    });
    await db
      .update(schema.member)
      .set({ frozen: true, frozenAt: new Date('2026-08-22T00:00:00.000Z'), freezeRank: 1 })
      .where(eq(schema.member.userId, owner.userId));

    const response = await app.request(
      `/api/auth/organization/${path}?organizationId=${organization.id}`,
      { headers: { cookie: owner.cookie } },
    );

    expect(response.status).toBe(403);
  });

  it('rejects mixed organization selectors before a protected Better Auth read', async () => {
    const activeOrganization = await makeOrganization({ slug: 'active-selector-studio' });
    const frozenOrganization = await makeOrganization({ slug: 'frozen-selector-studio' });
    const member = await makeOrganizationSession({
      phone: '+919800004106',
      organizationId: activeOrganization.id,
      role: 'member',
    });
    await db.insert(schema.member).values({
      id: `member-frozen-${member.userId}`,
      organizationId: frozenOrganization.id,
      userId: member.userId,
      role: 'member',
      frozen: true,
      frozenAt: new Date('2026-08-22T00:00:00.000Z'),
      freezeRank: 1,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    const response = await app.request(
      `/api/auth/organization/get-full-organization?organizationId=${activeOrganization.id}&organizationSlug=${frozenOrganization.slug}`,
      { headers: { cookie: member.cookie } },
    );

    expect(response.status).toBe(400);
  });

  it('lets an owner invite a member through Better Auth', async () => {
    const organization = await makeOrganization({ slug: 'invite-studio' });
    const owner = await makeOrganizationSession({
      phone: '+919800004004',
      organizationId: organization.id,
      role: 'owner',
    });

    const response = await postOrganizationAction('invite-member', owner.cookie, {
      email: 'invitee@example.com',
      role: 'member',
      organizationId: organization.id,
    });

    expect(response.status).toBe(200);
    const [invitation] = await db
      .select()
      .from(schema.invitation)
      .where(eq(schema.invitation.email, 'invitee@example.com'));
    expect(invitation).toMatchObject({
      organizationId: organization.id,
      role: 'member',
      status: 'pending',
      inviterId: owner.userId,
    });
  });

  it('rejects invitation creation by a regular member', async () => {
    const organization = await makeOrganization({ slug: 'member-invite-studio' });
    const member = await makeOrganizationSession({
      phone: '+919800004005',
      organizationId: organization.id,
      role: 'member',
    });

    const response = await postOrganizationAction('invite-member', member.cookie, {
      email: 'blocked@example.com',
      role: 'member',
      organizationId: organization.id,
    });

    expect(response.status).toBe(403);
  });

  it('lets an admin invite a member through Better Auth', async () => {
    const organization = await makeOrganization({ slug: 'admin-invite-studio' });
    const admin = await makeOrganizationSession({
      phone: '+919800004008',
      organizationId: organization.id,
      role: 'admin',
    });

    const response = await postOrganizationAction('invite-member', admin.cookie, {
      email: 'admin-invitee@example.com',
      role: 'member',
      organizationId: organization.id,
    });

    expect(response.status).toBe(200);
  });

  it('accepts an invitation, selects the organization, and promotes a visitor to designer', async () => {
    const organization = await makeOrganization({ slug: 'accepted-invite-studio' });
    const owner = await makeOrganizationSession({
      phone: '+919800004009',
      organizationId: organization.id,
      role: 'owner',
    });
    const [profile] = await db
      .select({ id: schema.designerProfile.id })
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.teamId, owner.teamId));
    const project = await makeProject({
      designerId: profile!.id,
      title: 'Default Branch Project',
      status: 'draft',
    });
    const guest = await createRoleSession('+919800004010', 'visitor');
    const [guestUser] = await db
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, guest.userId));

    const inviteResponse = await postOrganizationAction('invite-member', owner.cookie, {
      email: guestUser!.email,
      role: 'member',
      organizationId: organization.id,
    });
    expect(inviteResponse.status).toBe(200);
    const invitation = (await inviteResponse.json()) as { id: string };

    const acceptResponse = await postOrganizationAction('accept-invitation', guest.cookie, {
      invitationId: invitation.id,
    });

    expect(acceptResponse.status).toBe(200);
    const [acceptedUser] = await db
      .select({ role: schema.user.role, status: schema.user.status })
      .from(schema.user)
      .where(eq(schema.user.id, guest.userId));
    const [membership] = await db
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.userId, guest.userId),
          eq(schema.member.organizationId, organization.id),
        ),
      );
    const [guestSession] = await db
      .select({
        activeOrganizationId: schema.session.activeOrganizationId,
        activeTeamId: schema.session.activeTeamId,
      })
      .from(schema.session)
      .where(eq(schema.session.userId, guest.userId));
    const [teamMembership] = await db
      .select({ teamId: schema.teamMember.teamId })
      .from(schema.teamMember)
      .where(
        and(eq(schema.teamMember.userId, guest.userId), eq(schema.teamMember.teamId, owner.teamId)),
      );
    const acceptedCookie = mergeResponseCookies(guest.cookie, acceptResponse);
    const projectsResponse = await app.request(
      '/api/projects?status=all&page=1&limit=20&sort=-updatedAt',
      { headers: { cookie: acceptedCookie } },
    );
    const projects = (await projectsResponse.json()) as { items: { id: string }[] };

    expect(acceptedUser).toEqual({ role: 'designer', status: 'active' });
    expect(membership?.role).toBe('member');
    expect(teamMembership?.teamId).toBe(owner.teamId);
    expect(guestSession).toEqual({
      activeOrganizationId: organization.id,
      activeTeamId: owner.teamId,
    });
    expect(projectsResponse.status).toBe(200);
    expect(projects.items.map(({ id }) => id)).toContain(project.id);
  });

  it('lets an owner update a member role in the active organization', async () => {
    const organization = await makeOrganization({ slug: 'role-studio' });
    const owner = await makeOrganizationSession({
      phone: '+919800004006',
      organizationId: organization.id,
      role: 'owner',
    });
    const teammate = await makeUser({ email: 'role-target@example.com' });
    const [membership] = await db
      .insert(schema.member)
      .values({
        id: 'member-role-target',
        organizationId: organization.id,
        userId: teammate.id,
        role: 'member',
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
      })
      .returning();

    const response = await postOrganizationAction('update-member-role', owner.cookie, {
      memberId: membership!.id,
      role: 'admin',
      organizationId: organization.id,
    });

    expect(response.status).toBe(200);
    const [updated] = await db
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(eq(schema.member.id, membership!.id));
    expect(updated?.role).toBe('admin');
  });

  it('prevents an owner from changing a member in another organization', async () => {
    const ownerOrganization = await makeOrganization({ slug: 'owner-role-studio' });
    const otherOrganization = await makeOrganization({ slug: 'other-role-studio' });
    const owner = await makeOrganizationSession({
      phone: '+919800004007',
      organizationId: ownerOrganization.id,
      role: 'owner',
    });
    const otherUser = await makeUser({ email: 'cross-org-target@example.com' });
    const [otherMembership] = await db
      .insert(schema.member)
      .values({
        id: 'member-cross-org-target',
        organizationId: otherOrganization.id,
        userId: otherUser.id,
        role: 'member',
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
      })
      .returning();

    const response = await postOrganizationAction('update-member-role', owner.cookie, {
      memberId: otherMembership!.id,
      role: 'admin',
      organizationId: ownerOrganization.id,
    });

    expect(response.status).toBe(403);
    const [unchanged] = await db
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(eq(schema.member.id, otherMembership!.id));
    expect(unchanged?.role).toBe('member');
  });

  it('returns a tier error for invitations below Corporate', async () => {
    const organization = await makeOrganization({ slug: 'hobby-invite-studio' });
    const owner = await makeOrganizationSession({
      phone: '+919800004011',
      organizationId: organization.id,
      role: 'owner',
    });
    await db
      .update(schema.subscription)
      .set({ planTier: 'hobby' })
      .where(eq(schema.subscription.organizationId, organization.id));

    const response = await postOrganizationAction('invite-member', owner.cookie, {
      email: 'upgrade@example.com',
      role: 'member',
      organizationId: organization.id,
    });

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      code: 'ORGANIZATION_RBAC_REQUIRES_CORPORATE',
    });
  });

  it('returns the same tier error for role changes below Corporate', async () => {
    const organization = await makeOrganization({ slug: 'hobby-role-studio' });
    const owner = await makeOrganizationSession({
      phone: '+919800004012',
      organizationId: organization.id,
      role: 'owner',
    });
    const teammate = await makeUser({ email: 'hobby-role-target@example.com' });
    const [membership] = await db
      .insert(schema.member)
      .values({
        id: 'member-hobby-role-target',
        organizationId: organization.id,
        userId: teammate.id,
        role: 'member',
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
      })
      .returning();
    await db
      .update(schema.subscription)
      .set({ planTier: 'hobby' })
      .where(eq(schema.subscription.organizationId, organization.id));

    const response = await postOrganizationAction('update-member-role', owner.cookie, {
      memberId: membership!.id,
      role: 'admin',
      organizationId: organization.id,
    });

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      code: 'ORGANIZATION_RBAC_REQUIRES_CORPORATE',
    });
  });

  it('does not allow direct ownership grants or owner demotion', async () => {
    const organization = await makeOrganization({ slug: 'ownership-transfer-studio' });
    const owner = await makeOrganizationSession({
      phone: '+919800004013',
      organizationId: organization.id,
      role: 'owner',
    });
    const teammate = await makeUser({ email: 'ownership-target@example.com' });
    const [membership] = await db
      .insert(schema.member)
      .values({
        id: 'member-ownership-target',
        organizationId: organization.id,
        userId: teammate.id,
        role: 'admin',
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
      })
      .returning();

    const grantResponse = await postOrganizationAction('update-member-role', owner.cookie, {
      memberId: membership!.id,
      role: 'owner',
      organizationId: organization.id,
    });
    const [ownerMembership] = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.userId, owner.userId),
          eq(schema.member.organizationId, organization.id),
        ),
      );
    const demoteResponse = await postOrganizationAction('update-member-role', owner.cookie, {
      memberId: ownerMembership!.id,
      role: 'admin',
      organizationId: organization.id,
    });

    expect(grantResponse.status).toBe(400);
    expect(demoteResponse.status).toBe(400);
  });

  it('does not allow an admin to grant the Owner role', async () => {
    const organization = await makeOrganization({ slug: 'admin-owner-grant-studio' });
    await makeOrganizationSession({
      phone: '+919800004015',
      organizationId: organization.id,
      role: 'owner',
    });
    const admin = await makeOrganizationSession({
      phone: '+919800004016',
      organizationId: organization.id,
      role: 'admin',
    });
    const teammate = await makeUser({ email: 'admin-owner-target@example.com' });
    const [membership] = await db
      .insert(schema.member)
      .values({
        id: 'member-admin-owner-target',
        organizationId: organization.id,
        userId: teammate.id,
        role: 'member',
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
      })
      .returning();

    const response = await postOrganizationAction('update-member-role', admin.cookie, {
      memberId: membership!.id,
      role: 'owner',
      organizationId: organization.id,
    });

    expect(response.status).toBe(403);
    const [unchanged] = await db
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(eq(schema.member.id, membership!.id));
    expect(unchanged?.role).toBe('member');
  });

  it('denies frozen members without deleting their membership', async () => {
    const organization = await makeOrganization({ slug: 'frozen-member-studio' });
    const member = await makeOrganizationSession({
      phone: '+919800004014',
      organizationId: organization.id,
      role: 'admin',
    });
    await db
      .update(schema.member)
      .set({ frozen: true, frozenAt: new Date('2026-08-20T00:00:00.000Z'), freezeRank: 1 })
      .where(
        and(
          eq(schema.member.userId, member.userId),
          eq(schema.member.organizationId, organization.id),
        ),
      );

    const response = await postOrganizationAction('invite-member', member.cookie, {
      email: 'frozen-blocked@example.com',
      role: 'member',
      organizationId: organization.id,
    });
    const [persisted] = await db
      .select({ frozen: schema.member.frozen })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.userId, member.userId),
          eq(schema.member.organizationId, organization.id),
        ),
      );

    expect(response.status).toBe(403);
    expect(persisted).toEqual({ frozen: true });
  });

  it('blocks a frozen admin from every privileged Better Auth organization mutation', async () => {
    const organization = await makeOrganization({
      name: 'Frozen Admin Studio',
      slug: 'frozen-admin-mutations',
    });
    const admin = await makeOrganizationSession({
      phone: '+919800004026',
      organizationId: organization.id,
      role: 'admin',
    });
    const teammate = await makeUser({ email: 'frozen-admin-target@example.com' });
    const [targetMembership] = await db
      .insert(schema.member)
      .values({
        id: 'member-frozen-admin-target',
        organizationId: organization.id,
        userId: teammate.id,
        role: 'member',
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
      })
      .returning();
    await db.insert(schema.invitation).values({
      id: 'invitation-frozen-admin-cancel',
      organizationId: organization.id,
      email: 'frozen-admin-invite@example.com',
      role: 'member',
      status: 'pending',
      inviterId: admin.userId,
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
      expiresAt: new Date('2099-08-05T00:00:00.000Z'),
    });
    await db
      .update(schema.member)
      .set({ frozen: true, frozenAt: new Date('2026-08-20T00:00:00.000Z'), freezeRank: 1 })
      .where(
        and(
          eq(schema.member.userId, admin.userId),
          eq(schema.member.organizationId, organization.id),
        ),
      );

    const responses = await Promise.all([
      postOrganizationAction('update-member-role', admin.cookie, {
        memberId: targetMembership!.id,
        role: 'viewer',
        organizationId: organization.id,
      }),
      postOrganizationAction('remove-member', admin.cookie, {
        memberIdOrEmail: targetMembership!.id,
        organizationId: organization.id,
      }),
      postOrganizationAction('update', admin.cookie, {
        organizationId: organization.id,
        data: { name: 'Mutated Studio' },
      }),
      postOrganizationAction('cancel-invitation', admin.cookie, {
        invitationId: 'invitation-frozen-admin-cancel',
      }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([403, 403, 403, 403]);
    const [unchangedOrganization] = await db
      .select({ name: schema.organization.name })
      .from(schema.organization)
      .where(eq(schema.organization.id, organization.id));
    const [unchangedMembership] = await db
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(eq(schema.member.id, targetMembership!.id));
    const [unchangedInvitation] = await db
      .select({ status: schema.invitation.status })
      .from(schema.invitation)
      .where(eq(schema.invitation.id, 'invitation-frozen-admin-cancel'));
    expect(unchangedOrganization?.name).toBe('Frozen Admin Studio');
    expect(unchangedMembership?.role).toBe('member');
    expect(unchangedInvitation?.status).toBe('pending');
  });
});
