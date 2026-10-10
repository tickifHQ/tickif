import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SavedProjectsPage from '../../../app/(protected)/saved-projects/page';
import SavedProjectsError from '../../../app/(protected)/saved-projects/error';

const mock = vi.hoisted(() => ({
  auth: vi.fn(),
  list: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
vi.mock('@/lib/auth-guard', () => ({ requireAuth: mock.auth }));
vi.mock('@/lib/api', () => ({ api: { api: { 'saved-projects': { $get: mock.list } } } }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie: 'test-session' }) }));
vi.mock('next/navigation', () => ({ redirect: mock.redirect }));
vi.mock('@/components/public-header', () => ({ PublicHeader: () => <header>Header</header> }));
vi.mock('@/components/public-footer', () => ({ PublicFooter: () => <footer>Footer</footer> }));
vi.mock('@/components/list-pagination', () => ({ UrlListPagination: () => <nav>Pagination</nav> }));
vi.mock('@/components/showcase-card', () => ({ ShowcaseCard: () => <article /> }));
vi.mock('@/components/saved-projects-sync', () => ({
  SavedProjectsSync: ({ userId }: { userId: string }) => (
    <span data-testid="saved-sync">{userId}</span>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mock.auth.mockResolvedValue({ user: { id: 'visitor-1', role: 'visitor' } });
  mock.list.mockResolvedValue(
    Response.json({ projects: [], page: 1, limit: 12, total: 0, totalPages: 0 }),
  );
});
const page = (query: { page?: string; limit?: string } = {}) =>
  SavedProjectsPage({ searchParams: Promise.resolve(query) });

describe('SavedProjectsPage', () => {
  it('offers a working load retry without claiming a successful unsave was rolled back', () => {
    const reset = vi.fn();
    render(<SavedProjectsError reset={reset} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please try loading your saved projects again.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('renders an honest empty state with an existing explore action', async () => {
    render(await page());
    expect(screen.getByRole('heading', { name: 'No saved projects to show' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explore projects' })).toHaveAttribute('href', '/');
    expect(screen.getByTestId('saved-sync')).toHaveTextContent('visitor-1');
    expect(mock.list).toHaveBeenCalledWith(
      { query: { page: 1, limit: 12 } },
      { headers: { cookie: 'test-session' }, init: { cache: 'no-store' } },
    );
  });
  it('rejects noncustomer roles before reading saved data', async () => {
    mock.auth.mockResolvedValue({ user: { role: 'admin' } });
    await expect(page()).rejects.toThrow('NEXT_REDIRECT:/unauthorized');
    expect(mock.list).not.toHaveBeenCalled();
  });
  it('normalizes invalid and out-of-range queries without creating an empty phantom page', async () => {
    await expect(page({ limit: '49' })).rejects.toThrow('NEXT_REDIRECT:/saved-projects');
    mock.list.mockResolvedValue(
      Response.json({ projects: [], page: 3, limit: 12, total: 0, totalPages: 0 }),
    );
    await expect(page({ page: '3' })).rejects.toThrow(
      'NEXT_REDIRECT:/saved-projects?page=1&limit=12',
    );
  });
  it.each([401, 403])('handles expired or forbidden sessions: %s', async (status) => {
    mock.list.mockResolvedValue(new Response('', { status }));
    await expect(page()).rejects.toThrow(
      status === 401
        ? 'NEXT_REDIRECT:/login?callbackURL=%2Fsaved-projects'
        : 'NEXT_REDIRECT:/unauthorized',
    );
  });
  it.each(['http', 'shape'])(
    'uses the retryable error boundary instead of misleading empty results: %s',
    async (failure) => {
      mock.list.mockResolvedValue(
        failure === 'http' ? new Response('', { status: 503 }) : Response.json({ projects: [] }),
      );
      await expect(page()).rejects.toThrow('Could not load saved projects.');
    },
  );
});
