import { describe, expect, it } from 'vitest';
import {
  organizationMemberRoleSchema,
  organizationWorkspaceResponseSchema,
} from '../src/organizations.js';

describe('organization contracts', () => {
  it('accepts the Better Auth organization roles used by Tickif', () => {
    expect(organizationMemberRoleSchema.parse('owner')).toBe('owner');
    expect(organizationMemberRoleSchema.parse('admin')).toBe('admin');
    expect(organizationMemberRoleSchema.parse('member')).toBe('member');
    expect(organizationMemberRoleSchema.safeParse('designer').success).toBe(false);
  });

  it('validates the active organization workspace projection', () => {
    expect(
      organizationWorkspaceResponseSchema.safeParse({
        organization: {
          id: 'org-1',
          name: 'Studio One',
          slug: 'studio-one',
          logo: null,
        },
        currentUserRole: 'owner',
        canManage: true,
        rbacEnabled: true,
        seatUsage: 1,
        seatLimit: 10,
        capabilities: {
          billing: true,
          manageMembers: true,
          changeMemberRoles: true,
          transferOwnership: true,
          writeProjects: true,
          submitProjects: true,
          archiveProjects: true,
          deleteProjects: true,
          leadScope: 'full',
          analyticsScope: 'full',
          editOrganization: true,
          manageVerification: true,
        },
        members: [
          {
            id: 'member-1',
            userId: 'user-1',
            name: 'Asha Rao',
            email: 'asha@example.com',
            image: null,
            role: 'owner',
            frozen: false,
            frozenAt: null,
            freezeRank: null,
            joinedAt: '2026-08-05T00:00:00.000Z',
            isCurrentUser: true,
          },
        ],
        invitations: [
          {
            id: 'invitation-1',
            email: 'team@example.com',
            role: 'member',
            state: 'pending',
            createdAt: '2026-08-05T00:00:00.000Z',
            expiresAt: '2026-08-07T00:00:00.000Z',
          },
        ],
        ownershipTransfer: null,
      }).success,
    ).toBe(true);
  });
});
