import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  requireActiveVisitor: vi.fn(),
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

vi.mock('@/lib/auth-guard', () => ({ requireActiveVisitor: mock.requireActiveVisitor }));

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
    mock.requireActiveVisitor.mockResolvedValue({
      user: { id: 'u1', name: 'Asha Rao', email: 'a@x.com', role: 'visitor', status: 'active' },
      session: { activeOrganizationId: null, activeTeamId: null },
    });
  });

  it('renders the visitor workspace with List your work and without organization controls', async () => {
    render(await PersonalHomePage());

    expect(screen.getByRole('heading', { name: /Welcome back, Asha/i })).toBeInTheDocument();
    expect(screen.getAllByText('My Tickif')).not.toHaveLength(0);
    expect(screen.getByTestId('project-feed')).toBeInTheDocument();
    expect(screen.getByTestId('public-header')).toHaveAttribute('data-show-list-your-work', 'true');
    expect(screen.queryByRole('button', { name: 'Switch context' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Analytics/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Team & Roles/i)).not.toBeInTheDocument();
    expect(screen.getByText(/© \d{4} Tickif/)).toBeInTheDocument();
  });

  it('honors the visitor guard before rendering the personal workspace', async () => {
    mock.requireActiveVisitor.mockRejectedValue(new Error('NEXT_REDIRECT:/designer/dashboard'));
    await expect(PersonalHomePage()).rejects.toThrow('NEXT_REDIRECT:/designer/dashboard');
  });
});
