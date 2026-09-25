import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminEnquiriesResponse } from '@repo/contracts';
import { AdminEnquiriesList } from '../../src/components/admin-enquiries-list';

const mocks = vi.hoisted(() => ({ pagination: vi.fn() }));

vi.mock('@/components/list-pagination', () => ({
  UrlListPagination: (props: Record<string, unknown>) => {
    mocks.pagination(props);
    return <div data-testid="pagination">Pagination</div>;
  },
}));

vi.mock('@/components/admin-enquiries-load-error', () => ({
  AdminEnquiriesLoadError: ({ message }: { message: string }) => <div role="alert">{message}</div>,
}));

const result: AdminEnquiriesResponse = {
  items: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      requester: { id: 'visitor-1', name: 'Asha Rao', email: 'asha@example.com' },
      designer: {
        id: '22222222-2222-4222-8222-222222222222',
        displayName: 'North Star Studio',
      },
      organizationId: 'private-org-id',
      referredProject: {
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Sunlit Courtyard Home',
      },
      subject: 'Living room renovation',
      budget: '₹10L–₹20L',
      timeline: 'Within 3 months',
      status: 'open',
      createdAt: '2026-09-20T10:00:00.000Z',
      updatedAt: '2026-09-21T11:00:00.000Z',
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      requester: { id: 'visitor-2', name: 'Rohan Das', email: 'rohan@example.com' },
      designer: {
        id: '55555555-5555-4555-8555-555555555555',
        displayName: 'Quiet Form',
      },
      organizationId: 'another-private-org-id',
      referredProject: null,
      subject: 'General consultation',
      budget: 'Not decided',
      timeline: null,
      status: 'responded',
      createdAt: '2026-09-18T08:00:00.000Z',
      updatedAt: '2026-09-19T09:30:00.000Z',
    },
  ],
  page: 2,
  limit: 25,
  total: 27,
  totalPages: 2,
};

describe('AdminEnquiriesList', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the complete read-only enquiry record and honest nullable fallbacks', () => {
    render(<AdminEnquiriesList result={result} query={{ page: 2, limit: 25 }} />);

    expect(screen.getByRole('heading', { name: 'Enquiries' })).toBeInTheDocument();
    expect(screen.getByText('Living room renovation')).toBeInTheDocument();
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'asha@example.com' })).toHaveAttribute(
      'href',
      'mailto:asha@example.com',
    );
    expect(screen.getByText('North Star Studio')).toBeInTheDocument();
    expect(screen.getByText('Sunlit Courtyard Home')).toBeInTheDocument();
    expect(screen.getByText('₹10L–₹20L')).toBeInTheDocument();
    expect(screen.getByText('Within 3 months')).toBeInTheDocument();
    expect(screen.getByText('No referred project')).toBeInTheDocument();
    expect(screen.getByText('Not specified')).toBeInTheDocument();
    expect(screen.getAllByText(/Created:/)).toHaveLength(2);
    expect(screen.getAllByText(/Updated:/)).toHaveLength(2);
    expect(screen.queryByText('private-org-id')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(mocks.pagination).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 25, total: 27, totalPages: 2 }),
    );
  });

  it('keeps every status filter reloadable and resets pagination', () => {
    render(
      <AdminEnquiriesList result={result} query={{ status: 'responded', page: 2, limit: 50 }} />,
    );

    const filters = screen.getByRole('navigation', { name: 'Filter enquiries by status' });
    expect(within(filters).getByRole('link', { name: 'All' })).toHaveAttribute(
      'href',
      '/admin/enquiries?page=1&limit=50',
    );
    expect(within(filters).getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/admin/enquiries?page=1&limit=50&status=open',
    );
    expect(within(filters).getByRole('link', { name: 'Responded' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(filters).getByRole('link', { name: 'Closed' })).toHaveAttribute(
      'href',
      '/admin/enquiries?page=1&limit=50&status=closed',
    );
  });

  it('distinguishes an empty filtered result from an API failure', () => {
    const empty = { ...result, items: [], page: 1, total: 0, totalPages: 0 };
    const { rerender } = render(
      <AdminEnquiriesList result={empty} query={{ status: 'closed', page: 1, limit: 25 }} />,
    );
    expect(screen.getByText('No closed enquiries')).toBeInTheDocument();
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();

    rerender(
      <AdminEnquiriesList
        result={empty}
        query={{ status: 'closed', page: 1, limit: 25 }}
        error="Refresh the page to try again."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Refresh the page to try again.');
    expect(screen.queryByText('No closed enquiries')).not.toBeInTheDocument();
  });
});
