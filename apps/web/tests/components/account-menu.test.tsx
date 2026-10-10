import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountMenu } from '../../src/components/account-menu';

const mock = vi.hoisted(() => ({
  signOut: vi.fn(),
  revokeOtherSessions: vi.fn(),
  activity: vi.fn(),
  address: vi.fn(),
  session: null as {
    user: {
      name: string | null;
      email: string | null;
      phoneNumber?: string | null;
      role?: string;
      status?: string;
    };
    session?: { activeOrganizationId?: string | null };
  } | null,
  isPending: false,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: mock.session, isPending: mock.isPending }),
    signOut: mock.signOut,
    revokeOtherSessions: mock.revokeOtherSessions,
  },
}));
vi.mock('@/lib/account-menu-data', () => ({
  fetchAccountActivity: mock.activity,
  fetchAccountAddress: mock.address,
  maskedAccountPhone: () => null,
}));

describe('AccountMenu', () => {
  it.each(['+919876543210', '  +91 (98765) 43210  '])(
    'uses the safe account label instead of a phone-auth placeholder name: %s',
    async (name) => {
      mock.session = {
        user: {
          name,
          email: '+919876543210@phone.tickif.local',
          phoneNumber: '+919876543210',
          role: 'visitor',
          status: 'pending',
        },
        session: { activeOrganizationId: null },
      };
      const user = userEvent.setup();
      render(<AccountMenu showLabel />);
      await user.click(screen.getByRole('button', { name: 'Open account menu for Account' }));
      expect(screen.getByRole('menu')).toHaveTextContent('Account');
      expect(screen.getByRole('menu')).not.toHaveTextContent(name.trim());
      expect(screen.getByRole('menuitem', { name: 'Complete setup' })).toBeVisible();
    },
  );

  it('offers personal settings to a visitor in personal context', async () => {
    mock.session = {
      user: { name: 'Alice', email: null, role: 'visitor', status: 'active' },
      session: { activeOrganizationId: null },
    };
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole('button', { name: /open account menu/i }));
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/home/settings',
    );
    expect(screen.queryByRole('menuitem', { name: 'My consultations' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'My home profile' })).toHaveAttribute(
      'href',
      '/home/settings#personal-details',
    );
    expect(screen.getByRole('menuitem', { name: 'Saved projects' })).toHaveAttribute(
      'href',
      '/saved-projects',
    );
    expect(screen.getByRole('menuitem', { name: 'Enquiries' })).toHaveAttribute(
      'href',
      '/enquiries',
    );
    expect(screen.queryByRole('menuitem', { name: 'Boards' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Following' })).not.toBeInTheDocument();
  });

  it('loads real details only while open and aborts work when dismissed', async () => {
    mock.session = {
      user: { name: 'Alice', email: null, role: 'visitor', status: 'active' },
      session: { activeOrganizationId: null },
    };
    const user = userEvent.setup();
    render(<AccountMenu />);
    expect(mock.activity).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /open account menu/i }));
    expect(await screen.findByText('24')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Chennai')).toBeInTheDocument();
    const signal = mock.activity.mock.calls[0]![0] as AbortSignal;
    await user.keyboard('{Escape}');
    expect(signal.aborted).toBe(true);
  });

  it('renders unavailable counts honestly and supports retry without closing the menu', async () => {
    mock.session = {
      user: { name: 'Alice', email: null, role: 'visitor', status: 'active' },
      session: { activeOrganizationId: null },
    };
    mock.activity.mockResolvedValueOnce({ saved: 2, enquiries: null });
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole('button', { name: /open account menu/i }));
    expect(await screen.findByLabelText('enquiries count unavailable')).toHaveTextContent('N/A');
    expect(screen.getByText('2')).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Some details could not load. Retry' }));
    expect(await screen.findByText('24')).toBeInTheDocument();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it.each(['admin', 'superadmin', 'pending', 'banned'])(
    'does not fetch customer information for %s accounts',
    async (context) => {
      mock.session = {
        user: {
          name: 'Alice',
          email: null,
          role: context === 'pending' || context === 'banned' ? 'visitor' : context,
          status: context === 'pending' || context === 'banned' ? context : 'active',
        },
        session: { activeOrganizationId: null },
      };
      const user = userEvent.setup();
      render(<AccountMenu />);
      await user.click(screen.getByRole('button', { name: /open account menu/i }));
      expect(mock.activity).not.toHaveBeenCalled();
      expect(mock.address).not.toHaveBeenCalled();
      expect(screen.queryByRole('menuitem', { name: 'Saved projects' })).not.toBeInTheDocument();
    },
  );

  it('does not expose visitor-only pages to a designer in personal context', async () => {
    mock.session = {
      user: { name: 'Alice', email: null, role: 'designer', status: 'active' },
      session: { activeOrganizationId: null },
    };
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole('button', { name: /open account menu/i }));
    expect(screen.queryByRole('menuitem', { name: 'Personal settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'My consultations' })).not.toBeInTheDocument();
  });

  it('keeps organization settings separate from personal settings', async () => {
    mock.session = {
      user: { name: 'Alice', email: null, role: 'designer', status: 'active' },
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

  it('resumes designer onboarding for a pending (deferred designer) account', async () => {
    // E-298: a deferred designer signup is role=visitor + status=pending until a
    // studio is created. "Complete setup" must resume the designer onboarding flow
    // (matching public-header's List-your-work rule), not the visitor form.
    mock.session = {
      user: { name: 'Alice', email: null, role: 'visitor', status: 'pending' },
      session: { activeOrganizationId: null },
    };
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole('button', { name: /open account menu/i }));

    expect(screen.queryByRole('menuitem', { name: 'Personal settings' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Complete setup' })).toHaveAttribute(
      'href',
      '/designer/onboarding',
    );
  });
  beforeEach(() => {
    mock.session = null;
    mock.isPending = false;
    mock.signOut.mockReset();
    mock.signOut.mockResolvedValue({ error: null });
    mock.revokeOtherSessions.mockReset().mockResolvedValue({ error: null });
    mock.activity.mockReset().mockResolvedValue({ saved: 24, enquiries: 3 });
    mock.address.mockReset().mockResolvedValue('Chennai');
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    mock.session = {
      user: { name: 'Alice', email: 'alice@test.com' },
      session: { activeOrganizationId: null },
    };
    render(<AccountMenu />);
    expect(
      screen.getByRole('button', { name: /open account menu for alice/i }),
    ).toBeInTheDocument();
  });

  it('keeps the labelled workspace trigger accessible when its label collapses on mobile', () => {
    mock.session = {
      user: { name: 'Alice Example', email: 'alice@test.com' },
      session: { activeOrganizationId: null },
    };
    render(<AccountMenu showLabel />);

    const trigger = screen.getByRole('button', { name: /open account menu for alice example/i });
    expect(trigger).toBeInTheDocument();
    expect(screen.getByText('Alice')).toHaveClass('hidden', 'sm:inline');
  });

  it('does not expose a generated phone-auth identity in the labelled designer account menu', async () => {
    mock.session = {
      user: {
        name: '',
        email: '919876543210@phone.tickif.local',
        role: 'designer',
        status: 'active',
      },
      session: { activeOrganizationId: 'org' },
    };
    const user = userEvent.setup();
    render(<AccountMenu showLabel showProfileSettings />);

    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.queryByText('919876543210@phone.tickif.local')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open account menu/i }));
    expect(screen.queryByText('919876543210@phone.tickif.local')).not.toBeInTheDocument();
  });

  it('requires confirmation and logs out only the current device by default', async () => {
    const navigate = vi.spyOn(window.location, 'replace').mockImplementation(() => undefined);
    mock.session = {
      user: { name: 'Alice', email: null },
      session: { activeOrganizationId: null },
    };
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole('button', { name: /open account menu for alice/i }));
    const signOut = screen.getByRole('menuitem', { name: 'Log out' });
    expect(signOut.querySelector('img')).toHaveAttribute('src', '/ui/account/logout.svg');
    await user.click(signOut);
    expect(mock.signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Log out of this device?' })).toBeInTheDocument();
    expect(screen.getByRole('menu', { hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('menu', { hidden: true })).toHaveAttribute('inert');
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(mock.signOut).toHaveBeenCalledTimes(1);
    expect(mock.revokeOtherSessions).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('keeps the designer profile link in settings and closes on selection', async () => {
    mock.session = {
      user: { name: 'Alice', email: null, role: 'designer', status: 'active' },
      session: { activeOrganizationId: 'org' },
    };
    const user = userEvent.setup();
    render(<AccountMenu showLabel showProfileSettings />);
    await user.click(screen.getByRole('button', { name: /open account menu for alice/i }));

    const items = screen.getAllByRole('menuitem');
    const profile = screen.getByRole('menuitem', { name: 'Profile & settings' });
    expect(profile).toHaveAttribute('href', '/designer/profile');
    expect(profile.querySelector('img')).toHaveAttribute('src', '/ui/account/settings.svg');
    expect(items.map((item) => item.textContent)).toEqual([
      'Saved projects',
      'Enquiries',
      'Profile & settings',
      'Help & report',
      'Log out',
    ]);
    await user.click(profile);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(mock.signOut).not.toHaveBeenCalled();
  });

  it('does not expose designer settings in other account menus', async () => {
    mock.session = {
      user: { name: 'Alice', email: null },
      session: { activeOrganizationId: null },
    };
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole('button', { name: /open account menu for alice/i }));
    expect(screen.queryByRole('menuitem', { name: 'Profile & settings' })).not.toBeInTheDocument();
  });

  it.each([true, false])(
    'shows tab focus and supports keyboard navigation with showLabel=%s',
    async (showLabel) => {
      mock.session = {
        user: { name: 'Alice', email: null, role: 'designer', status: 'active' },
        session: { activeOrganizationId: 'org' },
      };
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
      expect(screen.getByRole('menuitem', { name: 'Saved projects' })).toHaveFocus();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    },
  );

  it('keeps logout failures retryable without falsely redirecting', async () => {
    const navigate = vi.spyOn(window.location, 'replace').mockImplementation(() => undefined);
    mock.session = {
      user: { name: 'Alice', email: null },
      session: { activeOrganizationId: null },
    };
    mock.signOut.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole('button', { name: /open account menu for alice/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not log out. Please try again.');
    expect(navigate).not.toHaveBeenCalled();
    mock.signOut.mockResolvedValue({ error: null });
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
  });

  it('never renders a blank account label when the user name is missing', async () => {
    mock.session = {
      user: { name: null, email: null, role: 'designer' },
      session: { activeOrganizationId: null },
    };
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole('button', { name: /open account menu for account/i }));
    const label = screen.getByText('Account');
    expect(label.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('hides generated phone identities instead of presenting them as email', async () => {
    mock.session = {
      user: { name: null, email: '+91981000001@phone.tickif.local', role: 'designer' },
      session: { activeOrganizationId: null },
    };
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole('button', { name: /open account menu/i }));
    expect(screen.queryByText(/@phone\.tickif\.local/i)).not.toBeInTheDocument();
  });

  it('uses a safe label and hides email when the account has no name', async () => {
    mock.session = {
      user: { name: null, email: 'mahi@test.com', role: 'designer' },
      session: { activeOrganizationId: null },
    };
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole('button', { name: /open account menu/i }));
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.queryByText('mahi@test.com')).not.toBeInTheDocument();
  });

  it.each(['visitor', 'designer', 'admin', 'superadmin'])(
    'hides email from the %s account dropdown',
    async (role) => {
      mock.session = {
        user: { name: 'Account User', email: 'account@test.com', role },
        session: { activeOrganizationId: null },
      };
      const user = userEvent.setup();
      render(<AccountMenu showLabel />);
      await user.click(screen.getByRole('button', { name: /open account menu for account user/i }));

      expect(screen.getByText('Account User')).toBeInTheDocument();
      expect(screen.queryByText('account@test.com')).not.toBeInTheDocument();
    },
  );
});
