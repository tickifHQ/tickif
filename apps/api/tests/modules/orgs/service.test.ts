import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock('@repo/auth/email', () => ({
  escapeHtml: (value: string) => value,
  sendEmail: mocks.sendEmail,
}));

vi.mock('../../../src/modules/orgs/repository.js', () => ({
  OWNERSHIP_TRANSFER_RESULT: {
    NOT_FOUND: 'not_found',
    NOT_PENDING: 'not_pending',
    EXPIRED: 'expired',
    FORBIDDEN: 'forbidden',
    INVALID_TARGET: 'invalid_target',
    OWNER_STATE_CHANGED: 'owner_state_changed',
  },
  orgsRepository: {
    hasMembership: vi.fn(),
    findDefaultActiveTeamForUser: vi.fn(),
    findMembershipRole: vi.fn(),
    findWorkspaceMembership: vi.fn(),
    listMembers: vi.fn(),
    listInvitations: vi.fn(),
    findOrganizationPlan: vi.fn(),
    countActiveMembers: vi.fn(),
    freezeMembersToLimit: vi.fn(),
    restoreMembersToLimit: vi.fn(),
    listActiveBranchesForUser: vi.fn(),
    listBranchMembers: vi.fn(),
    countActiveBranches: vi.fn(),
    freezeBranchesToLimit: vi.fn(),
    restoreBranchesToLimit: vi.fn(),
    findPendingOwnershipTransfer: vi.fn(),
    findMemberById: vi.fn(),
    createOwnershipTransfer: vi.fn(),
    findOwnershipTransfer: vi.fn(),
    resolveOwnershipTransfer: vi.fn(),
    findUser: vi.fn(),
  },
}));

const { orgsService } = await import('../../../src/modules/orgs/service.js');
const { orgsRepository } = await import('../../../src/modules/orgs/repository.js');

describe('orgsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(orgsRepository.findPendingOwnershipTransfer).mockResolvedValue(null);
    mocks.sendEmail.mockResolvedValue(undefined);
  });

  it('delegates membership lookup to the repository', async () => {
    vi.mocked(orgsRepository.hasMembership).mockResolvedValue(true);

    await expect(orgsService.isMember('user-1', 'org-1')).resolves.toBe(true);
  });

  it('reconciles frozen seats against the current entitlement limit', async () => {
    vi.mocked(orgsRepository.findOrganizationPlan).mockResolvedValue({
      tier: 'hobby',
      state: 'active',
    });
    vi.mocked(orgsRepository.freezeMembersToLimit).mockResolvedValue(['member-2']);
    vi.mocked(orgsRepository.restoreMembersToLimit).mockResolvedValue([]);
    const now = new Date('2026-08-29T00:00:00.000Z');

    await orgsService.reconcileMemberSeats('org-1', now);

    expect(orgsRepository.freezeMembersToLimit).toHaveBeenCalledWith({
      organizationId: 'org-1',
      activeLimit: 1,
      now,
    });
    expect(orgsRepository.restoreMembersToLimit).toHaveBeenCalledWith({
      organizationId: 'org-1',
      activeLimit: 1,
    });
  });

  it('reconciles frozen branches against the current entitlement limit', async () => {
    vi.mocked(orgsRepository.findOrganizationPlan).mockResolvedValue({
      tier: 'corporate',
      state: 'active',
    });
    vi.mocked(orgsRepository.freezeBranchesToLimit).mockResolvedValue(['team-3']);
    vi.mocked(orgsRepository.restoreBranchesToLimit).mockResolvedValue([]);
    const now = new Date('2026-09-01T00:00:00.000Z');

    await orgsService.reconcileBranches('org-1', now);

    expect(orgsRepository.freezeBranchesToLimit).toHaveBeenCalledWith({
      organizationId: 'org-1',
      activeLimit: -1,
      now,
    });
    expect(orgsRepository.restoreBranchesToLimit).toHaveBeenCalledWith({
      organizationId: 'org-1',
      activeLimit: -1,
    });
  });

  it('returns only the caller-visible active branches with branch members', async () => {
    vi.mocked(orgsRepository.hasMembership).mockResolvedValue(true);
    vi.mocked(orgsRepository.findOrganizationPlan).mockResolvedValue({
      tier: 'corporate',
      state: 'active',
    });
    vi.mocked(orgsRepository.countActiveBranches).mockResolvedValue(1);
    vi.mocked(orgsRepository.listActiveBranchesForUser).mockResolvedValue([
      {
        id: 'team-1',
        name: 'Bengaluru',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        profileId: '22222222-2222-4222-8222-222222222222',
        profileSlug: 'studio-bengaluru',
        projectCount: 3,
      },
    ]);
    vi.mocked(orgsRepository.listBranchMembers).mockResolvedValue([
      {
        teamId: 'team-1',
        userId: 'user-1',
        name: 'Aditya',
        email: 'aditya@example.com',
        image: null,
        role: 'owner',
      },
    ]);

    await expect(
      orgsService.listBranches({
        userId: 'user-1',
        organizationId: 'org-1',
        activeTeamId: 'team-1',
      }),
    ).resolves.toEqual({
      activeTeamId: 'team-1',
      branchUsage: 1,
      branchLimit: -1,
      branches: [
        {
          id: 'team-1',
          name: 'Bengaluru',
          createdAt: '2026-09-01T00:00:00.000Z',
          profileId: '22222222-2222-4222-8222-222222222222',
          profileSlug: 'studio-bengaluru',
          projectCount: 3,
          members: [
            {
              userId: 'user-1',
              name: 'Aditya',
              email: 'aditya@example.com',
              image: null,
              role: 'owner',
            },
          ],
        },
      ],
    });
  });

  it.each(['owner', 'admin'])(
    'treats %s as a write-capable Better Auth organization role',
    async (role) => {
      vi.mocked(orgsRepository.findMembershipRole).mockResolvedValue({ role, frozen: false });

      await expect(orgsService.isWriter('user-1', 'org-1')).resolves.toBe(true);
    },
  );

  it.each([null, 'member', 'viewer'])('treats %s as read-only', async (role) => {
    vi.mocked(orgsRepository.findMembershipRole).mockResolvedValue(
      role ? { role, frozen: false } : null,
    );

    await expect(orgsService.isWriter('user-1', 'org-1')).resolves.toBe(false);
  });

  it('rejects workspace reads without an active organization', async () => {
    await expect(
      orgsService.getCurrentWorkspace({ userId: 'user-1', activeOrgId: null }),
    ).rejects.toMatchObject({ code: 'validation_error', status: 422 });
  });

  it('rejects cross-organization workspace reads', async () => {
    vi.mocked(orgsRepository.findWorkspaceMembership).mockResolvedValue(null);

    await expect(
      orgsService.getCurrentWorkspace({ userId: 'user-1', activeOrgId: 'org-2' }),
    ).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  });

  it('returns members and pending invitations for an owner', async () => {
    vi.mocked(orgsRepository.findWorkspaceMembership).mockResolvedValue({
      organization: { id: 'org-1', name: 'Studio One', slug: 'studio-one', logo: null },
      role: 'owner',
      frozen: false,
    });
    vi.mocked(orgsRepository.findOrganizationPlan).mockResolvedValue({
      tier: 'corporate',
      state: 'active',
    });
    vi.mocked(orgsRepository.countActiveMembers).mockResolvedValue(2);
    vi.mocked(orgsRepository.listMembers).mockResolvedValue([
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
        createdAt: new Date('2026-08-05T00:00:00.000Z'),
      },
      {
        id: 'member-2',
        userId: 'user-2',
        name: 'Rohan Shah',
        email: 'rohan@example.com',
        image: null,
        role: 'member',
        frozen: false,
        frozenAt: null,
        freezeRank: null,
        createdAt: new Date('2026-08-04T00:00:00.000Z'),
      },
    ]);
    vi.mocked(orgsRepository.listInvitations).mockResolvedValue([
      {
        id: 'invitation-1',
        email: 'new@example.com',
        role: 'admin',
        status: 'pending',
        createdAt: new Date('2026-08-05T00:00:00.000Z'),
        expiresAt: new Date('2026-08-07T00:00:00.000Z'),
      },
    ]);

    await expect(
      orgsService.getCurrentWorkspace({ userId: 'user-1', activeOrgId: 'org-1' }),
    ).resolves.toEqual({
      organization: { id: 'org-1', name: 'Studio One', slug: 'studio-one', logo: null },
      currentUserRole: 'owner',
      canManage: true,
      rbacEnabled: true,
      seatUsage: 2,
      seatLimit: -1,
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
        {
          id: 'member-2',
          userId: 'user-2',
          name: 'Rohan Shah',
          email: 'rohan@example.com',
          image: null,
          role: 'member',
          frozen: false,
          frozenAt: null,
          freezeRank: null,
          joinedAt: '2026-08-04T00:00:00.000Z',
          isCurrentUser: false,
        },
      ],
      invitations: [
        {
          id: 'invitation-1',
          email: 'new@example.com',
          role: 'admin',
          state: 'pending',
          createdAt: '2026-08-05T00:00:00.000Z',
          expiresAt: '2026-08-07T00:00:00.000Z',
        },
      ],
      ownershipTransfer: null,
    });
  });

  it('keeps a regular member read-only and hides pending invitations', async () => {
    vi.mocked(orgsRepository.findWorkspaceMembership).mockResolvedValue({
      organization: { id: 'org-1', name: 'Studio One', slug: 'studio-one', logo: null },
      role: 'member',
      frozen: false,
    });
    vi.mocked(orgsRepository.findOrganizationPlan).mockResolvedValue({
      tier: 'corporate',
      state: 'active',
    });
    vi.mocked(orgsRepository.countActiveMembers).mockResolvedValue(1);
    vi.mocked(orgsRepository.listMembers).mockResolvedValue([]);

    await expect(
      orgsService.getCurrentWorkspace({ userId: 'user-1', activeOrgId: 'org-1' }),
    ).resolves.toMatchObject({ currentUserRole: 'member', canManage: false, invitations: [] });
    expect(orgsRepository.listInvitations).not.toHaveBeenCalled();
  });

  it('returns a created transfer when request email delivery fails', async () => {
    const request = {
      id: '00000000-0000-4000-8000-000000000001',
      organizationId: 'org-1',
      initiatorUserId: 'owner-user',
      targetUserId: 'target-user',
      targetMemberId: 'target-member',
      status: 'pending' as const,
      expiresAt: new Date('2026-08-08T00:00:00.000Z'),
      resolvedAt: null,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    };
    vi.mocked(orgsRepository.findOrganizationPlan).mockResolvedValue({
      tier: 'corporate',
      state: 'active',
    });
    vi.mocked(orgsRepository.findMembershipRole).mockResolvedValue({
      role: 'owner',
      frozen: false,
    });
    vi.mocked(orgsRepository.findMemberById).mockResolvedValue({
      id: 'target-member',
      userId: 'target-user',
      role: 'member',
      frozen: false,
      name: 'Target User',
      email: 'target@example.com',
    });
    vi.mocked(orgsRepository.createOwnershipTransfer).mockResolvedValue(request);
    vi.mocked(orgsRepository.findUser).mockResolvedValue({
      id: 'owner-user',
      name: 'Owner User',
      email: 'owner@example.com',
    });
    mocks.sendEmail.mockRejectedValue(new Error('provider unavailable'));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      orgsService.createOwnershipTransfer({
        userId: 'owner-user',
        organizationId: 'org-1',
        targetMemberId: 'target-member',
        now: new Date('2026-08-01T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ id: request.id, status: 'pending' });
    expect(errorLog).toHaveBeenCalledWith(
      '[organizations] Ownership transfer email delivery failed',
    );
    errorLog.mockRestore();
  });

  it('returns an accepted transfer when completion email delivery fails', async () => {
    const accepted = {
      id: '00000000-0000-4000-8000-000000000002',
      organizationId: 'org-1',
      initiatorUserId: 'owner-user',
      targetUserId: 'target-user',
      targetMemberId: 'target-member',
      status: 'accepted' as const,
      expiresAt: new Date('2026-08-08T00:00:00.000Z'),
      resolvedAt: new Date('2026-08-02T00:00:00.000Z'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-02T00:00:00.000Z'),
    };
    vi.mocked(orgsRepository.findOwnershipTransfer).mockResolvedValue({
      ...accepted,
      status: 'pending',
      resolvedAt: null,
    });
    vi.mocked(orgsRepository.findOrganizationPlan).mockResolvedValue({
      tier: 'corporate',
      state: 'active',
    });
    vi.mocked(orgsRepository.resolveOwnershipTransfer).mockResolvedValue(accepted);
    vi.mocked(orgsRepository.findMemberById).mockResolvedValue({
      id: 'target-member',
      userId: 'target-user',
      role: 'owner',
      frozen: false,
      name: 'Target User',
      email: 'target@example.com',
    });
    vi.mocked(orgsRepository.findUser).mockImplementation(async (userId) =>
      userId === 'owner-user'
        ? { id: userId, name: 'Owner User', email: 'owner@example.com' }
        : { id: userId, name: 'Target User', email: 'target@example.com' },
    );
    mocks.sendEmail.mockRejectedValue(new Error('provider unavailable'));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      orgsService.resolveOwnershipTransfer({
        id: accepted.id,
        userId: 'target-user',
        action: 'accept',
        now: new Date('2026-08-02T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ id: accepted.id, status: 'accepted' });
    expect(errorLog).toHaveBeenCalledTimes(2);
    errorLog.mockRestore();
  });
});
