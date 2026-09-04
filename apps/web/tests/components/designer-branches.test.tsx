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
  listTeams: vi.fn(),
  inviteMember: vi.fn(),
  addTeamMember: vi.fn(),
  contextPut: vi.fn(),
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
      listTeams: mocks.listTeams,
      inviteMember: mocks.inviteMember,
      addTeamMember: mocks.addTeamMember,
    },
  },
}));

vi.mock('@/lib/api', () => ({
  api: { api: { orgs: { context: { $put: mocks.contextPut } } } },
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
      projectCount: 4,
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
      profileId: '22222222-2222-4222-8222-222222222222',
      profileSlug: 'bandra-studio',
      projectCount: 2,
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
    mocks.listTeams.mockResolvedValue({ data: [] });
    mocks.inviteMember.mockResolvedValue({ data: {}, error: null });
    mocks.addTeamMember.mockResolvedValue({ data: {}, error: null });
    mocks.contextPut.mockResolvedValue({ ok: true });
  });

  it('renders each branch with its public profile state', () => {
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    expect(screen.getByRole('heading', { name: 'Branches' })).toBeInTheDocument();
    expect(screen.getAllByText('Andheri').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bandra').length).toBeGreaterThan(0);
    expect(screen.getByText('/d/andheri-studio')).toBeInTheDocument();
    expect(screen.getByText('4 projects')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
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

  it('explains that branches cannot be removed instead of offering removal', () => {
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    expect(screen.queryByRole('button', { name: /Remove branch/i })).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/cannot be removed while they hold projects/i).length,
    ).toBeGreaterThan(0);
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
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    await user.click(screen.getByRole('button', { name: 'Switch Branch' }));

    await waitFor(() => {
      expect(mocks.contextPut).toHaveBeenCalledWith({
        json: { kind: 'organization', organizationId: 'org-1', teamId: 'team-2' },
      });
    });
    expect(mocks.push).toHaveBeenCalledWith('/designer/dashboard');
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

  it('shows frozen branches as recoverable with live projects noted', async () => {
    mocks.listTeams.mockResolvedValue({
      data: [{ id: 'team-frozen', name: 'Powai', frozen: true }],
    });
    render(<DesignerBranches branches={branches} workspace={workspace} />);

    expect(await screen.findByText('Powai')).toBeInTheDocument();
    expect(screen.getByText('Frozen')).toBeInTheDocument();
    expect(screen.getByText(/restores when you re-upgrade/i)).toBeInTheDocument();
    expect(screen.getByText(/stay publicly live/i)).toBeInTheDocument();
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
