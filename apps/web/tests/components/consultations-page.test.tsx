import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConsultationsPage } from '../../src/components/consultations-page';

const mock = vi.hoisted(() => ({
  fetchConsultations: vi.fn(),
  activeOrg: null as string | null,
  session: { user: { role: 'visitor' } } as { user: { role: string } } | null,
}));
vi.mock('@/lib/bookings-api', () => ({ fetchConsultations: mock.fetchConsultations }));
vi.mock('@/lib/auth-guard', () => ({
  requirePersonalRequester: async () => {
    if (mock.activeOrg) throw new Error('redirect:/designer/leads');
    return mock.session;
  },
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ cookie: 'synthetic-session' }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('@/components/public-header', () => ({ PublicHeader: () => <div>Public header</div> }));
vi.mock('@/components/consultation-list', () => ({
  ConsultationList: ({ scope, canWrite }: { scope: string; canWrite: boolean }) => (
    <div data-testid="list" data-scope={scope} data-write={canWrite} />
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.session = { user: { role: 'visitor' } };
  mock.activeOrg = null;
  mock.fetchConsultations.mockResolvedValue({
    items: [],
    total: 30,
    page: 2,
    limit: 12,
    totalPages: 3,
  });
});
describe('consultation pages', () => {
  it('loads the private requester page and preserves URL status through pagination', async () => {
    render(
      await ConsultationsPage({
        searchParams: Promise.resolve({ status: 'confirmed', page: '2' }),
      }),
    );
    expect(mock.fetchConsultations).toHaveBeenCalledWith(
      { status: 'confirmed', page: 2, limit: 12 },
      'mine',
      'synthetic-session',
    );
    expect(screen.getByRole('link', { name: 'Next consultations' })).toHaveAttribute(
      'href',
      '/home/consultations?status=confirmed&page=3',
    );
    expect(screen.getByRole('link', { name: 'requested' })).toHaveAttribute(
      'href',
      '/home/consultations?status=requested&page=1',
    );
  });
  it('moves a shortened result page to the last available page', async () => {
    mock.fetchConsultations.mockResolvedValue({
      items: [],
      total: 12,
      page: 2,
      limit: 12,
      totalPages: 1,
    });
    await expect(
      ConsultationsPage({
        searchParams: Promise.resolve({ status: 'requested', page: '2' }),
      }),
    ).rejects.toThrow('redirect:/home/consultations?status=requested&page=1');
  });
  it('does not read personal bookings under an organization session', async () => {
    mock.activeOrg = 'org';
    await expect(ConsultationsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'redirect:/designer/leads',
    );
    expect(mock.fetchConsultations).not.toHaveBeenCalled();
  });
  it('keeps the requester page available to designers browsing without a studio', async () => {
    mock.session = { user: { role: 'designer' } };
    render(await ConsultationsPage({ searchParams: Promise.resolve({}) }));
    expect(mock.fetchConsultations).toHaveBeenCalledWith(
      { status: 'all', page: 1, limit: 12 },
      'mine',
      'synthetic-session',
    );
    expect(screen.getByRole('heading', { name: 'My consultations' })).toBeInTheDocument();
  });
  it('propagates a failed read to the error boundary instead of showing an empty inbox', async () => {
    mock.fetchConsultations.mockRejectedValue(new Error('Offline'));
    await expect(ConsultationsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'Offline',
    );
  });
});
