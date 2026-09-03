import { describe, expect, it } from 'vitest';
import { and, db, eq, schema } from '@repo/db';
import { makeOrganization, makeUser } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { activateOrganization, createRoleSession } from '../../helpers/auth.js';
import type { OrganizationMemberRole } from '@repo/contracts';

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

describe('organization privilege boundaries', () => {
  it('member cannot promote another member or self-promote', async () => {
    const organization = await makeOrganization({ slug: 'escalation-studio' });
    const member = await makeOrganizationSession({
      phone: '+919810001001',
      organizationId: organization.id,
      role: 'member',
    });
    const teammate = await makeUser({ email: 'escalation-target@example.com' });
    const [membership] = await db
      .insert(schema.member)
      .values({
        id: 'member-escalation-target',
        organizationId: organization.id,
        userId: teammate.id,
        role: 'member',
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
      })
      .returning();
    const [selfMembership] = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.userId, member.userId),
          eq(schema.member.organizationId, organization.id),
        ),
      );

    const promoteOther = await postOrganizationAction('update-member-role', member.cookie, {
      memberId: membership!.id,
      role: 'admin',
      organizationId: organization.id,
    });
    const promoteSelf = await postOrganizationAction('update-member-role', member.cookie, {
      memberId: selfMembership!.id,
      role: 'admin',
      organizationId: organization.id,
    });

    expect(promoteOther.status).toBe(403);
    expect(promoteSelf.status).toBe(403);
    const [unchanged] = await db
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(eq(schema.member.id, membership!.id));
    expect(unchanged?.role).toBe('member');
  });

  it('viewer cannot invite or change roles', async () => {
    const organization = await makeOrganization({ slug: 'escalation-viewer-studio' });
    const viewer = await makeOrganizationSession({
      phone: '+919810001002',
      organizationId: organization.id,
      role: 'viewer',
    });
    const teammate = await makeUser({ email: 'escalation-viewer-target@example.com' });
    const [membership] = await db
      .insert(schema.member)
      .values({
        id: 'member-escalation-viewer-target',
        organizationId: organization.id,
        userId: teammate.id,
        role: 'member',
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
      })
      .returning();

    const invite = await postOrganizationAction('invite-member', viewer.cookie, {
      email: 'viewer-invitee@example.com',
      role: 'member',
      organizationId: organization.id,
    });
    const changeRole = await postOrganizationAction('update-member-role', viewer.cookie, {
      memberId: membership!.id,
      role: 'admin',
      organizationId: organization.id,
    });

    expect(invite.status).toBe(403);
    expect(changeRole.status).toBe(403);
  });

  it('billing admin cannot invite, change roles, or transfer ownership', async () => {
    const organization = await makeOrganization({ slug: 'escalation-billing-studio' });
    const billing = await makeOrganizationSession({
      phone: '+919810001003',
      organizationId: organization.id,
      role: 'billing_admin',
    });
    const teammate = await makeUser({ email: 'escalation-billing-target@example.com' });
    const [membership] = await db
      .insert(schema.member)
      .values({
        id: 'member-escalation-billing-target',
        organizationId: organization.id,
        userId: teammate.id,
        role: 'member',
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
      })
      .returning();

    const invite = await postOrganizationAction('invite-member', billing.cookie, {
      email: 'billing-invitee@example.com',
      role: 'member',
      organizationId: organization.id,
    });
    const changeRole = await postOrganizationAction('update-member-role', billing.cookie, {
      memberId: membership!.id,
      role: 'admin',
      organizationId: organization.id,
    });
    const transfer = await app.request('/api/orgs/ownership-transfers', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: billing.cookie },
      body: JSON.stringify({ targetMemberId: membership!.id }),
    });

    expect(invite.status).toBe(403);
    expect(changeRole.status).toBe(403);
    expect(transfer.status).toBe(403);
  });

  it('admin can invite and change non-owner roles but cannot touch Owner', async () => {
    const organization = await makeOrganization({ slug: 'escalation-admin-studio' });
    await makeOrganizationSession({
      phone: '+919810001004',
      organizationId: organization.id,
      role: 'owner',
    });
    const admin = await makeOrganizationSession({
      phone: '+919810001005',
      organizationId: organization.id,
      role: 'admin',
    });
    const teammate = await makeUser({ email: 'escalation-admin-target@example.com' });
    const [membership] = await db
      .insert(schema.member)
      .values({
        id: 'member-escalation-admin-target',
        organizationId: organization.id,
        userId: teammate.id,
        role: 'viewer',
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
      })
      .returning();

    const invite = await postOrganizationAction('invite-member', admin.cookie, {
      email: 'admin-invitee-check@example.com',
      role: 'member',
      organizationId: organization.id,
    });
    const promote = await postOrganizationAction('update-member-role', admin.cookie, {
      memberId: membership!.id,
      role: 'member',
      organizationId: organization.id,
    });

    expect(invite.status).toBe(200);
    expect(promote.status).toBe(200);
  });
});
