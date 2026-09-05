import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DesignerOrganizationSwitcher } from '../../src/components/designer-organization-switcher';

const mock = vi.hoisted(() => ({
  organizations: [
    { id: 'org-1', name: 'Studio One', slug: 'studio-one', createdAt: new Date() },
    { id: 'org-2', name: 'Studio Two', slug: 'studio-two', createdAt: new Date() },
  ],
  isPending: false,
  error: null as Error | null,
  setActive: vi.fn(),
  router: { refresh: vi.fn(), push: vi.fn() },
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useListOrganizations: () => ({
      data: mock.organizations,
      isPending: mock.isPending,
      error: mock.error,
    }),
  },
}));

vi.mock('@/lib/api', () => ({
  api: { api: { orgs: { context: { $put: mock.setActive } } } },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mock.router,
}));

vi.mock('@/components/initials-avatar', () => ({
  InitialsAvatar: () => <div>Avatar</div>,
}));

describe('DesignerOrganizationSwitcher', () => {
  beforeEach(() => {
    mock.isPending = false;
    mock.error = null;
    mock.setActive.mockReset();
    mock.setActive.mockResolvedValue({ ok: true });
    mock.router.refresh.mockReset();
    mock.router.push.mockReset();
  });

  it('lists My Tickif before the memberships returned by the auth organization API', async () => {
    const user = userEvent.setup();
    render(
      <DesignerOrganizationSwitcher
        activeOrganizationId="org-1"
        studioName="Studio One"
        studioLocation="Mumbai"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch organization' }));

    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveTextContent('My Tickif');
    expect(screen.getByRole('menuitem', { name: /Studio One.*Current/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Studio Two/i })).toBeInTheDocument();
  });

  it('switches to My Tickif and opens the personal workspace', async () => {
    const user = userEvent.setup();
    render(
      <DesignerOrganizationSwitcher
        activeOrganizationId="org-1"
        studioName="Studio One"
        studioLocation="Mumbai"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch organization' }));
    await user.click(screen.getByRole('menuitem', { name: /My Tickif/i }));

    expect(mock.setActive).toHaveBeenCalledWith({ json: { kind: 'personal' } });
    expect(mock.router.push).toHaveBeenCalledWith('/home');
  });

  it('switches to another membership and refreshes server-rendered org data', async () => {
    const user = userEvent.setup();
    render(
      <DesignerOrganizationSwitcher
        activeOrganizationId="org-1"
        studioName="Studio One"
        studioLocation="Mumbai"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch organization' }));
    await user.click(screen.getByRole('menuitem', { name: /Studio Two/i }));

    expect(mock.setActive).toHaveBeenCalledWith({
      json: { kind: 'organization', organizationId: 'org-2' },
    });
    expect(mock.router.refresh).toHaveBeenCalledTimes(1);
  });

  it('shows a busy state and blocks repeated switches while the request is pending', async () => {
    let resolveSwitch: ((value: { ok: boolean }) => void) | undefined;
    mock.setActive.mockReturnValue(
      new Promise((resolve) => {
        resolveSwitch = resolve;
      }),
    );
    const user = userEvent.setup();

    render(
      <DesignerOrganizationSwitcher
        activeOrganizationId="org-1"
        studioName="Studio One"
        studioLocation="Mumbai"
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Switch organization' });
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: /Studio Two/i }));

    expect(trigger).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Switching…')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Studio One.*Current/i })).toHaveAttribute(
      'data-disabled',
    );
    expect(screen.getByRole('menuitem', { name: /Studio Two.*Switching/i })).toHaveAttribute(
      'data-disabled',
    );

    await act(async () => {
      resolveSwitch?.({ ok: true });
    });
    await waitFor(() => {
      expect(mock.router.refresh).toHaveBeenCalledTimes(1);
    });
  });

  it('delegates the workspace refresh after a successful switch', async () => {
    const onSwitchSuccess = vi.fn();
    const user = userEvent.setup();

    render(
      <DesignerOrganizationSwitcher
        activeOrganizationId="org-1"
        studioName="Studio One"
        studioLocation="Mumbai"
        onSwitchSuccess={onSwitchSuccess}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch organization' }));
    await user.click(screen.getByRole('menuitem', { name: /Studio Two/i }));

    expect(onSwitchSuccess).toHaveBeenCalledWith('org-2');
    expect(mock.router.refresh).not.toHaveBeenCalled();
  });

  it('keeps the switcher disabled while the refreshed workspace is loading', () => {
    render(
      <DesignerOrganizationSwitcher
        activeOrganizationId="org-1"
        studioName="Studio One"
        studioLocation="Mumbai"
        isWorkspaceRefreshing
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Switch organization' });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading Studio One workspace')).toBeInTheDocument();
  });

  it('does not refresh or hide an error when switching fails', async () => {
    mock.setActive.mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(
      <DesignerOrganizationSwitcher
        activeOrganizationId="org-1"
        studioName="Studio One"
        studioLocation="Mumbai"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch organization' }));
    await user.click(screen.getByRole('menuitem', { name: /Studio Two/i }));

    expect(mock.router.refresh).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not switch organization');
  });

  it('handles a rejected switch request without refreshing the workspace', async () => {
    mock.setActive.mockRejectedValue(new Error('Network unavailable'));
    const user = userEvent.setup();
    render(
      <DesignerOrganizationSwitcher
        activeOrganizationId="org-1"
        studioName="Studio One"
        studioLocation="Mumbai"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch organization' }));
    await user.click(screen.getByRole('menuitem', { name: /Studio Two/i }));

    expect(mock.router.refresh).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not switch organization');
  });

  it('opens the organisation creation flow from the switcher', async () => {
    const user = userEvent.setup();
    render(
      <DesignerOrganizationSwitcher
        activeOrganizationId="org-1"
        studioName="Studio One"
        studioLocation="Mumbai"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch organization' }));
    await user.click(screen.getByRole('menuitem', { name: /Create an organisation/i }));

    expect(mock.router.push).toHaveBeenCalledWith('/designer/new-organization');
  });

  it('offers creation instead of a dead end for users with zero orgs', async () => {
    const previous = mock.organizations;
    mock.organizations = [];
    try {
      const user = userEvent.setup();
      render(
        <DesignerOrganizationSwitcher
          activeOrganizationId={null}
          studioName="Asha Rao"
          studioLocation="Mumbai"
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Switch organization' }));
      expect(screen.queryByText(/No organization memberships found/i)).not.toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /Create an organisation/i })).toBeInTheDocument();
    } finally {
      mock.organizations = previous;
    }
  });
});
