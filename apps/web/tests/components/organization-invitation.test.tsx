import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrganizationInvitation } from '../../src/components/organization-invitation';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  acceptInvitation: vi.fn(),
  rejectInvitation: vi.fn(),
}));

vi.mock('../../src/lib/auth-client', () => ({
  authClient: {
    useSession: mocks.useSession,
    organization: {
      acceptInvitation: mocks.acceptInvitation,
      rejectInvitation: mocks.rejectInvitation,
    },
  },
}));

describe('OrganizationInvitation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue({ data: null, isPending: false });
    mocks.acceptInvitation.mockResolvedValue({ data: {}, error: null });
    mocks.rejectInvitation.mockResolvedValue({ data: {}, error: null });
  });

  it('sends a signed-out recipient through login and back to the invitation', () => {
    render(<OrganizationInvitation invitationId="invitation-1" />);

    expect(screen.getByRole('link', { name: 'Sign in to continue' })).toHaveAttribute(
      'href',
      '/login?mode=designer&callbackURL=%2Finvitations%2Finvitation-1',
    );
  });

  it('accepts the invitation for a signed-in recipient', async () => {
    mocks.useSession.mockReturnValue({ data: { user: { id: 'user-1' } }, isPending: false });
    const user = userEvent.setup();
    render(<OrganizationInvitation invitationId="invitation-1" />);

    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await waitFor(() => {
      expect(mocks.acceptInvitation).toHaveBeenCalledWith({ invitationId: 'invitation-1' });
    });
  });

  it('declines the invitation and notifies the studio team', async () => {
    mocks.useSession.mockReturnValue({ data: { user: { id: 'user-1' } }, isPending: false });
    const user = userEvent.setup();
    render(<OrganizationInvitation invitationId="invitation-1" />);

    await user.click(screen.getByRole('button', { name: 'Decline' }));

    await waitFor(() => {
      expect(mocks.rejectInvitation).toHaveBeenCalledWith({ invitationId: 'invitation-1' });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Invitation declined');
  });

  it('shows the server error when the invitation cannot be accepted', async () => {
    mocks.useSession.mockReturnValue({ data: { user: { id: 'user-1' } }, isPending: false });
    mocks.acceptInvitation.mockResolvedValue({
      data: null,
      error: { message: 'Invitation not found' },
    });
    const user = userEvent.setup();
    render(<OrganizationInvitation invitationId="expired" />);

    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invitation not found');
  });
});
