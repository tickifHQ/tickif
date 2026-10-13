import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VisitorSavedCount,
  VisitorSavedCountProvider,
  VisitorSavedCountRetry,
} from '@/components/visitor-saved-count';

const mock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { api: { 'saved-projects': { $get: mock.get } } } }));
const projectId = '11111111-1111-4111-8111-111111111111';
const countResponse = (total: number) =>
  Response.json({ projects: [], total, page: 1, limit: 1, totalPages: total });
const event = (userId = 'visitor-1', saved = true) =>
  act(() =>
    window.dispatchEvent(
      new CustomEvent('tickif:project-saved', {
        detail: { userId, project: { projectId, saved } },
      }),
    ),
  );

function Activity({ userId = 'visitor-1', initialTotal = 2 }) {
  return (
    <VisitorSavedCountProvider userId={userId}>
      <nav>
        <a href="/saved-projects">
          Saved
          <VisitorSavedCount initialTotal={initialTotal} />
        </a>
        <VisitorSavedCountRetry />
      </nav>
      <nav>
        <a href="/saved-projects">
          Saved
          <VisitorSavedCount initialTotal={initialTotal} />
        </a>
        <VisitorSavedCountRetry />
      </nav>
      <article>Stable feed</article>
    </VisitorSavedCountProvider>
  );
}

describe('visitor saved count', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mock.get.mockImplementation(async () => countResponse(3));
  });

  it.each([true, false])(
    'refreshes both totals with one authoritative read for saved=%s',
    async (saved) => {
      render(<Activity />);
      expect(screen.getAllByRole('link', { name: 'Saved 2' })).toHaveLength(2);
      expect(mock.get).not.toHaveBeenCalled();
      event('visitor-1', saved);
      await waitFor(() => expect(screen.getAllByRole('link', { name: 'Saved 3' })).toHaveLength(2));
      expect(mock.get).toHaveBeenCalledOnce();
      expect(mock.get).toHaveBeenCalledWith(
        { query: { page: 1, limit: 1 } },
        { init: { cache: 'no-store', signal: expect.any(AbortSignal) } },
      );
      expect(screen.getByRole('article')).toHaveTextContent('Stable feed');
    },
  );

  it('ignores unrelated and invalid events', () => {
    render(<Activity />);
    event('other-user');
    for (const detail of [
      null,
      { userId: 'visitor-1', project: { projectId: 'invalid', saved: true } },
    ]) {
      act(() => window.dispatchEvent(new CustomEvent('tickif:project-saved', { detail })));
    }
    act(() => window.dispatchEvent(new Event('tickif:project-saved')));
    expect(mock.get).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'HTTP failure', respond: async () => Response.json({}, { status: 503 }) },
    { label: 'invalid payload', respond: async () => Response.json({ total: -1 }) },
    {
      label: 'offline',
      respond: async () => {
        throw new Error('Offline');
      },
    },
  ])(
    'hides an unknown count and retries without refreshing the feed: $label',
    async ({ respond }) => {
      mock.get.mockImplementationOnce(respond);
      render(<Activity />);
      event();
      await waitFor(() => expect(screen.getAllByRole('link', { name: 'Saved' })).toHaveLength(2));
      expect(screen.getByRole('status')).toHaveTextContent('saved count is unavailable');
      fireEvent.click(screen.getAllByRole('button', { name: 'Retry saved count' })[0]!);
      await waitFor(() => expect(screen.getAllByRole('link', { name: 'Saved 3' })).toHaveLength(2));
      expect(screen.queryByRole('button', { name: 'Retry saved count' })).toBeNull();
      expect(screen.getAllByRole('link')[0]).toHaveFocus();
      expect(screen.getByRole('article')).toHaveTextContent('Stable feed');
    },
  );

  it('ignores older overlapping count responses and cancels reads on unmount', async () => {
    let first!: (value: Response) => void;
    mock.get.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          first = resolve;
        }),
    );
    const { unmount } = render(<Activity />);
    event();
    const firstSignal = mock.get.mock.calls[0]![1].init.signal as AbortSignal;
    event('visitor-1', false);
    expect(firstSignal.aborted).toBe(true);
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Saved 3' })).toHaveLength(2));
    await act(async () => {
      first(countResponse(99));
    });
    expect(screen.queryByRole('link', { name: 'Saved 99' })).toBeNull();
    const latestSignal = mock.get.mock.calls[1]![1].init.signal as AbortSignal;
    unmount();
    expect(latestSignal.aborted).toBe(true);
    event();
    expect(mock.get).toHaveBeenCalledTimes(2);
  });

  it('does not carry another account total or pending response across a user switch', async () => {
    const { rerender } = render(<Activity />);
    event();
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Saved 3' })).toHaveLength(2));
    let pending!: (value: Response) => void;
    mock.get.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          pending = resolve;
        }),
    );
    event();
    rerender(<Activity userId="visitor-2" initialTotal={0} />);
    await act(async () => {
      pending(countResponse(99));
    });
    expect(screen.getAllByRole('link', { name: 'Saved 0' })).toHaveLength(2);
    event();
    expect(mock.get).toHaveBeenCalledTimes(2);
    mock.get.mockResolvedValueOnce(countResponse(1));
    event('visitor-2');
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Saved 1' })).toHaveLength(2));
  });
});
