import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListProjectsResponse } from '@repo/contracts';

const mock = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  headers: vi.fn(),
  getProjects: vi.fn(),
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
      projects: {
        $get: mock.getProjects,
      },
    },
  },
}));

vi.mock('@/components/designer-projects-list', () => ({
  DesignerProjectsList: ({
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

const response: ListProjectsResponse = {
  items: [],
  page: 2,
  limit: 12,
  total: 0,
  totalPages: 1,
};

describe('DesignerProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.headers.mockResolvedValue({ get: () => 'session=abc' });
    mock.getProjects.mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('requires designer auth and lists projects through the typed API', async () => {
    const { default: Page } =
      await import('../../../../app/(designer)/designer/projects/(list)/page');

    const page = await Page({
      searchParams: Promise.resolve({
        status: 'draft',
        q: 'Bandra',
        page: '2',
        limit: '12',
      }),
    });
    render(page);

    expect(mock.requireAuth).toHaveBeenCalledWith({ requiredRole: 'designer' });
    expect(mock.getProjects).toHaveBeenCalledWith(
      { query: { status: 'draft', q: 'Bandra', page: 2, limit: 12, sort: '-updatedAt' } },
      { headers: { cookie: 'session=abc' } },
    );
    expect(screen.getByTestId('active-status')).toHaveTextContent('draft');
    expect(screen.getByTestId('query')).toHaveTextContent('Bandra');
  });

  it('surfaces a load error when the API response is unavailable', async () => {
    mock.getProjects.mockResolvedValue(new Response(null, { status: 500 }));
    const { default: Page } =
      await import('../../../../app/(designer)/designer/projects/(list)/page');

    const page = await Page({ searchParams: Promise.resolve({}) });
    render(page);

    expect(screen.getByTestId('error')).toHaveTextContent('Could not load projects.');
  });
});
