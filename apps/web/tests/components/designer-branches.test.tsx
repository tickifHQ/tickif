import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrganizationBranchesResponse, OrganizationWorkspaceResponse } from '@repo/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesignerBranches } from '../../src/components/designer-branches';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
  removeTeamMember: vi.fn(),
  inviteMember: vi.fn(),
  addTeamMember: vi.fn(),
  contextPut: vi.fn(),
  branchDelete: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));

vi.mock('../../src/lib/auth-client', () => ({
  authClient: {
    organization: {
      createTeam: mocks.createTeam,
      updateTeam: mocks.updateTeam,
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
    vi.clearAllMocks();
    mocks.createTeam.mockResolvedValue({ data: {}, error: null });
    mocks.updateTeam.mockResolvedValue({ data: {}, error: null });
    mocks.removeTeamMember.mockResolvedValue({ data: {}, error: null });
    mocks.inviteMember.mockResolvedValue({ data: {}, error: null });
    mocks.addTeamMember.mockResolvedValue({ data: {}, error: null });
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

  it('renders each branch with its public profile state', () => {
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    expect(screen.getByRole('heading', { name: 'Branches' })).toBeInTheDocument();
    expect(screen.getAllByText('Andheri').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bandra').length).toBeGreaterThan(0);
    expect(screen.getByText('/d/andheri-studio')).toBeInTheDocument();
    expect(screen.getByText('4 projects')).toBeInTheDocument();
    expect(screen.getAllByText('Public')).toHaveLength(2);
    expect(screen.getByText('Current')).toBeInTheDocument();
  });

  it('does not publish links or offer an unpublished branch as a removal target', () => {
    render(
      <DesignerBranches
        branches={{
          ...branches,
          branches: [branches.branches[0]!, { ...branches.branches[1]!, profileStatus: 'draft' }],
        }}
        workspace={workspace}
      />,
    );

    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Public profile is not live')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '/d/bandra-studio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy link for Bandra' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove branch Andheri' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove branch Bandra' })).toBeInTheDocument();
  });

  it('expands a branch to show assigned members with roles', async () => {
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    expect(screen.queryByText('rohan@example.com')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show members of Andheri' }));

    expect(screen.getByText('rohan@example.com')).toBeInTheDocument();
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide members of Andheri' }));
    expect(screen.queryByText('rohan@example.com')).not.toBeInTheDocument();
  });

  it('copies a branch profile link to the clipboard', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    await user.click(screen.getByRole('button', { name: 'Copy link for Andheri' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/d\/andheri-studio$/));
    });
    expect(screen.getByRole('button', { name: 'Link for Andheri copied' })).toBeInTheDocument();
  });

  it('shows an upgrade prompt instead of management on single-user plans', () => {
    render(
      <DesignerBranches
        branches={{
          ...branches,
          branches: [branches.branches[0]!],
          branchUsage: 1,
          branchLimit: 1,
        }}
        workspace={{ ...workspace, rbacEnabled: false, canManage: false }}
      />,
    );

    expect(screen.getByText(/Branches are a Corporate feature/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create branch' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View Corporate plans/i })).toHaveAttribute(
      'href',
      '/designer/plan-billing',
    );
  });

  it('shows billing recovery copy for a locked Corporate workspace', () => {
    render(
      <DesignerBranches
        branches={{ ...branches, branchUsage: 1, branchLimit: 1 }}
        workspace={{
          ...workspace,
          canManage: false,
          rbacEnabled: false,
          subscriptionState: 'locked',
        }}
      />,
    );

    expect(screen.getByText('Branch management is suspended')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Restore billing' })).toHaveAttribute(
      'href',
      '/designer/plan-billing',
    );
    expect(screen.queryByText(/single-user plan/i)).not.toBeInTheDocument();
  });

  it('creates a branch through Better Auth', async () => {
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    await user.type(screen.getByRole('textbox', { name: 'Branch name' }), 'Juhu');
    await user.click(screen.getByRole('button', { name: 'Create branch' }));

    await waitFor(() => {
      expect(mocks.createTeam).toHaveBeenCalledWith({ name: 'Juhu', organizationId: 'org-1' });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Branch Juhu created.');
  });

  it('renames a branch through Better Auth', async () => {
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    const renameButtons = screen.getAllByRole('button', { name: 'Edit name of Andheri' });
    await user.click(renameButtons[0]!);
    const nameInput = screen.getByRole('textbox', { name: 'Branch name for Andheri' });
    await user.clear(nameInput);
    await user.type(nameInput, 'Andheri West');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mocks.updateTeam).toHaveBeenCalledWith({
        teamId: 'team-1',
        data: { name: 'Andheri West' },
      });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Branch renamed.');
  });

  it('hides branch removal from non-owners', () => {
    render(
      <DesignerBranches
        branches={branches}
        workspace={{ ...workspace, currentUserRole: 'admin' }}
      />,
    );

    expect(screen.queryByRole('button', { name: /Remove branch/i })).not.toBeInTheDocument();
  });

  it('removes a member from a branch without touching studio membership', async () => {
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    await user.click(screen.getByRole('button', { name: 'Show members of Andheri' }));
    await user.click(screen.getByRole('button', { name: 'Remove Rohan Shah from Andheri' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirm removal of Rohan Shah from Andheri' }),
    );

    await waitFor(() => {
      expect(mocks.removeTeamMember).toHaveBeenCalledWith({
        teamId: 'team-1',
        userId: 'user-rohan',
      });
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Rohan Shah removed from the branch. Their studio membership is unchanged.',
    );
  });

  it('keeps the member when the removal confirm is dismissed', async () => {
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    await user.click(screen.getByRole('button', { name: 'Show members of Andheri' }));
    await user.click(screen.getByRole('button', { name: 'Remove Rohan Shah from Andheri' }));
    await user.click(screen.getByRole('button', { name: 'Keep Rohan Shah in Andheri' }));

    expect(mocks.removeTeamMember).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Confirm removal of Rohan Shah from Andheri' }),
    ).not.toBeInTheDocument();
  });

  it('opens a branch dashboard by switching context first', async () => {
    const user = userEvent.setup();
    render(
      <DesignerBranches
        branches={{
          ...branches,
          branches: [
            branches.branches[0]!,
            {
              ...branches.branches[1]!,
              memberCount: 1,
              members: [branches.branches[0]!.members[0]!],
            },
          ],
        }}
        workspace={workspace}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch Branch' }));

    await waitFor(() => {
      expect(mocks.contextPut).toHaveBeenCalledWith({
        json: { kind: 'organization', organizationId: 'org-1', teamId: 'team-2' },
      });
    });
    expect(mocks.push).toHaveBeenCalledWith('/designer/dashboard');
  });

  it('does not offer a dashboard switch for a branch the current user cannot access', () => {
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    expect(screen.queryByRole('button', { name: 'Switch Branch' })).not.toBeInTheDocument();
  });

  it('invites a teammate directly into a branch', async () => {
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    await user.type(screen.getByRole('textbox', { name: 'Work email' }), 'teammate@example.com');
    const branchSelects = screen.getAllByRole('combobox', { name: 'Branch' });
    await user.selectOptions(branchSelects[0]!, 'team-2');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    await waitFor(() => {
      expect(mocks.inviteMember).toHaveBeenCalledWith({
        email: 'teammate@example.com',
        role: 'member',
        organizationId: 'org-1',
        teamId: 'team-2',
      });
    });
    expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument();
  });

  it('assigns an existing member to a branch', async () => {
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Member' }), 'user-rohan');
    const branchSelects = screen.getAllByRole('combobox', { name: 'Branch' });
    await user.selectOptions(branchSelects[1]!, 'team-2');
    await user.click(screen.getByRole('button', { name: 'Assign' }));

    await waitFor(() => {
      expect(mocks.addTeamMember).toHaveBeenCalledWith({ teamId: 'team-2', userId: 'user-rohan' });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Rohan Shah assigned to the branch.');
  });

  it('shows frozen branches from the API as recoverable with live projects noted', () => {
    render(
      <DesignerBranches
        branches={{
          ...branches,
          branches: [
            ...branches.branches,
            {
              id: 'team-frozen',
              name: 'Powai',
              profileId: '44444444-4444-4444-8444-444444444444',
              profileSlug: 'powai-studio',
              profileStatus: 'active',
              projectCount: 3,
              memberCount: 0,
              averageRating: 0,
              reviewCount: 0,
              footprint: [],
              frozen: true,
              frozenAt: '2026-08-20T00:00:00.000Z',
              freezeRank: 1,
              createdAt: '2026-08-03T00:00:00.000Z',
              members: [],
            },
          ],
        }}
        workspace={workspace}
      />,
    );

    expect(screen.getAllByText('Powai').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Frozen').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/restores when you re-upgrade/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/stay publicly live/i).length).toBeGreaterThan(0);
  });

  it('removes a branch with reassignment to another branch', async () => {
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    await user.click(screen.getByRole('button', { name: 'Remove branch Bandra' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Move projects to' }), 'team-1');
    await user.click(screen.getByRole('button', { name: 'Confirm removal' }));

    await waitFor(() => {
      expect(mocks.branchDelete).toHaveBeenCalledWith({
        param: { branchId: 'team-2' },
        json: { targetBranchId: 'team-1' },
      });
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Branch Bandra removed. 2 projects moved.',
    );
  });

  it('surfaces remove errors without deleting anything', async () => {
    mocks.branchDelete.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: 'CONFLICT', message: 'The final branch stands alone' } }),
    });
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    await user.click(screen.getByRole('button', { name: 'Remove branch Bandra' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Move projects to' }), 'team-1');
    await user.click(screen.getByRole('button', { name: 'Confirm removal' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The final branch stands alone');
  });

  it('keeps a network removal error inside the confirmation dialog', async () => {
    mocks.branchDelete.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    await user.click(screen.getByRole('button', { name: 'Remove branch Bandra' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Move projects to' }), 'team-1');
    await user.click(screen.getByRole('button', { name: 'Confirm removal' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent('Could not remove the branch.');
  });

  it('does not claim removal when the success response is malformed', async () => {
    mocks.branchDelete.mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    await user.click(screen.getByRole('button', { name: 'Remove branch Bandra' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Move projects to' }), 'team-1');
    await user.click(screen.getByRole('button', { name: 'Confirm removal' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Could not verify that the branch was removed. Refresh and try again.',
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('maps tier errors to an upgrade message', async () => {
    mocks.createTeam.mockResolvedValue({
      data: null,
      error: { code: 'ORGANIZATION_RBAC_REQUIRES_CORPORATE', message: 'Upgrade to Corporate' },
    });
    const user = userEvent.setup();
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    await user.type(screen.getByRole('textbox', { name: 'Branch name' }), 'Juhu');
    await user.click(screen.getByRole('button', { name: 'Create branch' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Upgrade to Corporate to unlock branches.',
    );
  });

  it('renders a visible load error when branches are unavailable', () => {
    render(<DesignerBranches branches={null} workspace={null} error="Could not load." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load.');
  });
});
