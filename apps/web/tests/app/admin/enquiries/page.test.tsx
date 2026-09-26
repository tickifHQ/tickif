import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchEnquiries: vi.fn(),
  headers: vi.fn(),
  requireAuth: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/lib/auth-guard', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/admin-enquiries-api', () => {
  class AdminEnquiriesApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  return { AdminEnquiriesApiError, fetchAdminEnquiries: mocks.fetchEnquiries };
});
vi.mock('@/components/admin-enquiries-list', () => ({
  AdminEnquiriesList: ({ result, query, error }: Record<string, unknown>) => (
    <div>
      <p data-testid="result">{JSON.stringify(result)}</p>
      <p data-testid="query">{JSON.stringify(query)}</p>
      {error ? <p role="alert">{String(error)}</p> : null}
    </div>
  ),
}));

const emptyResult = {
  items: [],
  counts: { all: 0, open: 0, responded: 0, closed: 0 },
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0,
};

describe('AdminEnquiriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    mocks.headers.mockResolvedValue(new Headers({ cookie: 'session=valid' }));
    mocks.fetchEnquiries.mockResolvedValue(emptyResult);
  });

  it('guards the page and server-loads the default all-status URL', async () => {
    const { default: Page } = await import('../../../../app/(admin)/admin/enquiries/page');
    render(await Page());

    expect(mocks.requireAuth).toHaveBeenCalledWith({ requiredRole: 'admin' });
    expect(mocks.fetchEnquiries).toHaveBeenCalledWith(
      { page: 1, limit: 25 },
      { headers: { cookie: 'session=valid' } },
    );
    expect(screen.getByTestId('query')).toHaveTextContent('{"page":1,"limit":25}');
  });

  it('restores status, page, and page size from the URL', async () => {
    mocks.fetchEnquiries.mockResolvedValue({
      ...emptyResult,
      page: 2,
      limit: 50,
      total: 51,
      totalPages: 2,
    });
    const { default: Page } = await import('../../../../app/(admin)/admin/enquiries/page');
    await Page({
      searchParams: Promise.resolve({ status: 'responded', page: '2', limit: '50' }),
    });

    expect(mocks.fetchEnquiries).toHaveBeenCalledWith(
      { status: 'responded', page: 2, limit: 50 },
      { headers: { cookie: 'session=valid' } },
    );
  });

  it('normalizes malformed input and a page beyond the last result', async () => {
    const { default: Page } = await import('../../../../app/(admin)/admin/enquiries/page');
    await Page({
      searchParams: Promise.resolve({ status: 'unknown', page: '-2', limit: '500' }),
    });
    expect(mocks.redirect).toHaveBeenCalledWith('/admin/enquiries?page=1&limit=25');

    mocks.redirect.mockClear();
    mocks.fetchEnquiries.mockResolvedValue({
      ...emptyResult,
      page: 9,
      total: 26,
      totalPages: 2,
    });
    await Page({
      searchParams: Promise.resolve({ status: 'closed', page: '9', limit: '25' }),
    });
    expect(mocks.redirect).toHaveBeenCalledWith('/admin/enquiries?page=2&limit=25&status=closed');
  });

  it('renders retryable session, forbidden, and generic fetch errors instead of empty states', async () => {
    const { default: Page } = await import('../../../../app/(admin)/admin/enquiries/page');
    mocks.headers.mockResolvedValue(new Headers());
    render(await Page());
    expect(screen.getByRole('alert')).toHaveTextContent('session could not be found');
    expect(mocks.fetchEnquiries).not.toHaveBeenCalled();

    const { AdminEnquiriesApiError } = await import('@/lib/admin-enquiries-api');
    mocks.headers.mockResolvedValue(new Headers({ cookie: 'session=valid' }));
    mocks.fetchEnquiries.mockRejectedValue(new AdminEnquiriesApiError('Forbidden', 403));
    render(await Page());
    expect(screen.getAllByRole('alert').at(-1)).toHaveTextContent('does not have permission');

    mocks.fetchEnquiries.mockRejectedValue(new Error('private infrastructure detail'));
    render(await Page());
    expect(screen.getAllByRole('alert').at(-1)).toHaveTextContent('Refresh the page');
    expect(screen.queryByText('private infrastructure detail')).not.toBeInTheDocument();
  });
});
