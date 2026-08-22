import {
  ORGANIZATION_MEMBER_ROLE,
  organizationMemberRoleSchema,
  type OrganizationMemberRole,
  type OrganizationWorkspaceResponse,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { orgsRepository } from './repository.js';

const WRITE_ROLES = new Set<OrganizationMemberRole>([
  ORGANIZATION_MEMBER_ROLE.OWNER,
  ORGANIZATION_MEMBER_ROLE.ADMIN,
]);

function hasWriteRole(role: string | null): boolean {
  if (!role) return false;
  return role.split(',').some((candidate) => {
    const parsed = organizationMemberRoleSchema.safeParse(candidate.trim());
    return parsed.success && WRITE_ROLES.has(parsed.data);
  });
}

function normalizeRole(role: string | null): OrganizationMemberRole {
  const roles = new Set((role ?? '').split(',').map((candidate) => candidate.trim()));
  if (roles.has(ORGANIZATION_MEMBER_ROLE.OWNER)) return ORGANIZATION_MEMBER_ROLE.OWNER;
  if (roles.has(ORGANIZATION_MEMBER_ROLE.ADMIN)) return ORGANIZATION_MEMBER_ROLE.ADMIN;
  return ORGANIZATION_MEMBER_ROLE.MEMBER;
}

const roleOrder: Record<OrganizationMemberRole, number> = {
  [ORGANIZATION_MEMBER_ROLE.OWNER]: 0,
  [ORGANIZATION_MEMBER_ROLE.ADMIN]: 1,
  [ORGANIZATION_MEMBER_ROLE.MEMBER]: 2,
};

export const orgsService = {
  /** True when the user has any membership role in the organization. */
  isMember(userId: string, organizationId: string): Promise<boolean> {
    return orgsRepository.hasMembership(userId, organizationId);
  },

  /** Resolve a legacy session only when membership is unambiguous. */
  findSoleOrganizationForUser(userId: string): Promise<string | null> {
    return orgsRepository.findSoleOrganizationForUser(userId);
  },

  /** True for Better Auth owner/admin roles, including comma-joined multi-role values. */
  async isWriter(userId: string, organizationId: string): Promise<boolean> {
    return hasWriteRole(await orgsRepository.findMembershipRole(userId, organizationId));
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

    const currentUserRole = normalizeRole(membership.role);
    const canManage = hasWriteRole(membership.role);
    const [memberRecords, invitationRecords] = await Promise.all([
      orgsRepository.listMembers(input.activeOrgId),
      canManage ? orgsRepository.listPendingInvitations(input.activeOrgId) : Promise.resolve([]),
    ]);

    const members = memberRecords
      .map((member) => ({
        id: member.id,
        userId: member.userId,
        name: member.name,
        email: member.email,
        image: member.image,
        role: normalizeRole(member.role),
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
