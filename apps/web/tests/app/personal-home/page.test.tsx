import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
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
  getServerSession: () =>
    Promise.resolve({ user: { id: 'u1', name: 'Asha Rao', email: 'a@x.com', role: 'designer' } }),
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
  PublicHeader: () => <div data-testid="public-header">header</div>,
}));

import PersonalHomePage from '../../../app/(protected)/home/page';

describe('PersonalHomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a personal workspace with discovery and enquiries and no org nav', async () => {
    render(await PersonalHomePage());

    expect(screen.getByRole('heading', { name: /Welcome back, Asha/i })).toBeInTheDocument();
    expect(screen.getByText('My Tickif')).toBeInTheDocument();
    expect(screen.getByTestId('project-feed')).toBeInTheDocument();
    expect(screen.getByTestId('public-header')).toBeInTheDocument();
    expect(screen.queryByText(/Analytics/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Team & Roles/i)).not.toBeInTheDocument();
  });
});
