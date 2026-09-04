import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrganizationWorkspaceResponse } from '@repo/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesignerTermsRoles } from '../../src/components/designer-terms-roles';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  inviteMember: vi.fn(),
  updateMemberRole: vi.fn(),
  cancelInvitation: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('../../src/lib/auth-client', () => ({
  authClient: {
    organization: {
      inviteMember: mocks.inviteMember,
      updateMemberRole: mocks.updateMemberRole,
      cancelInvitation: mocks.cancelInvitation,
    },
  },
}));

const ownerWorkspace: OrganizationWorkspaceResponse = {
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
  seatUsage: 2,
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
  invitations: [
    {
      id: 'invitation-1',
      email: 'new@example.com',
      role: 'admin',
      state: 'pending',
      createdAt: '2026-08-03T00:00:00.000Z',
      expiresAt: '2099-08-05T00:00:00.000Z',
    },
  ],
  ownershipTransfer: null,
};

describe('DesignerTermsRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inviteMember.mockResolvedValue({ data: {}, error: null });
    mocks.updateMemberRole.mockResolvedValue({ data: {}, error: null });
    mocks.cancelInvitation.mockResolvedValue({ data: {}, error: null });
  });

  it('renders the new layout from the live organization workspace', () => {
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    expect(screen.getByRole('heading', { name: 'Team & Roles' })).toBeInTheDocument();
    expect(screen.getByText('Studio One')).toBeInTheDocument();
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('Rohan Shah')).toBeInTheDocument();
    expect(screen.getByText('new@example.com')).toBeInTheDocument();
    expect(screen.getByText('2', { selector: '[data-metric="members"]' })).toBeInTheDocument();
    expect(screen.queryByText('0 expiring soon')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('teammate@studio.com')).toHaveValue('');
    expect(
      screen.getByText('Full control of this studio, including its team and settings.'),
    ).toBeInTheDocument();

    const membersSection = screen.getByRole('heading', { name: 'Members' }).parentElement;
    expect(membersSection).not.toBeNull();
    expect(within(membersSection!).getAllByText('Owner')).toHaveLength(1);
    expect(within(membersSection!).getAllByText('Member')).toHaveLength(1);
  });

  it('uses role-specific access copy and keeps regular members read-only', () => {
    render(
      <DesignerTermsRoles
        workspace={{
          ...ownerWorkspace,
          currentUserRole: 'member',
          canManage: false,
          invitations: [],
        }}
      />,
    );

    expect(
      screen.getByText('Can access the studio workspace without team-management controls.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send invite' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /manage rohan shah/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pending invites' })).not.toBeInTheDocument();
  });

  it('counts only active seats and labels frozen memberships as recoverable', () => {
    render(
      <DesignerTermsRoles
        workspace={{
          ...ownerWorkspace,
          seatUsage: 1,
          members: [
            ownerWorkspace.members[0]!,
            {
              ...ownerWorkspace.members[1]!,
              frozen: true,
              frozenAt: '2026-08-20T00:00:00.000Z',
              freezeRank: 1,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('1', { selector: '[data-metric="members"]' })).toBeInTheDocument();
    expect(screen.getByText('Frozen')).toBeInTheDocument();
    expect(screen.getByText(/restores on re-upgrade/i)).toBeInTheDocument();
    expect(screen.getByText('1 of 10 seats used')).toBeInTheDocument();
  });

  it('shows Unlimited for corporate seat caps', () => {
    render(<DesignerTermsRoles workspace={{ ...ownerWorkspace, seatUsage: 5, seatLimit: -1 }} />);

    expect(screen.getByText('5 of Unlimited seats used')).toBeInTheDocument();
  });

  it('renders all five roles with badges and descriptions', () => {
    render(
      <DesignerTermsRoles
        workspace={{
          ...ownerWorkspace,
          currentUserRole: 'billing_admin',
          members: [
            ownerWorkspace.members[0]!,
            { ...ownerWorkspace.members[1]!, role: 'billing_admin' },
            {
              id: 'member-viewer',
              userId: 'user-viewer',
              name: 'Mira Khan',
              email: 'mira@example.com',
              image: null,
              role: 'viewer',
              frozen: false,
              frozenAt: null,
              freezeRank: null,
              joinedAt: '2026-08-04T00:00:00.000Z',
              isCurrentUser: false,
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByText('Billing Admin').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Viewer').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Can manage billing, invoices, and subscription operations.'),
    ).toBeInTheDocument();
  });

  it('shows an upgrade prompt instead of role management on single-user plans', () => {
    render(
      <DesignerTermsRoles
        workspace={{
          ...ownerWorkspace,
          rbacEnabled: false,
          canManage: false,
          planTier: 'hobby',
          subscriptionState: 'active',
          seatUsage: 1,
          seatLimit: 1,
          capabilities: {
            ...ownerWorkspace.capabilities,
            billing: true,
            manageMembers: false,
            changeMemberRoles: false,
          },
          invitations: [],
        }}
      />,
    );

    expect(screen.getByText(/Corporate feature/i)).toBeInTheDocument();
    expect(screen.getByText(/Owner solo with 1 of 1 seats/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send invite' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Corporate plans/i })).toHaveAttribute(
      'href',
      '/designer/plan-billing',
    );
  });

  it('prompts locked Corporate orgs to restore billing instead of upgrading', () => {
    render(
      <DesignerTermsRoles
        workspace={{
          ...ownerWorkspace,
          rbacEnabled: false,
          canManage: false,
          planTier: 'corporate',
          subscriptionState: 'locked',
          seatUsage: 6,
          seatLimit: 1,
          capabilities: {
            ...ownerWorkspace.capabilities,
            billing: true,
            manageMembers: false,
            changeMemberRoles: false,
          },
          invitations: [],
        }}
      />,
    );

    expect(screen.getByText(/Team access is suspended/i)).toBeInTheDocument();
    expect(screen.getByText(/Corporate plan is retained/i)).toBeInTheDocument();
    expect(screen.getByText(/reactivate 6 of Unlimited seats/i)).toBeInTheDocument();
    expect(screen.getByText('6 of Unlimited seats used')).toBeInTheDocument();
    expect(screen.queryByText('6 of 1 seats used')).not.toBeInTheDocument();
    expect(screen.queryByText(/Upgrade to Corporate/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send invite' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Restore access/i })).toHaveAttribute(
      'href',
      '/designer/plan-billing',
    );
  });

  it('names the retained tier for locked non-Corporate orgs', () => {
    render(
      <DesignerTermsRoles
        workspace={{
          ...ownerWorkspace,
          rbacEnabled: false,
          canManage: false,
          planTier: 'professional_plus',
          subscriptionState: 'locked',
          seatUsage: 1,
          seatLimit: 1,
          capabilities: {
            ...ownerWorkspace.capabilities,
            billing: true,
            manageMembers: false,
            changeMemberRoles: false,
          },
          invitations: [],
        }}
      />,
    );

    expect(screen.getByText(/Professional\+ plan is retained/i)).toBeInTheDocument();
    expect(screen.getByText(/reactivate 1 of 1 seats/i)).toBeInTheDocument();
    expect(screen.queryByText(/Corporate plan is retained/i)).not.toBeInTheDocument();
  });

  it('directs locked non-billing roles to the Owner instead of a denied billing page', () => {
    render(
      <DesignerTermsRoles
        workspace={{
          ...ownerWorkspace,
          currentUserRole: 'admin',
          rbacEnabled: false,
          canManage: false,
          subscriptionState: 'locked',
          capabilities: {
            ...ownerWorkspace.capabilities,
            billing: false,
            manageMembers: false,
            changeMemberRoles: false,
          },
          invitations: [],
        }}
      />,
    );

    expect(
      screen.getByText(/contact your organization Owner to restore billing/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Restore access/i })).not.toBeInTheDocument();
  });

  it('hides member management for billing admins, members, and viewers', () => {
    for (const role of ['billing_admin', 'member', 'viewer'] as const) {
      const { unmount } = render(
        <DesignerTermsRoles
          workspace={{
            ...ownerWorkspace,
            currentUserRole: role,
            canManage: false,
            capabilities: {
              ...ownerWorkspace.capabilities,
              manageMembers: false,
              changeMemberRoles: false,
              billing: role === 'billing_admin',
            },
            invitations: [],
          }}
        />,
      );
      expect(screen.queryByRole('button', { name: 'Send invite' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /manage rohan/i })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('maps corporate tier errors to an upgrade message', async () => {
    mocks.inviteMember.mockResolvedValue({
      data: null,
      error: { code: 'ORGANIZATION_RBAC_REQUIRES_CORPORATE', message: 'Upgrade to Corporate' },
    });
    const user = userEvent.setup();
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    await user.type(screen.getByRole('textbox', { name: 'Work email' }), 'tier@example.com');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Upgrade to Corporate to unlock team management.',
    );
  });

  it('maps a mid-session billing lock to recovery instead of an upgrade', async () => {
    mocks.inviteMember.mockResolvedValue({
      data: null,
      error: { code: 'ORGANIZATION_BILLING_LOCKED', message: 'Restore billing' },
    });
    const user = userEvent.setup();
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    await user.type(screen.getByRole('textbox', { name: 'Work email' }), 'locked@example.com');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Restore billing to unlock team management.',
    );
  });

  it('invites a member through Better Auth and shows visible success feedback', async () => {
    const user = userEvent.setup();
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    await user.type(screen.getByRole('textbox', { name: 'Work email' }), 'teammate@example.com');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Role' }), 'admin');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    await waitFor(() => {
      expect(mocks.inviteMember).toHaveBeenCalledWith({
        email: 'teammate@example.com',
        role: 'admin',
        organizationId: 'org-1',
      });
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Invitation sent to teammate@example.com.',
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('shows duplicate invitations as a visible error without calling the backend', async () => {
    const user = userEvent.setup();
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    await user.type(screen.getByRole('textbox', { name: 'Work email' }), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'new@example.com is already a member or has a pending invitation.',
    );
    expect(mocks.inviteMember).not.toHaveBeenCalled();
  });

  it('updates another member role through Better Auth', async () => {
    const user = userEvent.setup();
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    await user.click(screen.getByRole('button', { name: 'Manage Rohan Shah' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Admin' }));

    await waitFor(() => {
      expect(mocks.updateMemberRole).toHaveBeenCalledWith({
        memberId: 'member-rohan',
        role: 'admin',
        organizationId: 'org-1',
      });
    });
    expect(screen.getByRole('status')).toHaveTextContent("Rohan Shah's role changed to Admin.");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('does not offer role or removal actions for the current user', () => {
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    expect(screen.queryByRole('button', { name: 'Manage Asha Rao' })).not.toBeInTheDocument();
    expect(screen.queryByText('Remove member')).not.toBeInTheDocument();
  });

  it('revokes a pending invitation through Better Auth', async () => {
    const user = userEvent.setup();
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    await user.click(screen.getByRole('button', { name: 'Revoke invitation for new@example.com' }));

    await waitFor(() => {
      expect(mocks.cancelInvitation).toHaveBeenCalledWith({ invitationId: 'invitation-1' });
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Invitation for new@example.com was revoked.',
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('shows backend mutation errors visibly', async () => {
    mocks.inviteMember.mockResolvedValue({
      data: null,
      error: { message: 'This invitation is not allowed.' },
    });
    const user = userEvent.setup();
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    await user.type(screen.getByRole('textbox', { name: 'Work email' }), 'blocked@example.com');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This invitation is not allowed.');
  });

  it('renders a visible load error when the workspace is unavailable', () => {
    render(<DesignerTermsRoles workspace={null} error="Could not load your studio team." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load your studio team.');
  });
});
