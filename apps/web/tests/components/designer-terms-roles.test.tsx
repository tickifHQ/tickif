import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrganizationWorkspaceResponse } from '@repo/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesignerTermsRoles } from '../../src/components/designer-terms-roles';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  inviteMember: vi.fn(),
  updateMemberRole: vi.fn(),
  cancelInvitation: vi.fn(),
  leave: vi.fn(),
  transferPost: vi.fn(),
  transferAction: vi.fn(),
  transferScope: new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === '$post') return mocks.transferPost;
        return {
          accept: { $post: mocks.transferAction },
          decline: { $post: mocks.transferAction },
          cancel: { $post: mocks.transferAction },
        };
      },
    },
  ),
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
      leave: mocks.leave,
    },
  },
}));

vi.mock('@/lib/api', () => ({
  api: { api: { orgs: { 'ownership-transfers': mocks.transferScope } } },
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
    mocks.leave.mockResolvedValue({ data: {}, error: null });
    mocks.transferPost.mockResolvedValue({ ok: true, json: async () => ({}) });
    mocks.transferAction.mockResolvedValue({ ok: true, json: async () => ({}) });
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

  it('auto-dismisses the invitation success alert after five seconds', async () => {
    vi.useFakeTimers();
    try {
      render(<DesignerTermsRoles workspace={ownerWorkspace} />);
      fireEvent.change(screen.getByRole('textbox', { name: 'Work email' }), {
        target: { value: 'teammate@example.com' },
      });
      fireEvent.submit(
        screen.getByRole('button', { name: 'Send invite' }).closest('form') as HTMLFormElement,
      );

      await vi.waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent(
          'Invitation sent to teammate@example.com.',
        );
      });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks inviting an existing member without calling the backend', async () => {
    const user = userEvent.setup();
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    await user.type(screen.getByRole('textbox', { name: 'Work email' }), 'asha@example.com');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'asha@example.com is already a member of this studio.',
    );
    expect(mocks.inviteMember).not.toHaveBeenCalled();
  });

  it('replaces a pending invite instead of duplicating it', async () => {
    const user = userEvent.setup();
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    await user.type(screen.getByRole('textbox', { name: 'Work email' }), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    await waitFor(() => {
      expect(mocks.inviteMember).toHaveBeenCalledWith({
        email: 'new@example.com',
        role: 'member',
        organizationId: 'org-1',
      });
    });
    expect(screen.getByRole('status')).toHaveTextContent('was replaced with a new 7-day invite');
  });

  it('renders invite states distinctly with days remaining on pending', () => {
    render(
      <DesignerTermsRoles
        workspace={{
          ...ownerWorkspace,
          invitations: [
            { ...ownerWorkspace.invitations[0]!, id: 'inv-pending', state: 'pending' },
            {
              id: 'inv-accepted',
              email: 'accepted@example.com',
              role: 'member',
              state: 'active',
              createdAt: '2026-08-03T00:00:00.000Z',
              expiresAt: '2099-08-05T00:00:00.000Z',
            },
            {
              id: 'inv-declined',
              email: 'declined@example.com',
              role: 'viewer',
              state: 'declined',
              createdAt: '2026-08-03T00:00:00.000Z',
              expiresAt: '2026-08-10T00:00:00.000Z',
            },
            {
              id: 'inv-expired',
              email: 'expired@example.com',
              role: 'member',
              state: 'expired',
              createdAt: '2026-08-03T00:00:00.000Z',
              expiresAt: '2026-08-10T00:00:00.000Z',
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('Declined')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.getByText(/days remaining/i)).toBeInTheDocument();
  });

  it('counts only pending invitations in the summary', () => {
    render(
      <DesignerTermsRoles
        workspace={{
          ...ownerWorkspace,
          invitations: [
            {
              ...ownerWorkspace.invitations[0]!,
              id: 'inv-pending',
              state: 'pending',
              expiresAt: '2099-08-05T00:00:00.000Z',
            },
            {
              id: 'inv-accepted',
              email: 'accepted@example.com',
              role: 'member',
              state: 'active',
              createdAt: '2026-08-03T00:00:00.000Z',
              expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
            },
            {
              id: 'inv-declined',
              email: 'declined@example.com',
              role: 'viewer',
              state: 'declined',
              createdAt: '2026-08-03T00:00:00.000Z',
              expiresAt: '2026-08-10T00:00:00.000Z',
            },
            {
              id: 'inv-expired',
              email: 'expired@example.com',
              role: 'member',
              state: 'expired',
              createdAt: '2026-08-03T00:00:00.000Z',
              expiresAt: '2026-08-10T00:00:00.000Z',
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('1', { selector: '[data-metric="invitations"]' })).toBeInTheDocument();
    expect(screen.queryByText(/expiring soon/i)).not.toBeInTheDocument();
  });

  it('resends a pending invite with replacement copy', async () => {
    const user = userEvent.setup();
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    await user.click(screen.getByRole('button', { name: 'Resend invitation to new@example.com' }));

    await waitFor(() => {
      expect(mocks.inviteMember).toHaveBeenCalledWith({
        email: 'new@example.com',
        role: 'admin',
        organizationId: 'org-1',
      });
    });
    expect(screen.getByRole('status')).toHaveTextContent('was replaced with a new 7-day invite');
  });

  it('offers no phone invite field', () => {
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument();
  });

  it('updates another member role through Better Auth', async () => {
    const user = userEvent.setup();
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    await user.click(screen.getByRole('button', { name: 'Manage Rohan Shah' }));
    await user.click(screen.getByRole('menuitem', { name: 'Change role to Admin' }));

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

  it('marks the active role with a check and never offers Owner', async () => {
    const user = userEvent.setup();
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    await user.click(screen.getByRole('button', { name: 'Manage Rohan Shah' }));

    const activeItem = screen.getByRole('menuitem', { name: 'Change role to Member' });
    expect(activeItem.querySelector('svg')).not.toBeNull();
    expect(
      screen.getByRole('menuitem', { name: 'Change role to Admin' }).querySelector('svg'),
    ).toBeNull();
    expect(
      screen.queryByRole('menuitem', { name: 'Change role to Owner' }),
    ).not.toBeInTheDocument();
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

  it('blocks the sole Owner from leaving with an explanation', () => {
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    expect(
      screen.getByText('Transfer ownership or delete the organisation first'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave organisation' })).not.toBeInTheDocument();
  });

  it('lets a non-owner leave after confirmation', async () => {
    const user = userEvent.setup();
    render(
      <DesignerTermsRoles
        workspace={{
          ...ownerWorkspace,
          currentUserRole: 'admin',
          canManage: true,
          capabilities: { ...ownerWorkspace.capabilities, transferOwnership: false },
          members: [
            ownerWorkspace.members[0]!,
            { ...ownerWorkspace.members[1]!, isCurrentUser: true },
          ],
          invitations: [],
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Leave organisation' }));
    await user.click(screen.getByRole('button', { name: 'Confirm leave' }));

    await waitFor(() => {
      expect(mocks.leave).toHaveBeenCalledWith({ organizationId: 'org-1' });
    });
    expect(screen.getByRole('status')).toHaveTextContent('You left the organisation.');
  });

  it('starts an ownership transfer to an Admin or Member', async () => {
    const user = userEvent.setup();
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Nominate an Admin or Member as Owner' }),
      'member-rohan',
    );
    await user.click(screen.getByRole('button', { name: 'Request transfer' }));

    await waitFor(() => {
      expect(mocks.transferPost).toHaveBeenCalled();
    });
    expect(screen.getByRole('status')).toHaveTextContent('your role becomes Admin on completion');
  });

  it('lets the transfer target accept or decline', async () => {
    const transfer = {
      id: 'transfer-1',
      organizationId: 'org-1',
      status: 'pending',
      initiator: { userId: 'user-owner', name: 'Asha Rao', email: 'asha@example.com' },
      target: {
        memberId: 'member-rohan',
        userId: 'user-rohan',
        name: 'Rohan Shah',
        email: 'rohan@example.com',
        role: 'member',
      },
      expiresAt: '2099-08-10T00:00:00.000Z',
      createdAt: '2026-08-03T00:00:00.000Z',
      resolvedAt: null,
    } as const;
    const user = userEvent.setup();
    render(
      <DesignerTermsRoles
        workspace={{
          ...ownerWorkspace,
          currentUserRole: 'member',
          canManage: false,
          capabilities: {
            ...ownerWorkspace.capabilities,
            manageMembers: false,
            changeMemberRoles: false,
            transferOwnership: false,
          },
          members: [
            ownerWorkspace.members[0]!,
            { ...ownerWorkspace.members[1]!, isCurrentUser: true },
          ],
          invitations: [],
          ownershipTransfer: { ...transfer },
        }}
      />,
    );

    expect(screen.getByText(/Transfer to Rohan Shah is pending/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept transfer' }));

    await waitFor(() => {
      expect(mocks.transferAction).toHaveBeenCalled();
    });
    expect(screen.getByRole('status')).toHaveTextContent('previous Owner is now an Admin');
  });

  it('hides leave and transfer surfaces below Corporate', () => {
    render(
      <DesignerTermsRoles
        workspace={{
          ...ownerWorkspace,
          rbacEnabled: false,
          canManage: false,
          seatUsage: 1,
          seatLimit: 1,
          capabilities: {
            ...ownerWorkspace.capabilities,
            billing: true,
            manageMembers: false,
            changeMemberRoles: false,
            transferOwnership: false,
          },
          invitations: [],
        }}
      />,
    );

    expect(screen.getByText(/Corporate feature/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave organisation' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ownership transfer')).not.toBeInTheDocument();
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
