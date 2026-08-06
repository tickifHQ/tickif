import { describe, expect, it } from 'vitest';
import { testClient } from 'hono/testing';
import type { OrganizationWorkspaceResponse } from '@repo/contracts';
import { and, db, eq, schema } from '@repo/db';
import { makeOrganization, makeUser } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { activateOrganization, createRoleSession } from '../../helpers/auth.js';

const client = testClient(app);

async function makeOrganizationSession(input: {
  phone: string;
  organizationId: string;
  role: 'owner' | 'admin' | 'member';
}) {
  const { cookie, userId } = await createRoleSession(input.phone, 'designer');
  await db.insert(schema.member).values({
    id: `member-${userId}`,
    organizationId: input.organizationId,
    userId,
    role: input.role,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
  });
  return {
    userId,
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

  it('returns active organization members and pending invitations to an owner', async () => {
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
        status: 'pending',
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
      expect.objectContaining({ id: 'invitation-pending', email: 'new@example.com' }),
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

  it('rejects a session whose active organization was forged to another studio', async () => {
    const ownOrganization = await makeOrganization({ slug: 'own-studio' });
    const victimOrganization = await makeOrganization({ slug: 'victim-studio' });
    const attacker = await makeOrganizationSession({
      phone: '+919800004003',
      organizationId: ownOrganization.id,
      role: 'owner',
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
      .select({ activeOrganizationId: schema.session.activeOrganizationId })
      .from(schema.session)
      .where(eq(schema.session.userId, guest.userId));

    expect(acceptedUser).toEqual({ role: 'designer', status: 'active' });
    expect(membership?.role).toBe('member');
    expect(guestSession?.activeOrganizationId).toBe(organization.id);
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
});
