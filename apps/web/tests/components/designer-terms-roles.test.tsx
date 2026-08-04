import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrganizationWorkspaceResponse } from '@repo/contracts';
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
  members: [
    {
      id: 'member-owner',
      userId: 'user-owner',
      name: 'Asha Rao',
      email: 'asha@example.com',
      image: null,
      role: 'owner',
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
      joinedAt: '2026-08-02T00:00:00.000Z',
      isCurrentUser: false,
    },
  ],
  invitations: [
    {
      id: 'invitation-1',
      email: 'new@example.com',
      role: 'admin',
      createdAt: '2026-08-03T00:00:00.000Z',
      expiresAt: '2099-08-05T00:00:00.000Z',
    },
  ],
};

describe('DesignerTermsRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inviteMember.mockResolvedValue({ data: {}, error: null });
    mocks.updateMemberRole.mockResolvedValue({ data: {}, error: null });
    mocks.cancelInvitation.mockResolvedValue({ data: {}, error: null });
  });

  it('renders live workspace members and invitation metrics', () => {
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    expect(screen.getByRole('heading', { name: 'Teams & Roles' })).toBeInTheDocument();
    expect(screen.getByText('Studio One')).toBeInTheDocument();
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('Rohan Shah')).toBeInTheDocument();
    expect(screen.getByText('new@example.com')).toBeInTheDocument();
    expect(screen.getByText('2', { selector: '[data-metric="members"]' })).toBeInTheDocument();
    expect(screen.getByText('1', { selector: '[data-metric="invitations"]' })).toBeInTheDocument();
  });

  it('keeps a regular member in read-only mode', () => {
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

    expect(screen.getByText('Member access')).toBeInTheDocument();
    expect(
      screen.getByText('Member', { selector: '[data-metric="current-role"]' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Pending invitations')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /invite member/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /change rohan shah role/i }),
    ).not.toBeInTheDocument();
  });

  it('invites a member through Better Auth and refreshes the workspace', async () => {
    const user = userEvent.setup();
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    await user.click(screen.getByRole('button', { name: /invite member/i }));
    await user.type(screen.getByLabelText(/email address/i), 'teammate@example.com');
    await user.click(screen.getByRole('button', { name: /send invitation/i }));

    await waitFor(() => {
      expect(mocks.inviteMember).toHaveBeenCalledWith({
        email: 'teammate@example.com',
        role: 'member',
        organizationId: 'org-1',
      });
      expect(mocks.refresh).toHaveBeenCalled();
    });
  });

  it('updates a member role through Better Auth', async () => {
    const user = userEvent.setup();
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    await user.click(screen.getByRole('button', { name: /change rohan shah role/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Admin' }));

    await waitFor(() => {
      expect(mocks.updateMemberRole).toHaveBeenCalledWith({
        memberId: 'member-rohan',
        role: 'admin',
        organizationId: 'org-1',
      });
      expect(mocks.refresh).toHaveBeenCalled();
    });
  });

  it('cancels a pending invitation through Better Auth', async () => {
    const user = userEvent.setup();
    render(<DesignerTermsRoles workspace={ownerWorkspace} />);

    await user.click(
      screen.getByRole('button', { name: /cancel invitation for new@example.com/i }),
    );

    await waitFor(() => {
      expect(mocks.cancelInvitation).toHaveBeenCalledWith({ invitationId: 'invitation-1' });
      expect(mocks.refresh).toHaveBeenCalled();
    });
  });
});
