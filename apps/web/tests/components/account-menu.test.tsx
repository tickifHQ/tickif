import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountMenu } from '../../src/components/account-menu';

const mock = vi.hoisted(() => ({
  signOut: vi.fn(),
  session: null as {
    user: { name: string; email: string | null; role?: string };
    session?: { activeOrganizationId?: string | null };
  } | null,
  isPending: false,
  router: {
    refresh: vi.fn(),
    replace: vi.fn(),
  },
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: mock.session, isPending: mock.isPending }),
    signOut: mock.signOut,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mock.router,
}));

describe('AccountMenu', () => {
  it.each(['visitor', 'designer'])(
    'offers personal settings for %s in personal context',
    async (role) => {
      mock.session = {
        user: { name: 'Alice', email: null, role },
        session: { activeOrganizationId: null },
      };
      const user = userEvent.setup();
      render(<AccountMenu />);
      await user.click(screen.getByRole('button', { name: /open account menu/i }));
      expect(screen.getByRole('menuitem', { name: 'Personal settings' })).toHaveAttribute(
        'href',
        '/home/settings',
      );
      expect(screen.getByRole('menuitem', { name: 'My consultations' })).toHaveAttribute(
        'href',
        '/home/consultations',
      );
    },
  );

  it('keeps organization settings separate from personal settings', async () => {
    mock.session = {
      user: { name: 'Alice', email: null, role: 'designer' },
      session: { activeOrganizationId: 'org' },
    };
    const user = userEvent.setup();
    render(<AccountMenu showProfileSettings />);
    await user.click(screen.getByRole('button', { name: /open account menu/i }));
    expect(screen.queryByRole('menuitem', { name: 'Personal settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'My consultations' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Profile & settings' })).toHaveAttribute(
      'href',
      '/designer/profile',
    );
  });
  beforeEach(() => {
    mock.session = null;
    mock.isPending = false;
    mock.signOut.mockReset();
    mock.router.refresh.mockReset();
    mock.router.replace.mockReset();
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

  it('renders a generated avatar trigger when authenticated', () => {
    mock.session = { user: { name: 'Alice', email: 'alice@test.com' } };
    render(<AccountMenu />);
    expect(
      screen.getByRole('button', { name: /open account menu for alice/i }),
    ).toBeInTheDocument();
  });

  it('keeps the labelled workspace trigger accessible when its label collapses on mobile', () => {
    mock.session = { user: { name: 'Alice Example', email: 'alice@test.com' } };
    render(<AccountMenu showLabel />);

    const trigger = screen.getByRole('button', { name: /open account menu for alice example/i });
    expect(trigger).toBeInTheDocument();
    expect(screen.getByText('Alice')).toHaveClass('hidden', 'sm:inline');
  });

  it('calls signOut on sign-out click', async () => {
    mock.session = { user: { name: 'Alice', email: null } };
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole('button', { name: /open account menu for alice/i }));
    await user.click(screen.getByText('Sign out'));
    expect(mock.signOut).toHaveBeenCalledTimes(1);
    expect(mock.router.replace).toHaveBeenCalledWith('/login');
    expect(mock.router.refresh).toHaveBeenCalledTimes(1);
  });

  it('places the designer profile link immediately before sign out and closes on selection', async () => {
    mock.session = { user: { name: 'Alice', email: null } };
    const user = userEvent.setup();
    render(<AccountMenu showLabel showProfileSettings />);
    await user.click(screen.getByRole('button', { name: /open account menu for alice/i }));

    const items = screen.getAllByRole('menuitem');
    const profile = screen.getByRole('menuitem', { name: 'Profile & settings' });
    expect(profile).toHaveAttribute('href', '/designer/profile');
    expect(profile.querySelector('svg')).toHaveClass('lucide-settings');
    expect(items).toEqual([profile, screen.getByRole('menuitem', { name: 'Sign out' })]);
    await user.click(profile);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(mock.signOut).not.toHaveBeenCalled();
  });

  it('does not expose designer settings in other account menus', async () => {
    mock.session = { user: { name: 'Alice', email: null } };
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole('button', { name: /open account menu for alice/i }));
    expect(screen.queryByRole('menuitem', { name: 'Profile & settings' })).not.toBeInTheDocument();
  });

  it.each([true, false])(
    'shows tab focus and supports keyboard navigation with showLabel=%s',
    async (showLabel) => {
      mock.session = { user: { name: 'Alice', email: null } };
      const user = userEvent.setup();
      render(<AccountMenu showProfileSettings showLabel={showLabel} />);
      const trigger = screen.getByRole('button', { name: /open account menu for alice/i });
      await user.tab();
      expect(trigger).toHaveFocus();
      expect(trigger).toHaveClass(
        'focus-visible:ring-2',
        'focus-visible:ring-ring',
        'focus-visible:ring-offset-2',
        'focus-visible:ring-offset-background',
      );
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('menuitem', { name: 'Profile & settings' })).toHaveFocus();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    },
  );

  it('still redirects to login even when signOut rejects', async () => {
    mock.session = { user: { name: 'Alice', email: null } };
    mock.signOut.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole('button', { name: /open account menu for alice/i }));
    await user.click(screen.getByText('Sign out'));
    expect(mock.router.replace).toHaveBeenCalledWith('/login');
    expect(mock.router.refresh).toHaveBeenCalledTimes(1);
  });
});
