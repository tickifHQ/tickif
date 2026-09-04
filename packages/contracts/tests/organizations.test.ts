import { describe, expect, it } from 'vitest';
import {
  activeContextSchema,
  organizationMemberRoleSchema,
  organizationBranchesResponseSchema,
  organizationRetentionResponseSchema,
  permanentlyEraseOrganizationSchema,
  placeOrganizationRetentionHoldSchema,
  requestOrganizationDeletionSchema,
  organizationWorkspaceResponseSchema,
  removeOrganizationBranchSchema,
} from '../src/organizations.js';

describe('organization contracts', () => {
  it('requires a branch reassignment target', () => {
    expect(removeOrganizationBranchSchema.parse({ targetBranchId: 'branch-2' })).toEqual({
      targetBranchId: 'branch-2',
    });
    expect(removeOrganizationBranchSchema.safeParse({}).success).toBe(false);
  });

  it('supports personal, branch, and organization roll-up contexts', () => {
    expect(activeContextSchema.parse({ kind: 'personal' })).toEqual({ kind: 'personal' });
    expect(
      activeContextSchema.parse({
        kind: 'organization',
        organizationId: 'org-1',
        teamId: 'team-1',
      }),
    ).toEqual({ kind: 'organization', organizationId: 'org-1', teamId: 'team-1' });
    expect(
      activeContextSchema.parse({
        kind: 'organization',
        organizationId: 'org-1',
        teamId: null,
      }),
    ).toEqual({ kind: 'organization', organizationId: 'org-1', teamId: null });
    expect(
      activeContextSchema.safeParse({ kind: 'organization', organizationId: 'org-1' }).success,
    ).toBe(false);
  });

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
        planTier: 'corporate',
        subscriptionState: 'active',
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

  it('accepts an empty member image from Better Auth branch data', () => {
    const result = organizationBranchesResponseSchema.safeParse({
      activeTeamId: 'team-1',
      branchUsage: 1,
      branchLimit: -1,
      branches: [
        {
          id: 'team-1',
          name: 'Mumbai',
          profileId: '11111111-1111-4111-8111-111111111111',
          profileSlug: 'mumbai-studio',
          profileStatus: 'active',
          projectCount: 0,
          memberCount: 1,
          averageRating: 4.5,
          reviewCount: 8,
          footprint: [
            {
              id: '22222222-2222-4222-8222-222222222222',
              kind: 'city',
              slug: 'mumbai',
              label: 'Mumbai',
            },
          ],
          frozen: true,
          frozenAt: '2026-08-04T00:00:00.000Z',
          freezeRank: 1,
          createdAt: '2026-08-05T00:00:00.000Z',
          members: [
            {
              userId: 'user-1',
              name: 'Asha Rao',
              email: 'asha@example.com',
              image: '',
              role: 'owner',
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('requires the exact organization slug when requesting deletion', () => {
    expect(
      requestOrganizationDeletionSchema.safeParse({ confirmationSlug: 'studio-one' }).success,
    ).toBe(true);
    expect(requestOrganizationDeletionSchema.safeParse({}).success).toBe(false);
    expect(
      requestOrganizationDeletionSchema.safeParse({
        confirmationSlug: 'studio-one',
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it('requires an explicit phrase and slug for permanent erasure', () => {
    expect(
      permanentlyEraseOrganizationSchema.safeParse({
        confirmation: 'PERMANENTLY DELETE',
        confirmationSlug: 'studio-one',
      }).success,
    ).toBe(true);
    expect(
      permanentlyEraseOrganizationSchema.safeParse({
        confirmation: 'DELETE',
        confirmationSlug: 'studio-one',
      }).success,
    ).toBe(false);
  });

  it('validates bounded legal-hold reasons', () => {
    expect(
      placeOrganizationRetentionHoldSchema.safeParse({ reason: 'Regulatory request' }).success,
    ).toBe(true);
    expect(placeOrganizationRetentionHoldSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(
      placeOrganizationRetentionHoldSchema.safeParse({ reason: 'x'.repeat(501) }).success,
    ).toBe(false);
  });

  it('represents lifecycle deadlines, hold state, and optimistic revision', () => {
    const result = organizationRetentionResponseSchema.safeParse({
      retention: {
        organizationId: 'org-1',
        status: 'deletion_requested',
        requestedAt: '2026-09-03T00:00:00.000Z',
        archiveDueAt: '2026-12-02T00:00:00.000Z',
        hardDeleteDueAt: '2027-12-02T00:00:00.000Z',
        delistWindowDays: 90,
        archiveWindowDays: 365,
        archivedAt: null,
        purgeRequestedAt: null,
        purgingAt: null,
        erasedAt: null,
        holdPlacedAt: null,
        holdReason: null,
        revision: 1,
      },
    });

    expect(result.success).toBe(true);
  });
});
