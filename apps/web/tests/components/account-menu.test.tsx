import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountMenu } from '../../src/components/account-menu';

const mock = vi.hoisted(() => ({
  signOut: vi.fn(),
  session: null as { user: { name: string; email: string | null } } | null,
  isPending: false,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: mock.session, isPending: mock.isPending }),
    signOut: mock.signOut,
  },
}));

describe('AccountMenu', () => {
  beforeEach(() => {
    mock.session = null;
    mock.isPending = false;
    mock.signOut.mockReset();
  });

  it('renders a skeleton when session is loading', () => {
    mock.isPending = true;
    render(<AccountMenu />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders a sign-in link when not authenticated', () => {
    render(<AccountMenu />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('renders user initial when authenticated', () => {
    mock.session = { user: { name: 'Alice', email: 'alice@test.com' } };
    render(<AccountMenu />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('calls signOut on sign-out click', async () => {
    mock.session = { user: { name: 'Alice', email: null } };
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByText('A'));
    await user.click(screen.getByText('Sign out'));
    expect(mock.signOut).toHaveBeenCalledTimes(1);
  });
});
