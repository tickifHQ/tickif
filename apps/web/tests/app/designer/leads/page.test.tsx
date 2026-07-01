import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListLeadsResponse } from '@repo/contracts';

const mock = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  headers: vi.fn(),
  getLeads: vi.fn(),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: mock.requireAuth,
}));

vi.mock('next/headers', () => ({
  headers: mock.headers,
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      leads: {
        $get: mock.getLeads,
      },
    },
  },
}));

vi.mock('@/components/designer-leads-list', () => ({
  DesignerLeadsList: ({
    activeStatus,
    query,
    error,
  }: {
    activeStatus: string;
    query?: string;
    error?: string;
  }) => (
    <div>
      <div data-testid="active-status">{activeStatus}</div>
      <div data-testid="query">{query ?? ''}</div>
      <div data-testid="error">{error ?? ''}</div>
    </div>
  ),
}));

const response: ListLeadsResponse = {
  items: [],
  page: 2,
  limit: 12,
  total: 0,
  totalPages: 1,
};

describe('DesignerLeadsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.headers.mockResolvedValue({ get: () => 'session=abc' });
    mock.getLeads.mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('requires designer auth and lists leads through the typed API', async () => {
    const { default: Page } = await import('../../../../app/(designer)/designer/leads/page');

    const page = await Page({
      searchParams: Promise.resolve({
        status: 'contacted',
        q: 'Priya',
        page: '2',
        limit: '12',
      }),
    });
    render(page);

    expect(mock.requireAuth).toHaveBeenCalledWith({ requiredRole: 'designer' });
    expect(mock.getLeads).toHaveBeenCalledWith(
      { query: { status: 'contacted', q: 'Priya', page: 2, limit: 12 } },
      { headers: { cookie: 'session=abc' } },
    );
    expect(screen.getByTestId('active-status')).toHaveTextContent('contacted');
    expect(screen.getByTestId('query')).toHaveTextContent('Priya');
  });

  it('surfaces a load error when the API response is unavailable', async () => {
    mock.getLeads.mockResolvedValue(new Response(null, { status: 500 }));
    const { default: Page } = await import('../../../../app/(designer)/designer/leads/page');

    const page = await Page({ searchParams: Promise.resolve({}) });
    render(page);

    expect(screen.getByTestId('error')).toHaveTextContent('Could not load leads.');
  });
});
