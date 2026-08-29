import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/modules/orgs/repository.js', () => ({
  orgsRepository: {
    hasMembership: vi.fn(),
    findSoleOrganizationForUser: vi.fn(),
    findMembershipRole: vi.fn(),
    findWorkspaceMembership: vi.fn(),
    listMembers: vi.fn(),
    listPendingInvitations: vi.fn(),
    findOrganizationPlan: vi.fn(),
    countActiveMembers: vi.fn(),
    freezeMembersToLimit: vi.fn(),
    restoreMembersToLimit: vi.fn(),
  },
}));

const { orgsService } = await import('../../../src/modules/orgs/service.js');
const { orgsRepository } = await import('../../../src/modules/orgs/repository.js');

describe('orgsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates membership and unambiguous legacy-session lookup to the repository', async () => {
    vi.mocked(orgsRepository.hasMembership).mockResolvedValue(true);
    vi.mocked(orgsRepository.findSoleOrganizationForUser).mockResolvedValue('org-1');

    await expect(orgsService.isMember('user-1', 'org-1')).resolves.toBe(true);
    await expect(orgsService.findSoleOrganizationForUser('user-1')).resolves.toBe('org-1');
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
    vi.mocked(orgsRepository.listPendingInvitations).mockResolvedValue([
      {
        id: 'invitation-1',
        email: 'new@example.com',
        role: 'admin',
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
          createdAt: '2026-08-05T00:00:00.000Z',
          expiresAt: '2026-08-07T00:00:00.000Z',
        },
      ],
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
    expect(orgsRepository.listPendingInvitations).not.toHaveBeenCalled();
  });
});
