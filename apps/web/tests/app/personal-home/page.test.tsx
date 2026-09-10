import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mock.redirect,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/home',
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useListOrganizations: () => ({ data: [], isPending: false, error: null }),
  },
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      orgs: {
        context: { $put: vi.fn() },
        branches: { $get: vi.fn() },
      },
    },
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  getServerSession: mock.getServerSession,
}));

vi.mock('@/lib/home-feed', () => ({
  emptyHomeFeedPage: (page: number) => ({
    items: [],
    page,
    hasMore: false,
    facetDistribution: {},
    fallback: 'none',
    relaxedFilters: [],
  }),
  fetchHomeFeedPage: () =>
    Promise.resolve({
      items: [],
      page: 1,
      hasMore: false,
      facetDistribution: {},
      fallback: 'none',
      relaxedFilters: [],
    }),
}));

vi.mock('@/components/project-feed', () => ({
  ProjectFeed: () => <div data-testid="project-feed">feed</div>,
}));

vi.mock('@/components/public-header', () => ({
  PublicHeader: ({
    showListYourWork,
    contextSwitcher,
  }: {
    showListYourWork?: boolean;
    contextSwitcher?: React.ReactNode;
  }) => (
    <div data-testid="public-header" data-show-list-your-work={String(showListYourWork ?? true)}>
      header
      {contextSwitcher}
    </div>
  ),
}));

import PersonalHomePage from '../../../app/(protected)/home/page';

describe('PersonalHomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.getServerSession.mockResolvedValue({
      user: { id: 'u1', name: 'Asha Rao', email: 'a@x.com', role: 'visitor' },
      session: { activeOrganizationId: null, activeTeamId: null },
    });
  });

  it('renders the visitor workspace without organization controls or List your work', async () => {
    render(await PersonalHomePage());

    expect(screen.getByRole('heading', { name: /Welcome back, Asha/i })).toBeInTheDocument();
    expect(screen.getAllByText('My Tickif')).not.toHaveLength(0);
    expect(screen.getByTestId('project-feed')).toBeInTheDocument();
    expect(screen.getByTestId('public-header')).toHaveAttribute(
      'data-show-list-your-work',
      'false',
    );
    expect(screen.queryByRole('button', { name: 'Switch context' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Analytics/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Team & Roles/i)).not.toBeInTheDocument();
    expect(screen.getByText(/© \d{4} Tickif/)).toBeInTheDocument();
  });

  it('redirects designers with an active studio to the designer dashboard', async () => {
    mock.getServerSession.mockResolvedValue({
      user: { id: 'u1', name: 'Asha Rao', email: 'a@x.com', role: 'designer' },
      session: { activeOrganizationId: 'org-1', activeTeamId: 'team-1' },
    });

    await expect(PersonalHomePage()).rejects.toThrow('NEXT_REDIRECT:/designer/dashboard');
  });

  it('keeps designers without an active studio on personal home', async () => {
    mock.getServerSession.mockResolvedValue({
      user: { id: 'u1', name: 'Asha Rao', email: 'a@x.com', role: 'designer' },
      session: { activeOrganizationId: null, activeTeamId: null },
    });

    render(await PersonalHomePage());

    expect(screen.getByRole('heading', { name: /Welcome back, Asha/i })).toBeInTheDocument();
  });

  it('keeps the studio picker for designers restored into personal context', async () => {
    mock.getServerSession.mockResolvedValue({
      user: { id: 'u1', name: 'Asha Rao', email: 'a@x.com', role: 'designer' },
      session: { activeOrganizationId: null, activeTeamId: null },
    });

    render(await PersonalHomePage());

    expect(screen.getByRole('button', { name: 'Switch context' })).toBeInTheDocument();
  });

  it.each(['admin', 'superadmin'])('redirects %s users to the admin dashboard', async (role) => {
    mock.getServerSession.mockResolvedValue({
      user: { id: 'u1', name: 'Asha Rao', email: 'a@x.com', role },
      session: { activeOrganizationId: null, activeTeamId: null },
    });

    await expect(PersonalHomePage()).rejects.toThrow('NEXT_REDIRECT:/dashboard');
  });

  it('fails closed when the session has an invalid role', async () => {
    mock.getServerSession.mockResolvedValue({
      user: { id: 'u1', name: 'Asha Rao', email: 'a@x.com', role: 'unknown' },
      session: { activeOrganizationId: null, activeTeamId: null },
    });

    await expect(PersonalHomePage()).rejects.toThrow('NEXT_REDIRECT:/unauthorized');
  });
});
