import {
  ORGANIZATION_MEMBER_ROLE,
  ORGANIZATION_ACCESS_SCOPE,
  ORGANIZATION_CAPABILITY,
  rbacEnabled,
  seatLimit,
  organizationMemberRoleSchema,
  type OrganizationMemberRole,
  type OrganizationCapability,
  type OrganizationCapabilities,
  type OrganizationWorkspaceResponse,
} from '@repo/contracts';
import { organizationCapabilitiesForRole } from '@repo/auth';
import { AppError } from '../../lib/errors.js';
import { orgsRepository } from './repository.js';

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
  /** True when the user has any membership role in the organization. */
  isMember(userId: string, organizationId: string): Promise<boolean> {
    return orgsRepository.hasMembership(userId, organizationId);
  },

  /** Resolve a legacy session only when membership is unambiguous. */
  findSoleOrganizationForUser(userId: string): Promise<string | null> {
    return orgsRepository.findSoleOrganizationForUser(userId);
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

  async reconcileMemberSeats(organizationId: string, now = new Date()): Promise<void> {
    const plan = await orgsRepository.findOrganizationPlan(organizationId);
    const activeLimit = seatLimit(plan.tier, plan.state);
    await orgsRepository.freezeMembersToLimit({ organizationId, activeLimit, now });
    await orgsRepository.restoreMembersToLimit({ organizationId, activeLimit });
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
    const [memberRecords, invitationRecords, seatUsage] = await Promise.all([
      orgsRepository.listMembers(input.activeOrgId),
      canManage ? orgsRepository.listPendingInvitations(input.activeOrgId) : Promise.resolve([]),
      orgsRepository.countActiveMembers(input.activeOrgId),
    ]);

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
      seatUsage,
      seatLimit: seatLimit(plan.tier, plan.state),
      capabilities,
      members,
      invitations: invitationRecords.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: normalizeRole(invitation.role),
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString(),
      })),
    };
  },
};
