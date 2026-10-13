import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ get: vi.fn(), actor: 'visitor-1' }));
vi.mock('@/lib/api', () => ({ api: { api: { enquiries: { counts: { $get: mock.get } } } } }));
vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: mock.actor } } }) },
}));
import {
  VisitorEnquiryCountProvider,
  VisitorEnquiryCount,
  VisitorEnquiryCountRetry,
} from '@/components/visitor-enquiry-count';

function Activity({ userId = 'visitor-1' }: { userId?: string }) {
  return (
    <VisitorEnquiryCountProvider userId={userId}>
      {[1, 2].map((id) => (
        <nav key={id}>
          <a href="/enquiries">
            Enquiries
            <VisitorEnquiryCount initialCounts={{ total: 30, unread: 2 }} navigation={id === 1} />
          </a>
          <VisitorEnquiryCountRetry />
        </nav>
      ))}
      <article>Stable feed</article>
    </VisitorEnquiryCountProvider>
  );
}
const counts = (unread: number) => Response.json({ total: 30, unread });

describe('new enquiry count', () => {
  it.each([
    { total: 0, unread: 0, label: 'Enquiries 0' },
    { total: 30, unread: 0, label: 'Enquiries 30' },
    { total: 30, unread: 1, label: 'Enquiries 30 NEW' },
  ])(
    'always shows total $total and marks NEW only for unread activity',
    async ({ total, unread, label }) => {
      mock.get.mockResolvedValue(Response.json({ total, unread }));
      render(<Activity />);
      await waitFor(() => expect(screen.getAllByRole('link', { name: label })).toHaveLength(2));
    },
  );
  it('renders a known zero from the server before the client count is available', () => {
    render(<VisitorEnquiryCount initialCounts={{ total: 0, unread: 0 }} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText(/NEW/)).toBeNull();
  });
  it('times out a stalled count read rather than keeping a stale NEW badge forever', async () => {
    vi.useFakeTimers();
    mock.get.mockImplementation(() => new Promise<Response>(() => undefined));
    render(<Activity />);
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(screen.getAllByRole('button', { name: 'Retry enquiry count' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Enquiries' })).toHaveLength(2);
    expect(mock.get.mock.calls[0]![1].init.signal.aborted).toBe(true);
  });
  beforeEach(() => {
    vi.resetAllMocks();
    mock.actor = 'visitor-1';
    mock.get.mockImplementation(async () => counts(1));
  });
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
  it('uses one authoritative unread count for both layouts and hides NEW when read', async () => {
    render(<Activity />);
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: 'Enquiries 30 NEW' })).toHaveLength(2),
    );
    expect(mock.get).toHaveBeenCalledOnce();
    mock.get.mockResolvedValue(counts(0));
    fireEvent(window, new Event('focus'));
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: 'Enquiries 30' })).toHaveLength(2),
    );
    expect(screen.queryByText(/NEW/)).toBeNull();
  });
  it.each([
    async () => Response.json({}, { status: 503 }),
    async () => Response.json({ total: 0, unread: 1 }),
    async () => {
      throw new Error('Offline');
    },
  ])(
    'never shows an invented count on failure, and retries without replacing the feed',
    async (respond) => {
      mock.get.mockImplementationOnce(respond);
      render(<Activity />);
      const article = screen.getByRole('article');
      const retry = await screen.findAllByRole('button', { name: 'Retry enquiry count' });
      expect(screen.getAllByRole('link', { name: 'Enquiries' })).toHaveLength(2);
      fireEvent.click(retry[0]!);
      await waitFor(() =>
        expect(screen.getAllByRole('link', { name: 'Enquiries 30 NEW' })).toHaveLength(2),
      );
      expect(screen.getAllByRole('link')[0]).toHaveFocus();
      expect(screen.getByRole('article')).toBe(article);
    },
  );
  it('rejects late responses and clears another account data on a user switch', async () => {
    let pending!: (response: Response) => void;
    mock.get.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          pending = resolve;
        }),
    );
    const view = render(<Activity />);
    await waitFor(() => expect(mock.get).toHaveBeenCalledOnce());
    const signal = mock.get.mock.calls[0]![1].init.signal as AbortSignal;
    mock.actor = 'visitor-2';
    mock.get.mockResolvedValue(counts(0));
    view.rerender(<Activity userId="visitor-2" />);
    await act(async () => pending(counts(20)));
    await waitFor(() => expect(screen.queryByText(/NEW/)).toBeNull());
    expect(signal.aborted).toBe(true);
    view.unmount();
    fireEvent(window, new Event('focus'));
    expect(mock.get).toHaveBeenCalledTimes(2);
  });
  it('polls only in visible tabs and refreshes when the tab becomes visible again', async () => {
    vi.useFakeTimers();
    render(<Activity />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getAllByText('30 NEW')).toHaveLength(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(mock.get).toHaveBeenCalledOnce();
    mock.get.mockResolvedValue(counts(3));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => fireEvent(document, new Event('visibilitychange')));
    expect(screen.getAllByText('30 NEW')).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('Enquiries with unread updates: 3.');
    mock.get.mockImplementation(async () => counts(1));
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(screen.getAllByText('30 NEW')).toHaveLength(2);
  });
});
