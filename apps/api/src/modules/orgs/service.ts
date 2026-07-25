import { orgsRepository } from './repository.js';

const WRITE_ROLES = new Set(['owner', 'admin']);

function hasWriteRole(role: string | null): boolean {
  if (!role) return false;
  return role.split(',').some((candidate) => WRITE_ROLES.has(candidate.trim()));
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

  /** True for Better Auth owner/admin roles, including comma-joined multi-role values. */
  async isWriter(userId: string, organizationId: string): Promise<boolean> {
    return hasWriteRole(await orgsRepository.findMembershipRole(userId, organizationId));
  },
};
