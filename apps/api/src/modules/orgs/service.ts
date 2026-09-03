import {
  ORGANIZATION_MEMBER_ROLE,
  ORGANIZATION_ACCESS_SCOPE,
  ORGANIZATION_CAPABILITY,
  ORGANIZATION_INVITATION_STATE,
  rbacEnabled,
  branchLimit,
  seatLimit,
  organizationMemberRoleSchema,
  type OrganizationMemberRole,
  type OrganizationCapability,
  type OrganizationCapabilities,
  type OrganizationWorkspaceResponse,
  type OrganizationBranchesResponse,
  type OrganizationInvitationState,
  type OwnershipTransferResponse,
  type ActiveContext,
  type SetActiveContext,
} from '@repo/contracts';
import { organizationCapabilitiesForRole } from '@repo/auth';
import { escapeHtml, sendEmail } from '@repo/auth/email';
import { config } from '@repo/config';
import { AppError } from '../../lib/errors.js';
import {
  orgsRepository,
  OWNERSHIP_TRANSFER_RESULT,
  type OwnershipTransferRecord,
  type DbTransaction,
} from './repository.js';

const WRITE_ROLES = new Set<OrganizationMemberRole>([
  ORGANIZATION_MEMBER_ROLE.OWNER,
  ORGANIZATION_MEMBER_ROLE.ADMIN,
]);

function hasWriteRole(role: string | null, frozen = false): boolean {
  if (!role || frozen) return false;
  const parsed = organizationMemberRoleSchema.safeParse(role);
  return parsed.success && WRITE_ROLES.has(parsed.data);
}

function normalizeRole(role: string | null): OrganizationMemberRole {
  const parsed = organizationMemberRoleSchema.safeParse(role);
  return parsed.success ? parsed.data : ORGANIZATION_MEMBER_ROLE.MEMBER;
}

function invitationState(status: string): OrganizationInvitationState {
  switch (status) {
    case 'pending':
      return ORGANIZATION_INVITATION_STATE.PENDING;
    case 'accepted':
      return ORGANIZATION_INVITATION_STATE.ACTIVE;
    case 'rejected':
      return ORGANIZATION_INVITATION_STATE.DECLINED;
    case 'expired':
      return ORGANIZATION_INVITATION_STATE.EXPIRED;
    default:
      return ORGANIZATION_INVITATION_STATE.REVOKED;
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; constraint?: unknown; cause?: unknown };
  if (candidate.code === '23505' && candidate.constraint === constraint) return true;
  return isUniqueViolation(candidate.cause, constraint);
}

async function sendOwnershipEmailBestEffort(
  message: Parameters<typeof sendEmail>[0],
): Promise<void> {
  try {
    await sendEmail(message);
  } catch {
    console.error('[organizations] Ownership transfer email delivery failed');
  }
}

async function transferResponse(
  request: OwnershipTransferRecord,
): Promise<OwnershipTransferResponse | null> {
  if (!request.initiatorUserId || !request.targetUserId) return null;
  const [initiator, target] = await Promise.all([
    orgsRepository.findUser(request.initiatorUserId),
    orgsRepository.findMemberById(request.organizationId, request.targetMemberId),
  ]);
  if (!initiator || !target || target.userId !== request.targetUserId) return null;
  return {
    id: request.id,
    organizationId: request.organizationId,
    status: request.status,
    initiator: {
      userId: initiator.id,
      name: initiator.name,
      email: initiator.email,
    },
    target: {
      memberId: target.id,
      userId: target.userId,
      name: target.name,
      email: target.email,
      role: normalizeRole(target.role),
    },
    expiresAt: request.expiresAt.toISOString(),
    createdAt: request.createdAt.toISOString(),
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
  };
}

async function requireCorporateOrganization(organizationId: string): Promise<void> {
  const plan = await orgsRepository.findOrganizationPlan(organizationId);
  if (!rbacEnabled(plan.tier, plan.state)) {
    throw new AppError(
      'ORGANIZATION_RBAC_REQUIRES_CORPORATE',
      'Upgrade to Corporate to manage organization membership',
      402,
    );
  }
}

const roleOrder: Record<OrganizationMemberRole, number> = {
  [ORGANIZATION_MEMBER_ROLE.OWNER]: 0,
  [ORGANIZATION_MEMBER_ROLE.ADMIN]: 1,
  [ORGANIZATION_MEMBER_ROLE.BILLING_ADMIN]: 2,
  [ORGANIZATION_MEMBER_ROLE.MEMBER]: 3,
  [ORGANIZATION_MEMBER_ROLE.VIEWER]: 4,
};

function allowsCapability(
  capabilities: OrganizationCapabilities,
  capability: OrganizationCapability,
): boolean {
  switch (capability) {
    case ORGANIZATION_CAPABILITY.BILLING:
      return capabilities.billing;
    case ORGANIZATION_CAPABILITY.MANAGE_MEMBERS:
      return capabilities.manageMembers;
    case ORGANIZATION_CAPABILITY.CHANGE_MEMBER_ROLES:
      return capabilities.changeMemberRoles;
    case ORGANIZATION_CAPABILITY.TRANSFER_OWNERSHIP:
      return capabilities.transferOwnership;
    case ORGANIZATION_CAPABILITY.WRITE_PROJECTS:
      return capabilities.writeProjects;
    case ORGANIZATION_CAPABILITY.SUBMIT_PROJECTS:
      return capabilities.submitProjects;
    case ORGANIZATION_CAPABILITY.ARCHIVE_PROJECTS:
      return capabilities.archiveProjects;
    case ORGANIZATION_CAPABILITY.DELETE_PROJECTS:
      return capabilities.deleteProjects;
    case ORGANIZATION_CAPABILITY.READ_LEADS:
      return capabilities.leadScope !== ORGANIZATION_ACCESS_SCOPE.NONE;
    case ORGANIZATION_CAPABILITY.READ_ANALYTICS:
      return capabilities.analyticsScope !== ORGANIZATION_ACCESS_SCOPE.NONE;
    case ORGANIZATION_CAPABILITY.EDIT_ORGANIZATION:
      return capabilities.editOrganization;
    case ORGANIZATION_CAPABILITY.MANAGE_VERIFICATION:
      return capabilities.manageVerification;
  }
}

export const orgsService = {
  async resolveContextSelection(
    userId: string,
    selection: SetActiveContext,
  ): Promise<ActiveContext> {
    if (selection.kind === 'personal') return selection;
    const teamId =
      selection.teamId ??
      (await orgsRepository.findDefaultActiveTeamForUser(userId, selection.organizationId));
    if (!teamId) throw AppError.forbidden('Organization context is unavailable');
    const valid = await orgsRepository.isValidOrganizationContext(
      userId,
      selection.organizationId,
      teamId,
    );
    if (!valid) throw AppError.forbidden('Organization context is unavailable');
    return { kind: 'organization', organizationId: selection.organizationId, teamId };
  },

  async resolveSessionContext(
    userId: string,
    activeOrganizationId: string | null,
    activeTeamId: string | null,
  ): Promise<ActiveContext> {
    if (!activeOrganizationId) {
      if (activeTeamId) {
        await orgsRepository.saveContextPreference(userId, { kind: 'personal' });
      }
      return { kind: 'personal' };
    }

    const teamId =
      activeTeamId ??
      (await orgsRepository.findDefaultActiveTeamForUser(userId, activeOrganizationId));
    if (
      teamId &&
      (await orgsRepository.isValidOrganizationContext(userId, activeOrganizationId, teamId))
    ) {
      const context = {
        kind: 'organization' as const,
        organizationId: activeOrganizationId,
        teamId,
      };
      if (!activeTeamId) await orgsRepository.saveContextPreference(userId, context);
      return context;
    }

    const personal = { kind: 'personal' } as const;
    await orgsRepository.saveContextPreference(userId, personal);
    return personal;
  },

  async saveContextPreference(userId: string, context: ActiveContext): Promise<void> {
    await orgsRepository.saveContextPreference(userId, context);
  },

  /** True when the user has any membership role in the organization. */
  isMember(userId: string, organizationId: string): Promise<boolean> {
    return orgsRepository.hasMembership(userId, organizationId);
  },

  findDefaultActiveTeamForUser(userId: string, organizationId: string): Promise<string | null> {
    return orgsRepository.findDefaultActiveTeamForUser(userId, organizationId);
  },

  /** True for active Better Auth owner and admin memberships. */
  async isWriter(userId: string, organizationId: string): Promise<boolean> {
    const membership = await orgsRepository.findMembershipRole(userId, organizationId);
    return hasWriteRole(membership?.role ?? null, membership?.frozen ?? false);
  },

  async getCapabilities(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationCapabilities | null> {
    const membership = await orgsRepository.findMembershipRole(userId, organizationId);
    if (!membership) return null;
    const plan = await orgsRepository.findOrganizationPlan(organizationId);
    return organizationCapabilitiesForRole(normalizeRole(membership.role), {
      rbacEnabled: rbacEnabled(plan.tier, plan.state),
      frozen: membership.frozen,
    });
  },

  async hasCapability(
    userId: string,
    organizationId: string,
    capability: OrganizationCapability,
  ): Promise<boolean> {
    const capabilities = await orgsService.getCapabilities(userId, organizationId);
    return capabilities ? allowsCapability(capabilities, capability) : false;
  },

  /**
   * Reconcile frozen seats against the current plan's seat limit: freeze
   * over-limit members, then restore any that now fit.
   *
   * When `tx` is provided (E-239 reactivation), the freeze+restore run inside the
   * caller's transaction so tier restoration and seat restoration commit
   * atomically — a successful charge can never leave paid-tier + frozen seats.
   * Idempotent: converges on every call, so a redelivered webhook is safe.
   */
  async reconcileMemberSeats(
    organizationId: string,
    now = new Date(),
    tx?: DbTransaction,
  ): Promise<void> {
    const plan = await orgsRepository.findOrganizationPlan(organizationId, tx);
    const activeLimit = seatLimit(plan.tier, plan.state);
    await orgsRepository.freezeMembersToLimit({ organizationId, activeLimit, now, tx });
    await orgsRepository.restoreMembersToLimit({ organizationId, activeLimit, tx });
  },

  async reconcileBranches(organizationId: string, now = new Date()): Promise<void> {
    const plan = await orgsRepository.findOrganizationPlan(organizationId);
    const activeLimit = branchLimit(plan.tier, plan.state);
    await orgsRepository.freezeBranchesToLimit({ organizationId, activeLimit, now });
    await orgsRepository.restoreBranchesToLimit({ organizationId, activeLimit });
  },

  async listBranches(input: {
    userId: string;
    organizationId: string;
    activeTeamId: string | null;
  }): Promise<OrganizationBranchesResponse> {
    if (!(await orgsRepository.hasMembership(input.userId, input.organizationId))) {
      throw AppError.forbidden('Organization membership required');
    }
    const [branches, plan] = await Promise.all([
      orgsRepository.listActiveBranchesForUser(input.userId, input.organizationId),
      orgsRepository.findOrganizationPlan(input.organizationId),
    ]);
    const members = await orgsRepository.listBranchMembers(branches.map(({ id }) => id));
    return {
      activeTeamId: input.activeTeamId,
      branchUsage: await orgsRepository.countActiveBranches(input.organizationId),
      branchLimit: branchLimit(plan.tier, plan.state),
      branches: branches.map((branch) => ({
        ...branch,
        createdAt: branch.createdAt.toISOString(),
        members: members
          .filter((member) => member.teamId === branch.id)
          .map((member) => ({
            userId: member.userId,
            name: member.name,
            email: member.email,
            image: member.image,
            role: normalizeRole(member.role),
          })),
      })),
    };
  },

  async getCurrentWorkspace(input: {
    userId: string;
    activeOrgId: string | null;
  }): Promise<OrganizationWorkspaceResponse> {
    if (!input.activeOrgId) {
      throw AppError.unprocessable('Select an active organization');
    }

    const membership = await orgsRepository.findWorkspaceMembership(
      input.userId,
      input.activeOrgId,
    );
    if (!membership) {
      throw AppError.forbidden('You are not a member of the active organization');
    }
    if (membership.frozen) {
      throw AppError.forbidden('Organization membership is inactive');
    }

    const currentUserRole = normalizeRole(membership.role);
    const plan = await orgsRepository.findOrganizationPlan(input.activeOrgId);
    const organizationRbacEnabled = rbacEnabled(plan.tier, plan.state);
    const capabilities = organizationCapabilitiesForRole(currentUserRole, {
      rbacEnabled: organizationRbacEnabled,
      frozen: false,
    });
    const canManage = capabilities.manageMembers;
    const [memberRecords, invitationRecords, seatUsage, pendingTransfer] = await Promise.all([
      orgsRepository.listMembers(input.activeOrgId),
      canManage ? orgsRepository.listInvitations(input.activeOrgId) : Promise.resolve([]),
      orgsRepository.countActiveMembers(input.activeOrgId),
      orgsRepository.findPendingOwnershipTransfer(input.activeOrgId),
    ]);
    const visibleTransfer =
      pendingTransfer &&
      (pendingTransfer.initiatorUserId === input.userId ||
        pendingTransfer.targetUserId === input.userId)
        ? await transferResponse(pendingTransfer)
        : null;

    const members = memberRecords
      .map((member) => ({
        id: member.id,
        userId: member.userId,
        name: member.name,
        email: member.email,
        image: member.image,
        role: normalizeRole(member.role),
        frozen: member.frozen,
        frozenAt: member.frozenAt?.toISOString() ?? null,
        freezeRank: member.freezeRank,
        joinedAt: member.createdAt.toISOString(),
        isCurrentUser: member.userId === input.userId,
      }))
      .sort(
        (left, right) =>
          roleOrder[left.role] - roleOrder[right.role] || left.name.localeCompare(right.name),
      );

    return {
      organization: membership.organization,
      currentUserRole,
      canManage,
      rbacEnabled: organizationRbacEnabled,
      subscriptionState: plan.state,
      seatUsage,
      seatLimit: seatLimit(plan.tier, plan.state),
      capabilities,
      members,
      invitations: invitationRecords.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: normalizeRole(invitation.role),
        state: invitationState(invitation.status),
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString(),
      })),
      ownershipTransfer: visibleTransfer,
    };
  },

  async createOwnershipTransfer(input: {
    userId: string;
    organizationId: string;
    targetMemberId: string;
    now?: Date;
  }): Promise<OwnershipTransferResponse> {
    await requireCorporateOrganization(input.organizationId);
    if (
      !(await orgsService.hasCapability(
        input.userId,
        input.organizationId,
        ORGANIZATION_CAPABILITY.TRANSFER_OWNERSHIP,
      ))
    ) {
      throw AppError.forbidden('Only the active organization Owner can transfer ownership');
    }
    const target = await orgsRepository.findMemberById(input.organizationId, input.targetMemberId);
    if (
      !target ||
      target.frozen ||
      (target.role !== ORGANIZATION_MEMBER_ROLE.ADMIN &&
        target.role !== ORGANIZATION_MEMBER_ROLE.MEMBER)
    ) {
      throw AppError.unprocessable(
        'Ownership can only be transferred to an active Admin or Member',
      );
    }
    if (target.userId === input.userId) {
      throw AppError.unprocessable('Choose another organization member');
    }

    const now = input.now ?? new Date();
    let request: OwnershipTransferRecord;
    try {
      request = await orgsRepository.createOwnershipTransfer({
        organizationId: input.organizationId,
        initiatorUserId: input.userId,
        targetUserId: target.userId,
        targetMemberId: target.id,
        expiresAt: new Date(now.getTime() + config.OWNERSHIP_TRANSFER_EXPIRY_SECONDS * 1_000),
        now,
      });
    } catch (error) {
      if (isUniqueViolation(error, 'ownership_transfer_pending_organization_uniq')) {
        throw AppError.conflict('An ownership transfer is already pending');
      }
      throw error;
    }
    const response = await transferResponse(request);
    if (!response) throw AppError.conflict('Ownership transfer target changed');
    const transferUrl = new URL('/designer/terms-roles', config.PUBLIC_WEB_URL).toString();
    await sendOwnershipEmailBestEffort({
      to: target.email,
      subject: 'Tickif ownership transfer request',
      idempotencyKey: `ownership-transfer-requested-${request.id}`,
      html: `<p>You have been nominated as Owner of your Tickif organization.</p><p><a href="${transferUrl}">Review transfer</a></p>`,
    });
    return response;
  },

  async resolveOwnershipTransfer(input: {
    id: string;
    userId: string;
    action: 'accept' | 'decline' | 'cancel';
    now?: Date;
  }): Promise<OwnershipTransferResponse> {
    const existing = await orgsRepository.findOwnershipTransfer(input.id);
    if (!existing) throw AppError.notFound('Ownership transfer not found');
    await requireCorporateOrganization(existing.organizationId);
    const result = await orgsRepository.resolveOwnershipTransfer({
      id: input.id,
      actorUserId: input.userId,
      action: input.action,
      now: input.now ?? new Date(),
    });
    if (result === OWNERSHIP_TRANSFER_RESULT.NOT_FOUND) {
      throw AppError.notFound('Ownership transfer not found');
    }
    if (result === OWNERSHIP_TRANSFER_RESULT.FORBIDDEN) throw AppError.forbidden();
    if (result === OWNERSHIP_TRANSFER_RESULT.NOT_PENDING) {
      throw AppError.conflict('Ownership transfer is no longer pending');
    }
    if (result === OWNERSHIP_TRANSFER_RESULT.OWNER_STATE_CHANGED) {
      throw AppError.conflict('Organization ownership changed');
    }
    if (result === OWNERSHIP_TRANSFER_RESULT.INVALID_TARGET) {
      throw AppError.conflict('Transfer target is no longer an eligible member');
    }
    if (result === OWNERSHIP_TRANSFER_RESULT.EXPIRED) {
      throw AppError.conflict('Ownership transfer expired');
    }

    const response = await transferResponse(result);
    if (!response) throw AppError.conflict('Ownership transfer membership changed');
    if (input.action === 'accept' && result.initiatorUserId && result.targetUserId) {
      const [previousOwner, newOwner] = await Promise.all([
        orgsRepository.findUser(result.initiatorUserId),
        orgsRepository.findUser(result.targetUserId),
      ]);
      if (previousOwner && newOwner) {
        await Promise.all([
          sendOwnershipEmailBestEffort({
            to: previousOwner.email,
            subject: 'Tickif ownership transfer completed',
            idempotencyKey: `ownership-transfer-completed-initiator-${result.id}`,
            html: `<p>${escapeHtml(newOwner.name)} is now the organization Owner. Your role is now Admin.</p>`,
          }),
          sendOwnershipEmailBestEffort({
            to: newOwner.email,
            subject: 'You are now the Tickif organization Owner',
            idempotencyKey: `ownership-transfer-completed-target-${result.id}`,
            html: '<p>The ownership transfer is complete.</p>',
          }),
        ]);
      }
    }
    return response;
  },

  async sweepExpirations(now: Date): Promise<{ invitations: number; transfers: number }> {
    const [invitations, transfers] = await Promise.all([
      orgsRepository.expireInvitations(now),
      orgsRepository.expireOwnershipTransfers(now),
    ]);
    return { invitations: invitations.length, transfers: transfers.length };
  },
};
