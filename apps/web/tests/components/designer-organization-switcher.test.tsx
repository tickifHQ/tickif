import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    organization: { setActive: mock.setActive },
  },
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
    mock.setActive.mockResolvedValue({ data: mock.organizations[1], error: null });
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

    expect(mock.setActive).toHaveBeenCalledWith({ organizationId: 'org-2' });
    expect(mock.router.refresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh or hide an error when switching fails', async () => {
    mock.setActive.mockResolvedValue({ data: null, error: { message: 'Not a member' } });
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
