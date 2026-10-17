import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrganizationBranchesResponse, OrganizationWorkspaceResponse } from '@repo/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesignerBranches } from '../../src/components/designer-branches';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
  updateMemberRole: vi.fn(),
  removeTeamMember: vi.fn(),
  inviteMember: vi.fn(),
  addTeamMember: vi.fn(),
  contextPut: vi.fn(),
  branchDelete: vi.fn(),
  loadBranchesPage: vi.fn(),
  loadBranchMembersPage: vi.fn(),
  loadOrganizationMembersPage: vi.fn(),
}));

vi.mock('../../src/lib/organization-list-api', () => ({
  loadBranchesPage: mocks.loadBranchesPage,
  loadBranchMembersPage: mocks.loadBranchMembersPage,
  loadOrganizationMembersPage: mocks.loadOrganizationMembersPage,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));

vi.mock('../../src/lib/auth-client', () => ({
  authClient: {
    organization: {
      createTeam: mocks.createTeam,
      updateTeam: mocks.updateTeam,
      updateMemberRole: mocks.updateMemberRole,
      removeTeamMember: mocks.removeTeamMember,
      inviteMember: mocks.inviteMember,
      addTeamMember: mocks.addTeamMember,
    },
  },
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      orgs: {
        context: { $put: mocks.contextPut },
        branches: { ':branchId': { $delete: mocks.branchDelete } },
      },
    },
  },
}));

const branches: OrganizationBranchesResponse = {
  activeTeamId: 'team-1',
  branchUsage: 2,
  branchLimit: -1,
  branches: [
    {
      id: 'team-1',
      name: 'Andheri',
      profileId: '11111111-1111-4111-8111-111111111111',
      profileSlug: 'andheri-studio',
      profileStatus: 'active',
      projectCount: 4,
      memberCount: 2,
      averageRating: 4.5,
      reviewCount: 10,
      footprint: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          kind: 'city',
          slug: 'mumbai',
          label: 'Mumbai',
        },
      ],
      frozen: false,
      frozenAt: null,
      freezeRank: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      members: [
        {
          userId: 'user-owner',
          name: 'Asha Rao',
          email: 'asha@example.com',
          image: null,
          role: 'owner',
        },
        {
          userId: 'user-rohan',
          name: 'Rohan Shah',
          email: 'rohan@example.com',
          image: null,
          role: 'member',
        },
      ],
    },
    {
      id: 'team-2',
      name: 'Bandra',
      profileId: '33333333-3333-4333-8333-333333333333',
      profileSlug: 'bandra-studio',
      profileStatus: 'active',
      projectCount: 2,
      memberCount: 0,
      averageRating: 0,
      reviewCount: 0,
      footprint: [],
      frozen: false,
      frozenAt: null,
      freezeRank: null,
      createdAt: '2026-08-02T00:00:00.000Z',
      members: [],
    },
  ],
};

const workspace: OrganizationWorkspaceResponse = {
  organization: { id: 'org-1', name: 'Studio One', slug: 'studio-one', logo: null },
  currentUserRole: 'owner',
  canManage: true,
  rbacEnabled: true,
  planTier: 'corporate',
  subscriptionState: 'active',
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
      id: 'member-owner',
      userId: 'user-owner',
      name: 'Asha Rao',
      email: 'asha@example.com',
      image: null,
      role: 'owner',
      frozen: false,
      frozenAt: null,
      freezeRank: null,
      joinedAt: '2026-08-01T00:00:00.000Z',
      isCurrentUser: true,
    },
    {
      id: 'member-rohan',
      userId: 'user-rohan',
      name: 'Rohan Shah',
      email: 'rohan@example.com',
      image: null,
      role: 'member',
      frozen: false,
      frozenAt: null,
      freezeRank: null,
      joinedAt: '2026-08-02T00:00:00.000Z',
      isCurrentUser: false,
    },
  ],
  invitations: [],
  ownershipTransfer: null,
};

describe('DesignerBranches', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    for (const mutation of [
      mocks.createTeam,
      mocks.updateTeam,
      mocks.addTeamMember,
      mocks.updateMemberRole,
      mocks.removeTeamMember,
    ]) {
      mutation.mockResolvedValue({ data: {}, error: null });
    }
    mocks.contextPut.mockResolvedValue({ ok: true });
    mocks.branchDelete.mockResolvedValue({
      ok: true,
      json: async () => ({
        removedBranchId: 'team-2',
        targetBranchId: 'team-1',
        reassignedProjectCount: 2,
      }),
    });
  });

  it('shows the branch table with location, members, edit and detail links', () => {
    render(<DesignerBranches branches={branches} workspace={workspace} />);
    expect(screen.queryByText(workspace.organization.name)).not.toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Branch name',
      'Location',
      'Members',
      'Actions',
    ]);
    expect(screen.getByRole('link', { name: 'Andheri' })).toHaveAttribute(
      'href',
      '/designer/branches/team-1',
    );
    expect(screen.getByRole('cell', { name: 'Mumbai' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Not set' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '2 members' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit branch Andheri' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View branch details for Andheri' })).toHaveAttribute(
      'href',
      '/designer/branches/team-1',
    );
    expect(screen.getByRole('button', { name: 'Create new branch' })).toBeInTheDocument();
    expect(screen.queryByText('Invite into a branch')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Work email')).not.toBeInTheDocument();
  });

  it('opens the branch detail when a row is clicked', async () => {
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} />);
    await user.click(screen.getByRole('cell', { name: 'Mumbai' }));
    expect(mocks.push).toHaveBeenCalledWith('/designer/branches/team-1');
    expect(mocks.contextPut).not.toHaveBeenCalled();
  });

  it('keeps the details action available for read-only and frozen branches', () => {
    render(
      <DesignerBranches
        branches={{ ...branches, branches: [{ ...branches.branches[0]!, frozen: true }] }}
        workspace={{ ...workspace, canManage: false, currentUserRole: 'viewer' }}
      />,
    );
    expect(screen.getByRole('link', { name: 'View branch details for Andheri' })).toHaveAttribute(
      'href',
      '/designer/branches/team-1',
    );
    expect(screen.queryByRole('button', { name: 'Edit branch Andheri' })).not.toBeInTheDocument();
  });

  it('creates a branch from the top-right dialog', async () => {
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} />);
    await user.click(screen.getByRole('button', { name: 'Create new branch' }));
    await user.type(screen.getByRole('textbox', { name: 'Branch name' }), 'Juhu');
    await user.click(screen.getByRole('button', { name: 'Create branch' }));
    await waitFor(() =>
      expect(mocks.createTeam).toHaveBeenCalledWith({ name: 'Juhu', organizationId: 'org-1' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Branch Juhu created.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('edits a branch without opening the detail', async () => {
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} />);
    await user.click(screen.getByRole('button', { name: 'Edit branch Andheri' }));
    await user.clear(screen.getByRole('textbox', { name: 'Branch name' }));
    await user.type(screen.getByRole('textbox', { name: 'Branch name' }), 'Andheri West');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(mocks.updateTeam).toHaveBeenCalledWith({
        teamId: 'team-1',
        data: { name: 'Andheri West' },
      }),
    );
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Branch renamed.');
  });

  it('keeps creation failures in the dialog for retry', async () => {
    mocks.createTeam.mockResolvedValue({
      error: { code: 'ORGANIZATION_RBAC_REQUIRES_CORPORATE', message: 'Upgrade to Corporate' },
    });
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} />);
    await user.click(screen.getByRole('button', { name: 'Create new branch' }));
    await user.type(screen.getByRole('textbox', { name: 'Branch name' }), 'Juhu');
    await user.click(screen.getByRole('button', { name: 'Create branch' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Upgrade to Corporate to unlock branches.',
    );
    expect(screen.getByRole('textbox', { name: 'Branch name' })).toHaveValue('Juhu');
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('shows branch members and links to studio role management on the subpage', () => {
    render(<DesignerBranches branches={branches} workspace={workspace} branchId="team-1" />);
    expect(screen.getByRole('heading', { name: 'Andheri' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Andheri members' })).toBeInTheDocument();
    expect(screen.getByText('rohan@example.com')).toBeInTheDocument();
    expect(screen.queryByText(/^Studio One ·/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Portfolio is live' })).toHaveAttribute(
      'href',
      '/d/andheri-studio',
    );
    expect(screen.queryByRole('combobox', { name: 'Role for Rohan Shah' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Role for Asha Rao' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Change roles in team and roles' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All branches' })).toHaveAttribute(
      'href',
      '/designer/branches',
    );
    expect(mocks.inviteMember).not.toHaveBeenCalled();
  });

  it('adds an existing studio member directly to the selected branch', async () => {
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} branchId="team-2" />);
    await user.click(screen.getByRole('button', { name: 'Add members' }));
    await user.click(screen.getByRole('combobox', { name: 'Member' }));
    await user.click(screen.getByRole('option', { name: 'Rohan Shah (rohan@example.com)' }));
    await user.click(screen.getByRole('button', { name: 'Add member' }));
    await waitFor(() =>
      expect(mocks.addTeamMember).toHaveBeenCalledWith({ teamId: 'team-2', userId: 'user-rohan' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Rohan Shah added to Bandra.');
    expect(mocks.inviteMember).not.toHaveBeenCalled();
  });

  it('excludes assigned and frozen members from the add picker', async () => {
    const user = userEvent.setup();
    render(
      <DesignerBranches
        branches={{
          ...branches,
          branches: [{ ...branches.branches[0]!, members: [branches.branches[0]!.members[0]!] }],
        }}
        workspace={{
          ...workspace,
          members: [workspace.members[0]!, { ...workspace.members[1]!, frozen: true }],
        }}
        branchId="team-1"
      />,
    );
    expect(screen.getByRole('button', { name: 'Add members' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Add members' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.addTeamMember).not.toHaveBeenCalled();
  });

  it('shows role badges and directs role changes to Team & Roles', () => {
    render(<DesignerBranches branches={branches} workspace={workspace} branchId="team-1" />);
    expect(screen.queryByRole('combobox', { name: /Role for/ })).not.toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Owner' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Member' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Change roles in team and roles' })).toHaveAttribute(
      'href',
      '/designer/terms-roles',
    );
    expect(mocks.updateMemberRole).not.toHaveBeenCalled();
  });

  it('searches branch names across pages and resets pagination when the search changes', async () => {
    const user = userEvent.setup();
    const manyBranches = Array.from({ length: 25 }, (_, index) => ({
      ...branches.branches[0]!,
      id: `team-${index + 1}`,
      name: `Branch ${String(index + 1).padStart(2, '0')}`,
    }));
    render(
      <DesignerBranches
        branches={{ ...branches, branches: manyBranches, branchUsage: 25 }}
        workspace={workspace}
      />,
    );
    expect(screen.getByRole('link', { name: 'Branch 01' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Branch 13' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByRole('link', { name: 'Branch 13' })).toBeInTheDocument();
    await user.type(
      screen.getByRole('searchbox', { name: 'Search branches by name' }),
      'BRANCH 25',
    );
    expect(screen.getByRole('link', { name: 'Branch 25' })).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1 · 1 branch')).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Search branches by name' }));
    expect(screen.getByRole('link', { name: 'Branch 01' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await user.click(screen.getByRole('combobox', { name: 'Rows per page' }));
    await user.click(screen.getByRole('option', { name: '24 / page' }));
    expect(screen.getByText('Page 1 of 2 · 25 branches')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Branch 01' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Branch 24' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Branch 25' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Last page' }));
    expect(screen.getByRole('link', { name: 'Branch 25' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    await user.type(screen.getByRole('searchbox', { name: 'Search branches by name' }), 'nowhere');
    expect(screen.getByText('No branches match your search.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('requests branch pages and searches from the API instead of filtering the first server page', async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 25 }, (_, index) => ({
      ...branches.branches[0]!,
      id: `paged-${index + 1}`,
      name: `Branch ${String(index + 1).padStart(2, '0')}`,
      members: [],
    }));
    mocks.loadBranchesPage.mockImplementation(async ({ page, limit, q }) => {
      const filtered = items.filter((item) => item.name.toLowerCase().includes(q.toLowerCase()));
      return {
        items: filtered.slice((page - 1) * limit, page * limit),
        page,
        limit,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
      };
    });
    render(
      <DesignerBranches
        branches={{ ...branches, branches: items.slice(0, 12), branchUsage: 25 }}
        workspace={workspace}
        branchesPage={{ items: items.slice(0, 12), page: 1, limit: 12, total: 25, totalPages: 3 }}
        serverLists
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByRole('link', { name: 'Branch 13' })).toBeInTheDocument();
    expect(mocks.loadBranchesPage).toHaveBeenCalledWith(
      { page: 2, limit: 12, q: '' },
      expect.any(AbortSignal),
    );
    await user.type(
      screen.getByRole('searchbox', { name: 'Search branches by name' }),
      'BRANCH 25',
    );
    expect(await screen.findByRole('link', { name: 'Branch 25' })).toBeInTheDocument();
    expect(mocks.loadBranchesPage).toHaveBeenLastCalledWith(
      { page: 1, limit: 12, q: 'BRANCH 25' },
      expect.any(AbortSignal),
    );
    expect(screen.getByText('Page 1 of 1 · 1 branch')).toBeInTheDocument();
  });

  it('loads branch member pages and searches email through the API', async () => {
    const user = userEvent.setup();
    const members = Array.from({ length: 25 }, (_, index) => ({
      ...branches.branches[0]!.members[1]!,
      userId: `remote-${index + 1}`,
      name: `Remote ${index + 1}`,
      email: `remote-${index + 1}@example.com`,
      frozen: false,
    }));
    mocks.loadBranchMembersPage.mockImplementation(async (_branchId, { page, limit, q }) => {
      const filtered = members.filter((item) =>
        `${item.name} ${item.email}`.toLowerCase().includes(q.toLowerCase()),
      );
      return {
        items: filtered.slice((page - 1) * limit, page * limit),
        page,
        limit,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
      };
    });
    render(
      <DesignerBranches
        branches={{
          ...branches,
          branches: [{ ...branches.branches[0]!, members: [], memberCount: 25 }],
        }}
        workspace={workspace}
        branchId="team-1"
        serverLists
      />,
    );
    expect(await screen.findByText('Remote 1')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Remote 13')).toBeInTheDocument();
    await user.type(
      screen.getByRole('searchbox', { name: 'Search members by name or email' }),
      'REMOTE-25@EXAMPLE.COM',
    );
    expect(await screen.findByText('Remote 25')).toBeInTheDocument();
    expect(mocks.loadBranchMembersPage).toHaveBeenLastCalledWith(
      'team-1',
      { page: 1, limit: 12, q: 'REMOTE-25@EXAMPLE.COM' },
      expect.any(AbortSignal),
    );
  });

  it('paginates members, searches names and emails, and repairs the page after members shrink', async () => {
    const user = userEvent.setup();
    const members = Array.from({ length: 25 }, (_, index) => ({
      ...branches.branches[0]!.members[1]!,
      userId: `user-${index + 1}`,
      name: `Person ${String(index + 1).padStart(2, '0')}`,
      email: `person-${index + 1}@example.com`,
    }));
    const memberBranches = {
      ...branches,
      branches: [{ ...branches.branches[0]!, members, memberCount: members.length }],
    };
    const { rerender } = render(
      <DesignerBranches branches={memberBranches} workspace={workspace} branchId="team-1" />,
    );
    const table = screen.getByRole('table', { name: 'Andheri members' });
    expect(within(table).getByText('Person 01')).toBeInTheDocument();
    expect(within(table).queryByText('Person 13')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Last page' }));
    expect(within(table).getByText('Person 25')).toBeInTheDocument();
    const search = screen.getByRole('searchbox', { name: 'Search members by name or email' });
    await user.type(search, 'PERSON-13@EXAMPLE.COM');
    expect(within(table).getByText('Person 13')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1 · 1 member')).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, 'person 25');
    expect(within(table).getByText('Person 25')).toBeInTheDocument();
    await user.clear(search);
    await user.click(screen.getByRole('button', { name: 'Last page' }));
    await user.click(screen.getByRole('combobox', { name: 'Rows per page' }));
    await user.click(screen.getByRole('option', { name: '24 / page' }));
    expect(screen.getByText('Page 1 of 2 · 25 members')).toBeInTheDocument();
    expect(within(table).getByText('Person 01')).toBeInTheDocument();
    expect(within(table).getByText('Person 24')).toBeInTheDocument();
    expect(within(table).queryByText('Person 25')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Last page' }));
    expect(within(table).getByText('Person 25')).toBeInTheDocument();
    rerender(<DesignerBranches branches={branches} workspace={workspace} branchId="team-1" />);
    expect(within(table).getByText('Rohan Shah')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1 · 2 members')).toBeInTheDocument();
    await user.type(search, 'nobody');
    expect(screen.getByText('No members match your search.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('keeps failed additions retryable', async () => {
    mocks.addTeamMember.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} branchId="team-2" />);
    await user.click(screen.getByRole('button', { name: 'Add members' }));
    await user.click(screen.getByRole('combobox', { name: 'Member' }));
    await user.click(screen.getByRole('option', { name: 'Rohan Shah (rohan@example.com)' }));
    await user.click(screen.getByRole('button', { name: 'Add member' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not add the member.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('removes branch membership only after confirmation', async () => {
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} branchId="team-1" />);
    await user.click(screen.getByRole('button', { name: 'Remove Rohan Shah from Andheri' }));
    expect(mocks.removeTeamMember).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove member' }));
    await waitFor(() =>
      expect(mocks.removeTeamMember).toHaveBeenCalledWith({
        teamId: 'team-1',
        userId: 'user-rohan',
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Their studio membership is unchanged.');
  });

  it('allows cancelling member removal', async () => {
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} branchId="team-1" />);
    await user.click(screen.getByRole('button', { name: 'Remove Rohan Shah from Andheri' }));
    await user.click(screen.getByRole('button', { name: 'Keep member' }));
    expect(mocks.removeTeamMember).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    { ...workspace, canManage: false, currentUserRole: 'viewer' as const },
    { ...workspace, rbacEnabled: false, subscriptionState: 'locked' as const },
    {
      ...workspace,
      capabilities: { ...workspace.capabilities, manageMembers: false, changeMemberRoles: false },
    },
  ])('keeps member management read-only without the required access', (restricted) => {
    render(<DesignerBranches branches={branches} workspace={restricted} branchId="team-1" />);
    expect(screen.queryByRole('button', { name: 'Add members' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Role for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove Rohan/ })).not.toBeInTheDocument();
  });

  it('keeps frozen branches visible and read-only with recovery guidance', () => {
    render(
      <DesignerBranches
        branches={{ ...branches, branches: [{ ...branches.branches[0]!, frozen: true }] }}
        workspace={workspace}
        branchId="team-1"
      />,
    );
    expect(screen.getByText(/restores when you re-upgrade/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add members' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Role for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit branch' })).not.toBeInTheDocument();
  });

  it('shows upgrade and billing recovery prompts', () => {
    const { rerender } = render(
      <DesignerBranches branches={branches} workspace={{ ...workspace, rbacEnabled: false }} />,
    );
    expect(screen.getByText('Branch management is a Corporate feature')).toBeInTheDocument();
    expect(screen.queryByText(workspace.organization.name)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create new branch' })).not.toBeInTheDocument();
    rerender(
      <DesignerBranches
        branches={branches}
        workspace={{ ...workspace, rbacEnabled: false, subscriptionState: 'locked' }}
      />,
    );
    expect(screen.getByText('Branch access is suspended')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Restore access' })).toHaveAttribute(
      'href',
      '/designer/plan-billing',
    );
  });

  it.each([
    { ...workspace, planTier: 'hobby' as const, rbacEnabled: true },
    { ...workspace, planTier: 'professional_plus' as const, rbacEnabled: false },
    { ...workspace, subscriptionState: 'locked' as const, rbacEnabled: true },
  ])(
    'blocks branch tables and direct detail pages when the plan does not enable branches',
    (blocked) => {
      const { rerender } = render(<DesignerBranches branches={branches} workspace={blocked} />);
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Create new branch' })).not.toBeInTheDocument();
      rerender(<DesignerBranches branches={branches} workspace={blocked} branchId="team-1" />);
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit branch' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add members' })).not.toBeInTheDocument();
    },
  );

  it.each(['active', 'locked'] as const)(
    'asks the owner for %s access when the caller cannot manage billing',
    (subscriptionState) => {
      render(
        <DesignerBranches
          branches={branches}
          workspace={{
            ...workspace,
            rbacEnabled: false,
            subscriptionState,
            capabilities: { ...workspace.capabilities, billing: false },
          }}
        />,
      );
      expect(
        screen.getByText(
          subscriptionState === 'locked'
            ? 'Contact your organization Owner to restore billing.'
            : 'Contact your organization Owner to change plans.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: /View Corporate plans|Restore access/ }),
      ).not.toBeInTheDocument();
    },
  );

  it('keeps branch details from switching dashboard context', () => {
    render(
      <DesignerBranches
        branches={{ ...branches, activeTeamId: null }}
        workspace={workspace}
        branchId="team-1"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Switch Branch' })).not.toBeInTheDocument();
    expect(mocks.contextPut).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('does not switch to an unassigned branch or link an unpublished profile', () => {
    render(
      <DesignerBranches
        branches={{ ...branches, branches: [{ ...branches.branches[1]!, profileStatus: 'draft' }] }}
        workspace={workspace}
        branchId="team-2"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Switch Branch' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Portfolio is live' })).not.toBeInTheDocument();
    expect(screen.getByText('Portfolio is not live')).toBeInTheDocument();
  });

  async function confirmBranchRemoval() {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Remove branch Bandra' }));
    await user.click(screen.getByRole('combobox', { name: 'Move projects to' }));
    await user.click(screen.getByRole('option', { name: 'Andheri' }));
    await user.click(screen.getByRole('button', { name: 'Confirm removal' }));
  }

  it('removes a branch with explicit project reassignment', async () => {
    render(<DesignerBranches branches={branches} workspace={workspace} branchId="team-2" />);
    const actions = screen.getByRole('group', { name: 'Branch actions' });
    expect(within(actions).getByRole('button', { name: 'Edit branch' })).toBeInTheDocument();
    expect(
      within(actions).getByRole('button', { name: 'Remove branch Bandra' }),
    ).toBeInTheDocument();
    await confirmBranchRemoval();
    await waitFor(() =>
      expect(mocks.branchDelete).toHaveBeenCalledWith({
        param: { branchId: 'team-2' },
        json: { targetBranchId: 'team-1' },
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Branch Bandra removed. 2 projects moved.',
    );
  });

  it('clears a selected reassignment target when its server search changes', async () => {
    const user = userEvent.setup();
    mocks.loadBranchesPage.mockImplementation(async ({ q }) => ({
      items: q ? [] : [branches.branches[0]!],
      page: 1,
      limit: 12,
      total: q ? 0 : 1,
      totalPages: 1,
    }));
    mocks.loadBranchMembersPage.mockResolvedValue({
      items: [],
      page: 1,
      limit: 12,
      total: 0,
      totalPages: 1,
    });
    render(
      <DesignerBranches branches={branches} workspace={workspace} branchId="team-2" serverLists />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove branch Bandra' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Move projects to' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('combobox', { name: 'Move projects to' }));
    await user.click(screen.getByRole('option', { name: 'Andheri' }));
    expect(screen.getByRole('button', { name: 'Confirm removal' })).toBeEnabled();
    await user.type(
      screen.getByRole('searchbox', { name: 'Search reassignment branches' }),
      'missing',
    );
    expect(screen.getByRole('button', { name: 'Confirm removal' })).toBeDisabled();
    expect(mocks.branchDelete).not.toHaveBeenCalled();
  });

  it('allows a frozen source to be removed into the sole surviving active branch', () => {
    mocks.loadBranchMembersPage.mockResolvedValue({
      items: [],
      page: 1,
      limit: 12,
      total: 0,
      totalPages: 1,
    });
    render(
      <DesignerBranches
        branches={{
          ...branches,
          branchUsage: 1,
          branches: [branches.branches[0]!, { ...branches.branches[1]!, frozen: true }],
        }}
        workspace={workspace}
        branchId="team-2"
        serverLists
      />,
    );
    expect(screen.getByRole('button', { name: 'Remove branch Bandra' })).toBeInTheDocument();
  });

  it.each(['network', 'malformed', 'conflict'])(
    'keeps branch removal failures visible: %s',
    async (failure) => {
      if (failure === 'network') mocks.branchDelete.mockRejectedValue(new Error('offline'));
      else
        mocks.branchDelete.mockResolvedValue({
          ok: failure === 'malformed',
          json: async () =>
            failure === 'malformed'
              ? {}
              : { error: { code: 'CONFLICT', message: 'The final branch stands alone' } },
        });
      render(<DesignerBranches branches={branches} workspace={workspace} branchId="team-2" />);
      await confirmBranchRemoval();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        failure === 'network'
          ? 'Could not remove the branch.'
          : failure === 'malformed'
            ? 'Could not verify that the branch was removed.'
            : 'The final branch stands alone',
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(mocks.refresh).not.toHaveBeenCalled();
    },
  );

  it('hides removal from admins and excludes draft reassignment targets', () => {
    const { rerender } = render(
      <DesignerBranches
        branches={branches}
        workspace={{ ...workspace, currentUserRole: 'admin' }}
        branchId="team-2"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Remove branch Bandra' })).not.toBeInTheDocument();
    rerender(
      <DesignerBranches
        branches={{
          ...branches,
          branches: [branches.branches[1]!, { ...branches.branches[0]!, profileStatus: 'draft' }],
        }}
        workspace={workspace}
        branchId="team-2"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Remove branch Bandra' })).not.toBeInTheDocument();
  });

  it('shows an error when data cannot load', () => {
    render(<DesignerBranches branches={null} workspace={null} error="Could not load." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load.');
  });
});
