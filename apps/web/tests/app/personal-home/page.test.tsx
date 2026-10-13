import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  requireActiveVisitor: vi.fn(),
  preferences: vi.fn(),
  taxonomyGet: vi.fn(),
  activity: vi.fn(),
  counts: vi.fn(),
  refresh: vi.fn(),
  savedGet: vi.fn(),
  following: vi.fn(async () => ({ items: [], total: 2, totalPages: 1, page: 1, limit: 20 })),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mock.redirect,
  useRouter: () => ({ refresh: mock.refresh, push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/home',
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u1' } } }),
    useListOrganizations: () => ({ data: [], isPending: false, error: null }),
  },
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      'saved-projects': { $get: mock.savedGet },
      following: { $get: async () => new Response(JSON.stringify(await mock.following())) },
      taxonomy: { terms: { $get: mock.taxonomyGet } },
      orgs: {
        context: { $put: vi.fn() },
        branches: { $get: vi.fn() },
      },
    },
  },
}));

vi.mock('@/lib/visitor-feed.server', () => ({ getVisitorFeedPreferences: mock.preferences }));
vi.mock('@/lib/following.server', () => ({ getFollowing: mock.following }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie: 'test-session' }) }));
vi.mock('@/lib/visitor-home-data.server', () => ({
  getVisitorHomeActivity: mock.activity,
  getVisitorEnquiryCounts: mock.counts,
}));
vi.mock('@/components/visitor-enquiry-count', () => ({
  VisitorEnquiryCountProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/visitor-following', () => ({
  VisitorFollowing: () => <section aria-label="Studios you follow" />,
}));
vi.mock('@/components/visitor-home-regions', () => ({
  VisitorActivityLinks: () => <span>Activity</span>,
  VisitorActivitySkeleton: () => <span>Loading activity</span>,
  VisitorEnquirySummary: () => <span>Latest enquiry</span>,
  VisitorSavedSuggestions: () => <span>Suggestions</span>,
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
  ProjectFeed: ({ infinite }: { infinite?: boolean }) => (
    <div data-testid="project-feed" data-infinite={String(infinite)}>
      feed
    </div>
  ),
}));

vi.mock('@/components/public-header', () => ({
  PublicHeader: ({
    userRole,
    contextSwitcher,
  }: {
    userRole?: string | null;
    contextSwitcher?: React.ReactNode;
  }) => (
    <div data-testid="public-header" data-user-role={userRole ?? ''}>
      header
      {contextSwitcher}
    </div>
  ),
}));

import PersonalHomePage from '../../../app/(protected)/home/page';

describe('PersonalHomePage', () => {
  it('renders the real Following count and selects the following view', async () => {
    render(
      await PersonalHomePage({
        searchParams: Promise.resolve({ feed: 'custom', view: 'following' }),
      }),
    );
    expect(screen.getByRole('link', { name: 'Following 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: 'For you' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
  it('shows the real nearby locality as compact metadata instead of an extra icon', async () => {
    mock.preferences.mockResolvedValue({
      preferences: { homeType: '3-bhk', citySlug: 'chennai', localitySlug: 'adyar' },
      filters: { bhkSlug: '3-bhk', citySlug: 'chennai', localitySlug: 'adyar' },
    });
    mock.taxonomyGet.mockImplementation(({ query }: { query: { kind: string } }) =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          terms:
            query.kind === 'locality'
              ? [
                  {
                    id: '11111111-1111-4111-8111-111111111111',
                    slug: 'adyar',
                    label: 'Adyar',
                    parentId: null,
                  },
                ]
              : [],
        }),
      }),
    );
    render(
      await PersonalHomePage({ searchParams: Promise.resolve({ feed: 'custom', view: 'nearby' }) }),
    );
    const nearby = screen.getByRole('link', { name: 'Near you' });
    expect(nearby).toHaveTextContent('Near youAdyar');
    expect(nearby).toHaveAttribute('aria-current', 'page');
    expect(nearby).toHaveClass('h-9.5', 'px-3.5');
    expect(nearby.querySelector('svg')).toBeNull();
    expect(screen.getByText('Adyar')).toHaveClass('max-w-20', 'truncate');
    expect(screen.getByText('Adyar')).toHaveAttribute('title', 'Adyar');
  });
  it('does not refresh the route when a project is saved or removed', async () => {
    render(await PersonalHomePage());
    for (const saved of [true, false]) {
      act(() =>
        window.dispatchEvent(
          new CustomEvent('tickif:project-saved', {
            detail: {
              userId: 'u1',
              project: { projectId: '11111111-1111-4111-8111-111111111111', saved },
            },
          }),
        ),
      );
    }
    expect(mock.refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId('project-feed')).toBeInTheDocument();
  });
  it('refreshes newly added locations and changed seeded catalogs in personalized filters', async () => {
    await PersonalHomePage();
    for (const kind of [
      'city',
      'locality',
      'room',
      'material',
      'property_subtype',
      'budget_band',
    ]) {
      expect(mock.taxonomyGet).toHaveBeenCalledWith(
        { query: { kind } },
        { init: { cache: 'no-store' } },
      );
    }
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mock.savedGet.mockImplementation(async () =>
      Response.json({ projects: [], page: 1, limit: 1, total: 1, totalPages: 1 }),
    );
    mock.taxonomyGet.mockResolvedValue({ ok: true, json: async () => ({ terms: [] }) });
    mock.preferences.mockResolvedValue({ preferences: null, filters: {} });
    mock.activity.mockResolvedValue({ saved: null, enquiries: null });
    mock.counts.mockResolvedValue({ total: 0, unread: 0 });
    mock.requireActiveVisitor.mockResolvedValue({
      user: { id: 'u1', name: 'Asha Rao', email: 'a@x.com', role: 'visitor', status: 'active' },
      session: { activeOrganizationId: null, activeTeamId: null },
    });
  });

  it('renders the visitor workspace without organization controls', async () => {
    render(await PersonalHomePage());

    expect(
      screen.getByRole('heading', { name: /Good (morning|afternoon|evening), Asha/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit customization' })).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
    expect(screen.queryByRole('link', { name: 'Edit customization' })).toBeNull();
    expect(screen.getByTestId('project-feed')).toBeInTheDocument();
    expect(screen.getByTestId('project-feed')).toHaveAttribute('data-infinite', 'true');
    expect(screen.getByTestId('public-header')).toHaveAttribute('data-user-role', 'visitor');
    expect(screen.queryByRole('button', { name: 'Switch context' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Analytics/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Team & Roles/i)).not.toBeInTheDocument();
    expect(screen.getByText(/© \d{4} Tickif/)).toBeInTheDocument();
  });

  it('honors the visitor guard before rendering the personal workspace', async () => {
    mock.requireActiveVisitor.mockRejectedValue(new Error('NEXT_REDIRECT:/designer/dashboard'));
    await expect(PersonalHomePage()).rejects.toThrow('NEXT_REDIRECT:/designer/dashboard');
  });
  it('uses saved filters only when opening the default personal feed', async () => {
    mock.preferences.mockResolvedValue({
      filters: { bhkSlug: ['4-bhk', '4-plus-bhk'], citySlug: 'chennai', localitySlug: 'adyar' },
    });
    await expect(PersonalHomePage()).rejects.toThrow(
      'NEXT_REDIRECT:/home?feed=custom&bhk=4-bhk%2C4-plus-bhk&city=chennai&locality=adyar',
    );
    mock.preferences.mockClear();
    render(await PersonalHomePage({ searchParams: Promise.resolve({ feed: 'custom' }) }));
    expect(mock.preferences).toHaveBeenCalledOnce();
    expect(screen.queryByText('Tuned for')).toBeNull();
  });
  it('does not expose phone-placeholder names in the greeting', async () => {
    mock.requireActiveVisitor.mockResolvedValue({
      user: { id: 'u1', name: '+919800000010', phoneNumber: '+919800000010', role: 'visitor' },
    });
    render(await PersonalHomePage());
    expect(screen.queryByText(/9800000010/)).toBeNull();
  });
  it('keeps the page useful and retryable when preferences are unavailable', async () => {
    mock.preferences.mockRejectedValue(new Error('Unavailable'));
    render(await PersonalHomePage());
    expect(screen.getByText('Customization unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByTestId('project-feed')).toBeInTheDocument();
  });
});
