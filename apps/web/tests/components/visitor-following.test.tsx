import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ get: vi.fn(), refresh: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/following.server', () => ({ getFollowing: mock.get }));
vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'visitor' } } }) },
}));
vi.mock('@/lib/api', () => ({ api: { api: { following: { $get: mock.read } } } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
import { VisitorFollowing } from '@/components/visitor-following';
import { FollowingProvider, FollowingFeedTab, FollowingStudios } from '@/components/following-rail';
describe('following rail', () => {
  it('shares the real total with the fixed feed tab, including zero and confirmed follow changes', async () => {
    const data = { items: [], total: 2, totalPages: 1, page: 1, limit: 20 };
    mock.get.mockResolvedValue(data);
    render(
      <FollowingProvider initialData={data} userId="visitor">
        <FollowingFeedTab active />
        <FollowingStudios />
      </FollowingProvider>,
    );
    const tab = screen.getByRole('link', { name: 'Following 2' });
    expect(tab).toHaveAttribute('aria-current', 'page');
    expect(tab).toHaveAttribute('href', '/home?feed=custom&view=following');
    await waitFor(() => expect(mock.read).toHaveBeenCalledTimes(1));
    mock.get.mockResolvedValue({ ...data, total: 0, totalPages: 0 });
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('tickif:following-changed', { detail: { userId: 'visitor' } }),
      );
    });
    await screen.findByRole('link', { name: 'Following 0' });
    expect(mock.read).toHaveBeenCalledTimes(2);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mock.read.mockImplementation(async () => new Response(JSON.stringify(await mock.get())));
  });
  it('uses real identity and new-project counts with a supported discovery action', async () => {
    mock.get.mockResolvedValue({
      items: [
        {
          designerProfileId: '11111111-1111-4111-8111-111111111111',
          displayName: 'Studio with a long name',
          slug: 'studio',
          logoUrl: null,
          portfolioAvailable: true,
          newProjectCount: 3,
          followedAt: '2026-10-12T00:00:00Z',
        },
      ],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    await act(async () => {
      render(await VisitorFollowing({ userId: 'visitor' }));
    });
    expect(
      screen.getByRole('link', { name: 'Studio with a long name, 3 new projects' }),
    ).toHaveAttribute('href', '/d/studio');
    expect(screen.getByText('3 NEW')).toHaveClass('bg-transparent', 'p-0');
    expect(
      screen.getByRole('link', { name: 'Studio with a long name, 3 new projects' }),
    ).toHaveClass('min-h-28.5');
    expect(
      screen.getByRole('link', { name: 'Studio with a long name, 3 new projects' }),
    ).not.toHaveClass('w-24');
    expect(screen.getByRole('link', { name: 'Find designers' })).toHaveAttribute(
      'href',
      '/designers',
    );
  });
  it('does not invent studios when the list is empty or failed', async () => {
    mock.get.mockResolvedValue({ items: [], total: 0, totalPages: 0, page: 1, limit: 20 });
    const view = render(await VisitorFollowing({ userId: 'visitor' }));
    expect(screen.getAllByRole('link')).toHaveLength(1);
    view.unmount();
    mock.get.mockRejectedValue(new Error('Unavailable'));
    render(await VisitorFollowing({ userId: 'visitor' }));
    expect(screen.getByText('Following unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
  it('retains the last confirmed count after a failed refresh and ignores another actor’s events', async () => {
    const data = { items: [], total: 2, totalPages: 1, page: 1, limit: 20 };
    mock.get.mockResolvedValue(data);
    render(
      <FollowingProvider initialData={data} userId="visitor">
        <FollowingFeedTab />
        <FollowingStudios />
      </FollowingProvider>,
    );
    await waitFor(() => expect(mock.read).toHaveBeenCalledTimes(1));
    mock.read.mockRejectedValue(new Error('Offline'));
    await act(async () =>
      window.dispatchEvent(
        new CustomEvent('tickif:following-changed', { detail: { userId: 'other' } }),
      ),
    );
    expect(mock.read).toHaveBeenCalledTimes(1);
    await act(async () =>
      window.dispatchEvent(
        new CustomEvent('tickif:following-changed', { detail: { userId: 'visitor' } }),
      ),
    );
    await screen.findByText('Could not refresh followed studios.');
    expect(screen.getByRole('link', { name: 'Following 2' })).toBeInTheDocument();
  });
});
