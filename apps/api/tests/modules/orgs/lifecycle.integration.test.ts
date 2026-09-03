import { describe, expect, it, vi } from 'vitest';
import { and, db, eq, schema } from '@repo/db';
import { makeDesigner, makeOrganization, makeProject, makeTeam } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { orgsService } from '../../../src/modules/orgs/service.js';
import { activateOrganization, createRoleSession } from '../../helpers/auth.js';

async function makeMemberSession(input: {
  organizationId: string;
  phone: string;
  role: 'owner' | 'admin' | 'member';
  frozen?: boolean;
}) {
  const session = await createRoleSession(input.phone, 'designer');
  const [user] = await db
    .select({ email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, session.userId));
  const [membership] = await db
    .insert(schema.member)
    .values({
      id: `lifecycle-member-${session.userId}`,
      organizationId: input.organizationId,
      userId: session.userId,
      role: input.role,
      frozen: input.frozen ?? false,
      frozenAt: input.frozen ? new Date('2026-08-20T00:00:00.000Z') : null,
      freezeRank: input.frozen ? 1 : null,
      createdAt: new Date(),
    })
    .returning();
  await db
    .insert(schema.subscription)
    .values({ organizationId: input.organizationId, planTier: 'corporate' })
    .onConflictDoNothing();
  return {
    userId: session.userId,
    email: user!.email,
    memberId: membership!.id,
    cookie: await activateOrganization(session.cookie, input.organizationId),
  };
}

function postAuth(path: string, cookie: string, body: Record<string, unknown>) {
  return app.request(`/api/auth/organization/${path}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function postApi(path: string, cookie: string, body?: Record<string, unknown>) {
  return app.request(`/api/orgs${path}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('organization invitation lifecycle', () => {
  it('uses seven-day expiry and replaces a pending email without duplicates', async () => {
    const organization = await makeOrganization({ slug: 'replace-invitation-studio' });
    await makeTeam({ organizationId: organization.id });
    const owner = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006001',
      role: 'owner',
    });
    const before = Date.now();

    const first = await postAuth('invite-member', owner.cookie, {
      organizationId: organization.id,
      email: 'replacement@example.com',
      role: 'member',
    });
    const firstBody = (await first.json()) as { id: string; expiresAt: string };
    const second = await postAuth('invite-member', owner.cookie, {
      organizationId: organization.id,
      email: 'Replacement@example.com',
      role: 'admin',
    });
    const secondBody = (await second.json()) as { id: string };

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody.id).not.toBe(secondBody.id);
    expect(new Date(firstBody.expiresAt).getTime() - before).toBeGreaterThanOrEqual(
      7 * 24 * 60 * 60 * 1_000 - 5_000,
    );
    const invitations = await db
      .select({ id: schema.invitation.id, status: schema.invitation.status })
      .from(schema.invitation)
      .where(eq(schema.invitation.organizationId, organization.id));
    expect(invitations).toHaveLength(2);
    expect(invitations.filter(({ status }) => status === 'pending')).toEqual([
      expect.objectContaining({ id: secondBody.id }),
    ]);
    expect(invitations.filter(({ status }) => status === 'canceled')).toHaveLength(1);
  });

  it('persists declined and revoked states through Better Auth', async () => {
    const organization = await makeOrganization({ slug: 'decline-revoke-studio' });
    await makeTeam({ organizationId: organization.id });
    const owner = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006002',
      role: 'owner',
    });
    const guest = await createRoleSession('+919800006003', 'visitor');
    const [guestUser] = await db
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, guest.userId));
    const declinedInvite = await postAuth('invite-member', owner.cookie, {
      organizationId: organization.id,
      email: guestUser!.email,
      role: 'member',
    });
    const declined = (await declinedInvite.json()) as { id: string };
    const emailLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const declineResponse = await postAuth('reject-invitation', guest.cookie, {
      invitationId: declined.id,
    });
    const revokedInvite = await postAuth('invite-member', owner.cookie, {
      organizationId: organization.id,
      email: 'revoked@example.com',
      role: 'viewer',
    });
    const revoked = (await revokedInvite.json()) as { id: string };
    const revokeResponse = await postAuth('cancel-invitation', owner.cookie, {
      invitationId: revoked.id,
    });

    expect(declineResponse.status).toBe(200);
    expect(revokeResponse.status).toBe(200);
    expect(emailLog).toHaveBeenCalledWith(
      expect.stringContaining(`TO: ${owner.email} | SUBJECT: Invitation to`),
    );
    emailLog.mockRestore();
    const rows = await db
      .select({ id: schema.invitation.id, status: schema.invitation.status })
      .from(schema.invitation)
      .where(eq(schema.invitation.organizationId, organization.id));
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: declined.id, status: 'rejected' },
        { id: revoked.id, status: 'canceled' },
      ]),
    );
  });

  it('stores expired invitations through the injected-clock lifecycle sweep', async () => {
    const organization = await makeOrganization({ slug: 'invitation-expiry-studio' });
    const owner = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006004',
      role: 'owner',
    });
    const now = new Date('2026-08-27T12:00:00.000Z');
    await db.insert(schema.invitation).values({
      id: 'expired-by-sweep',
      organizationId: organization.id,
      email: 'expired-by-sweep@example.com',
      role: 'member',
      status: 'pending',
      inviterId: owner.userId,
      createdAt: new Date('2026-08-19T11:59:59.000Z'),
      expiresAt: new Date('2026-08-26T11:59:59.000Z'),
    });

    await expect(orgsService.sweepExpirations(now)).resolves.toMatchObject({ invitations: 1 });
    const [invitation] = await db
      .select({ status: schema.invitation.status })
      .from(schema.invitation)
      .where(eq(schema.invitation.id, 'expired-by-sweep'));
    expect(invitation?.status).toBe('expired');
  });
});

describe('organization leave and removal lifecycle', () => {
  it('lets a member leave immediately but prevents the sole Owner from leaving', async () => {
    const organization = await makeOrganization({ slug: 'leave-studio' });
    const owner = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006005',
      role: 'owner',
    });
    const member = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006006',
      role: 'member',
    });

    const memberLeave = await postAuth('leave', member.cookie, {
      organizationId: organization.id,
    });
    const ownerLeave = await postAuth('leave', owner.cookie, {
      organizationId: organization.id,
    });

    expect(memberLeave.status).toBe(200);
    expect(ownerLeave.status).toBe(400);
    const memberships = await db
      .select({ userId: schema.member.userId })
      .from(schema.member)
      .where(eq(schema.member.organizationId, organization.id));
    expect(memberships).toEqual([{ userId: owner.userId }]);
  });

  it('lets members leave below Corporate', async () => {
    const organization = await makeOrganization({ slug: 'hobby-leave-studio' });
    await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006007',
      role: 'owner',
    });
    const member = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006008',
      role: 'member',
    });
    await db
      .update(schema.subscription)
      .set({ planTier: 'hobby' })
      .where(eq(schema.subscription.organizationId, organization.id));

    const response = await postAuth('leave', member.cookie, {
      organizationId: organization.id,
    });

    expect(response.status).toBe(200);
    const [membership] = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(eq(schema.member.id, member.memberId));
    expect(membership).toBeUndefined();
  });

  it('lets frozen members leave without restoring their seat', async () => {
    const organization = await makeOrganization({ slug: 'frozen-leave-studio' });
    await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006020',
      role: 'owner',
    });
    const member = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006021',
      role: 'member',
      frozen: true,
    });
    await db
      .update(schema.subscription)
      .set({ planTier: 'hobby' })
      .where(eq(schema.subscription.organizationId, organization.id));

    const response = await postAuth('leave', member.cookie, {
      organizationId: organization.id,
    });

    expect(response.status).toBe(200);
    const [membership] = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(eq(schema.member.id, member.memberId));
    expect(membership).toBeUndefined();
  });

  it('removes member access without changing the user account or org-owned project', async () => {
    const designer = await makeDesigner({ displayName: 'Removal Studio' });
    const organizationId = designer.orgId;
    const owner = await makeMemberSession({
      organizationId,
      phone: '+919800006009',
      role: 'owner',
    });
    const member = await makeMemberSession({
      organizationId,
      phone: '+919800006010',
      role: 'member',
    });
    const project = await makeProject({ designerId: designer.id, status: 'published' });
    const transferCreate = await postApi('/ownership-transfers', owner.cookie, {
      targetMemberId: member.memberId,
    });
    const transfer = (await transferCreate.json()) as { id: string };

    const response = await postAuth('remove-member', owner.cookie, {
      organizationId,
      memberIdOrEmail: member.memberId,
    });

    expect(response.status).toBe(200);
    const [membership, user, persistedProject] = await Promise.all([
      db
        .select({ id: schema.member.id })
        .from(schema.member)
        .where(eq(schema.member.id, member.memberId)),
      db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, member.userId)),
      db
        .select({ id: schema.project.id, status: schema.project.status })
        .from(schema.project)
        .where(eq(schema.project.id, project.id)),
    ]);
    expect(membership).toEqual([]);
    expect(user).toEqual([{ id: member.userId }]);
    expect(persistedProject).toEqual([{ id: project.id, status: 'published' }]);
    const [audit] = await db
      .select({ actorUserId: schema.ownershipTransferAuditEvent.actorUserId })
      .from(schema.ownershipTransferAuditEvent)
      .where(
        and(
          eq(schema.ownershipTransferAuditEvent.transferId, transfer.id),
          eq(schema.ownershipTransferAuditEvent.status, 'cancelled'),
        ),
      );
    expect(audit?.actorUserId).toBe(owner.userId);
  });

  it('blocks a frozen Owner from changing roles through Better Auth', async () => {
    const organization = await makeOrganization({ slug: 'frozen-owner-role-studio' });
    const owner = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006027',
      role: 'owner',
      frozen: true,
    });
    const member = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006028',
      role: 'member',
    });

    const response = await postAuth('update-member-role', owner.cookie, {
      organizationId: organization.id,
      memberId: member.memberId,
      role: 'admin',
    });

    expect(response.status).toBe(403);
    const [unchanged] = await db
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(eq(schema.member.id, member.memberId));
    expect(unchanged?.role).toBe('member');
  });
});

describe('organization ownership transfer lifecycle', () => {
  it('expires a stale pending transfer atomically before creating its replacement', async () => {
    const organization = await makeOrganization({ slug: 'expired-transfer-replacement-studio' });
    const owner = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006029',
      role: 'owner',
    });
    const target = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006030',
      role: 'member',
    });
    const firstCreatedAt = new Date('2026-08-01T00:00:00.000Z');
    const first = await orgsService.createOwnershipTransfer({
      userId: owner.userId,
      organizationId: organization.id,
      targetMemberId: target.memberId,
      now: firstCreatedAt,
    });

    const replacement = await orgsService.createOwnershipTransfer({
      userId: owner.userId,
      organizationId: organization.id,
      targetMemberId: target.memberId,
      now: new Date(first.expiresAt),
    });

    expect(replacement.status).toBe('pending');
    const [expired] = await db
      .select({ status: schema.ownershipTransferRequest.status })
      .from(schema.ownershipTransferRequest)
      .where(eq(schema.ownershipTransferRequest.id, first.id));
    const [audit] = await db
      .select({ actorUserId: schema.ownershipTransferAuditEvent.actorUserId })
      .from(schema.ownershipTransferAuditEvent)
      .where(
        and(
          eq(schema.ownershipTransferAuditEvent.transferId, first.id),
          eq(schema.ownershipTransferAuditEvent.status, 'expired'),
        ),
      );
    expect(expired?.status).toBe('expired');
    expect(audit?.actorUserId).toBe(owner.userId);
  });

  it('supports target decline, initiator cancel, and injected-clock expiry', async () => {
    const organization = await makeOrganization({ slug: 'resolved-transfer-studio' });
    const owner = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006020',
      role: 'owner',
    });
    const target = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006021',
      role: 'member',
    });

    const declinedCreate = await postApi('/ownership-transfers', owner.cookie, {
      targetMemberId: target.memberId,
    });
    const declinedRequest = (await declinedCreate.json()) as { id: string };
    const declined = await postApi(
      `/ownership-transfers/${declinedRequest.id}/decline`,
      target.cookie,
    );

    const cancelledCreate = await postApi('/ownership-transfers', owner.cookie, {
      targetMemberId: target.memberId,
    });
    const cancelledRequest = (await cancelledCreate.json()) as { id: string };
    const cancelled = await postApi(
      `/ownership-transfers/${cancelledRequest.id}/cancel`,
      owner.cookie,
    );

    const clock = new Date('2026-08-27T12:00:00.000Z');
    const expiring = await orgsService.createOwnershipTransfer({
      userId: owner.userId,
      organizationId: organization.id,
      targetMemberId: target.memberId,
      now: clock,
    });
    await orgsService.sweepExpirations(new Date('2026-09-04T12:00:00.000Z'));

    expect(declined.status).toBe(200);
    await expect(declined.json()).resolves.toMatchObject({ status: 'declined' });
    expect(cancelled.status).toBe(200);
    await expect(cancelled.json()).resolves.toMatchObject({ status: 'cancelled' });
    const [expired] = await db
      .select({ status: schema.ownershipTransferRequest.status })
      .from(schema.ownershipTransferRequest)
      .where(eq(schema.ownershipTransferRequest.id, expiring.id));
    expect(expired?.status).toBe('expired');
  });

  it('requires target acceptance, swaps roles atomically, and lets the previous Owner leave', async () => {
    const organization = await makeOrganization({ slug: 'accepted-transfer-studio' });
    const owner = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006011',
      role: 'owner',
    });
    const target = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006012',
      role: 'admin',
    });
    const emailLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const create = await postApi('/ownership-transfers', owner.cookie, {
      targetMemberId: target.memberId,
    });
    const request = (await create.json()) as { id: string; status: string };
    const beforeAccept = await db
      .select({ userId: schema.member.userId, role: schema.member.role })
      .from(schema.member)
      .where(eq(schema.member.organizationId, organization.id));
    const accept = await postApi(`/ownership-transfers/${request.id}/accept`, target.cookie);

    expect(create.status).toBe(201);
    expect(request.status).toBe('pending');
    expect(beforeAccept).toEqual(
      expect.arrayContaining([
        { userId: owner.userId, role: 'owner' },
        { userId: target.userId, role: 'admin' },
      ]),
    );
    expect(accept.status).toBe(200);
    expect(emailLog).toHaveBeenCalledWith(
      expect.stringContaining(`TO: ${target.email} | SUBJECT: Tickif ownership transfer request`),
    );
    expect(emailLog).toHaveBeenCalledWith(
      expect.stringContaining(`TO: ${owner.email} | SUBJECT: Tickif ownership transfer completed`),
    );
    expect(emailLog).toHaveBeenCalledWith(
      expect.stringContaining(`TO: ${target.email} | SUBJECT: You are now`),
    );
    emailLog.mockRestore();
    const roles = await db
      .select({ userId: schema.member.userId, role: schema.member.role })
      .from(schema.member)
      .where(eq(schema.member.organizationId, organization.id));
    expect(roles.filter(({ role }) => role === 'owner')).toEqual([
      { userId: target.userId, role: 'owner' },
    ]);
    expect(roles).toContainEqual({ userId: owner.userId, role: 'admin' });

    const previousOwnerLeave = await postAuth('leave', owner.cookie, {
      organizationId: organization.id,
    });
    expect(previousOwnerLeave.status).toBe(200);
  });

  it('allows only one pending request and one successful concurrent acceptance', async () => {
    const organization = await makeOrganization({ slug: 'concurrent-transfer-studio' });
    const owner = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006013',
      role: 'owner',
    });
    const firstTarget = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006014',
      role: 'admin',
    });
    const secondTarget = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006015',
      role: 'member',
    });

    const creates = await Promise.all([
      postApi('/ownership-transfers', owner.cookie, { targetMemberId: firstTarget.memberId }),
      postApi('/ownership-transfers', owner.cookie, { targetMemberId: secondTarget.memberId }),
    ]);
    expect(creates.map(({ status }) => status).sort()).toEqual([201, 409]);
    const successfulCreate = creates.find(({ status }) => status === 201)!;
    const request = (await successfulCreate.json()) as { id: string; target: { userId: string } };
    const target = request.target.userId === firstTarget.userId ? firstTarget : secondTarget;

    const accepts = await Promise.all([
      postApi(`/ownership-transfers/${request.id}/accept`, target.cookie),
      postApi(`/ownership-transfers/${request.id}/accept`, target.cookie),
    ]);
    expect(accepts.map(({ status }) => status).sort()).toEqual([200, 409]);
    const owners = await db
      .select({ userId: schema.member.userId })
      .from(schema.member)
      .where(
        and(eq(schema.member.organizationId, organization.id), eq(schema.member.role, 'owner')),
      );
    expect(owners).toEqual([{ userId: target.userId }]);
  });

  it('cancels a pending transfer when its target leaves before acceptance', async () => {
    const organization = await makeOrganization({ slug: 'departed-transfer-target-studio' });
    const owner = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006016',
      role: 'owner',
    });
    const target = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006017',
      role: 'member',
    });
    const create = await postApi('/ownership-transfers', owner.cookie, {
      targetMemberId: target.memberId,
    });
    const request = (await create.json()) as { id: string };

    const leave = await postAuth('leave', target.cookie, { organizationId: organization.id });
    const accept = await postApi(`/ownership-transfers/${request.id}/accept`, target.cookie);

    expect(leave.status).toBe(200);
    expect(accept.status).toBe(409);
    const [transfer] = await db
      .select({ status: schema.ownershipTransferRequest.status })
      .from(schema.ownershipTransferRequest)
      .where(eq(schema.ownershipTransferRequest.id, request.id));
    const owners = await db
      .select({ userId: schema.member.userId })
      .from(schema.member)
      .where(
        and(eq(schema.member.organizationId, organization.id), eq(schema.member.role, 'owner')),
      );
    expect(transfer?.status).toBe('cancelled');
    expect(owners).toEqual([{ userId: owner.userId }]);
  });

  it('cancels a stale request when ownership changes and allows a replacement', async () => {
    const organization = await makeOrganization({ slug: 'changed-owner-transfer-studio' });
    const originalOwner = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006022',
      role: 'owner',
    });
    const currentOwner = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006023',
      role: 'admin',
    });
    const target = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006024',
      role: 'member',
    });
    const create = await postApi('/ownership-transfers', originalOwner.cookie, {
      targetMemberId: target.memberId,
    });
    const request = (await create.json()) as { id: string };
    await db.transaction(async (tx) => {
      await tx
        .update(schema.member)
        .set({ role: 'admin' })
        .where(eq(schema.member.id, originalOwner.memberId));
      await tx
        .update(schema.member)
        .set({ role: 'owner' })
        .where(eq(schema.member.id, currentOwner.memberId));
    });

    const staleAccept = await postApi(`/ownership-transfers/${request.id}/accept`, target.cookie);
    const replacement = await postApi('/ownership-transfers', currentOwner.cookie, {
      targetMemberId: target.memberId,
    });

    expect(staleAccept.status).toBe(409);
    expect(replacement.status).toBe(201);
    const [staleRequest] = await db
      .select({ status: schema.ownershipTransferRequest.status })
      .from(schema.ownershipTransferRequest)
      .where(eq(schema.ownershipTransferRequest.id, request.id));
    expect(staleRequest?.status).toBe('cancelled');
  });

  it('preserves resolved transfer history when a participant deletes their account', async () => {
    const organization = await makeOrganization({ slug: 'deleted-transfer-user-studio' });
    const owner = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006025',
      role: 'owner',
    });
    const target = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006026',
      role: 'admin',
    });
    const create = await postApi('/ownership-transfers', owner.cookie, {
      targetMemberId: target.memberId,
    });
    const request = (await create.json()) as { id: string };
    const decline = await postApi(`/ownership-transfers/${request.id}/decline`, target.cookie);
    expect(decline.status).toBe(200);

    await db.delete(schema.user).where(eq(schema.user.id, target.userId));

    const [persisted] = await db
      .select({ targetUserId: schema.ownershipTransferRequest.targetUserId })
      .from(schema.ownershipTransferRequest)
      .where(eq(schema.ownershipTransferRequest.id, request.id));
    expect(persisted).toEqual({ targetUserId: null });
  });

  it('returns a tier error for ownership transfer below Corporate', async () => {
    const organization = await makeOrganization({ slug: 'hobby-transfer-studio' });
    const owner = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006018',
      role: 'owner',
    });
    const target = await makeMemberSession({
      organizationId: organization.id,
      phone: '+919800006019',
      role: 'admin',
    });
    await db
      .update(schema.subscription)
      .set({ planTier: 'hobby' })
      .where(eq(schema.subscription.organizationId, organization.id));

    const response = await postApi('/ownership-transfers', owner.cookie, {
      targetMemberId: target.memberId,
    });

    expect(response.status).toBe(402);
  });
});
