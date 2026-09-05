import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConsultationsPage } from '../../src/components/consultations-page';

const mock = vi.hoisted(() => ({
  fetchConsultations: vi.fn(),
  role: 'owner' as string | null,
  activeOrg: null as string | null,
  session: { user: { role: 'visitor' } } as { user: { role: string } } | null,
}));
vi.mock('@/lib/bookings-api', () => ({ fetchConsultations: mock.fetchConsultations }));
vi.mock('@/lib/auth-guard', () => ({
  getServerSession: async () => mock.session,
  activeContextForSession: () => ({ kind: mock.activeOrg ? 'organization' : 'personal' }),
}));
vi.mock('@/lib/current-org-role', () => ({ getCurrentOrgRole: async () => mock.role }));
vi.mock('@/lib/designer-profile', () => ({
  requireCurrentDesignerProfile: async () => ({ displayName: 'Active Branch' }),
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
  mock.role = 'owner';
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
        scope: 'mine',
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
    expect(screen.getByRole('link', { name: 'requested', exact: true })).toHaveAttribute(
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
        scope: 'mine',
        searchParams: Promise.resolve({ status: 'requested', page: '2' }),
      }),
    ).rejects.toThrow('redirect:/home/consultations?status=requested&page=1');
  });
  it('renders the active branch inbox read-only for a viewer', async () => {
    mock.role = 'viewer';
    mock.session = { user: { role: 'designer' } };
    render(await ConsultationsPage({ scope: 'inbox', searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId('list')).toHaveAttribute('data-write', 'false');
    expect(screen.getByText(/Active Branch/)).toBeInTheDocument();
    expect(mock.fetchConsultations).toHaveBeenCalledWith(
      expect.anything(),
      'inbox',
      'synthetic-session',
    );
  });
  it('does not read personal bookings under an organization session', async () => {
    mock.activeOrg = 'org';
    await expect(
      ConsultationsPage({ scope: 'mine', searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('redirect:/designer/consultations');
    expect(mock.fetchConsultations).not.toHaveBeenCalled();
  });
  it('propagates a failed read to the error boundary instead of showing an empty inbox', async () => {
    mock.fetchConsultations.mockRejectedValue(new Error('Offline'));
    await expect(
      ConsultationsPage({ scope: 'mine', searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('Offline');
  });
});
