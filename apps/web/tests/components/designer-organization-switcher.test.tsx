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
  router: { refresh: vi.fn() },
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
  });

  it('lists only the memberships returned by the auth organization API', async () => {
    const user = userEvent.setup();
    render(
      <DesignerOrganizationSwitcher
        activeOrganizationId="org-1"
        studioName="Studio One"
        studioLocation="Mumbai"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch organization' }));

    expect(screen.getByRole('menuitem', { name: /Studio One.*Current/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Studio Two/i })).toBeInTheDocument();
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
});
