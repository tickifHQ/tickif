import { act, renderHook } from '@testing-library/react';
import type { OrganizationListQuery, OrganizationPage } from '@repo/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrganizationPage } from '@/lib/use-organization-page';

type Person = { name: string; email: string };
const initialData: OrganizationPage<Person> = {
  items: [],
  page: 1,
  limit: 12,
  total: 0,
  totalPages: 1,
};
function page(
  name: string,
  metadata: Partial<OrganizationPage<Person>> = {},
): OrganizationPage<Person> {
  return { ...initialData, items: [{ name, email: `${name}@example.com` }], total: 1, ...metadata };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
async function advance(milliseconds = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

describe('useOrganizationPage', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('aborts old searches and ignores a late response even if the request ignores cancellation', async () => {
    const oldRequest = deferred<OrganizationPage<Person>>();
    const newRequest = deferred<OrganizationPage<Person>>();
    const load = vi
      .fn<
        (query: OrganizationListQuery, signal: AbortSignal) => Promise<OrganizationPage<Person>>
      >()
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    const { result } = renderHook(() => useOrganizationPage({ initialData, load }));
    await advance();
    const oldSignal = load.mock.calls[0]![1];
    act(() => result.current.setSearch('new'));
    expect(oldSignal.aborted).toBe(true);
    await advance(249);
    expect(load).toHaveBeenCalledTimes(1);
    await advance(1);
    newRequest.resolve(page('new'));
    await advance();
    expect(result.current.data.items[0]?.name).toBe('new');
    oldRequest.resolve(page('stale'));
    await advance();
    expect(result.current.data.items[0]?.name).toBe('new');
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('aborts a pending request on unmount', async () => {
    const pending = deferred<OrganizationPage<Person>>();
    const load = vi.fn().mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => useOrganizationPage({ initialData, load }));
    await advance();
    const signal: AbortSignal = load.mock.calls[0]![1];
    unmount();
    expect(signal.aborted).toBe(true);
    pending.resolve(page('late'));
    await advance();
    expect(load).toHaveBeenCalledOnce();
  });

  it('exposes errors and recovers when the user retries', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('Temporarily unavailable'))
      .mockResolvedValue(page('restored'));
    const { result } = renderHook(() => useOrganizationPage({ initialData, load }));
    await advance();
    expect(result.current.error).toBe('Temporarily unavailable');
    expect(result.current.isLoading).toBe(false);
    act(() => result.current.reload());
    await advance();
    expect(result.current.error).toBeNull();
    expect(result.current.data.items[0]?.name).toBe('restored');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('resets page for search and page-size changes, preserving the trimmed query', async () => {
    const load = vi.fn(async (query: OrganizationListQuery) =>
      page('person', { ...query, total: 80, totalPages: 7 }),
    );
    const { result } = renderHook(() =>
      useOrganizationPage({ initialData: { ...initialData, page: 3 }, load }),
    );
    await advance();
    expect(load).toHaveBeenLastCalledWith({ page: 3, limit: 12, q: '' }, expect.any(AbortSignal));
    act(() => result.current.setSearch('  person  '));
    await advance(250);
    expect(load).toHaveBeenLastCalledWith(
      { page: 1, limit: 12, q: 'person' },
      expect.any(AbortSignal),
    );
    act(() => result.current.setPage(2));
    await advance(250);
    expect(result.current.data.page).toBe(2);
    act(() => result.current.setLimit(24));
    await advance(250);
    expect(load).toHaveBeenLastCalledWith(
      { page: 1, limit: 24, q: 'person' },
      expect.any(AbortSignal),
    );
    expect(result.current.data.limit).toBe(24);
  });

  it('accepts the server-clamped page after a list shrinks', async () => {
    const load = vi.fn(async () => page('last-page', { page: 2, total: 14, totalPages: 2 }));
    const { result } = renderHook(() =>
      useOrganizationPage({ initialData: { ...initialData, page: 9 }, load }),
    );
    await advance();
    await advance();
    expect(result.current.data.page).toBe(2);
    expect(result.current.data.totalPages).toBe(2);
    expect(load).toHaveBeenLastCalledWith({ page: 2, limit: 12, q: '' }, expect.any(AbortSignal));
    expect(load.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('refreshes the current page when the surrounding workspace changes', async () => {
    const load = vi.fn().mockResolvedValue(page('member'));
    const { rerender } = renderHook(
      ({ refreshKey }) => useOrganizationPage({ initialData, load, refreshKey }),
      { initialProps: { refreshKey: 'workspace-v1' } },
    );
    await advance();
    rerender({ refreshKey: 'workspace-v2' });
    await advance();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('supports local fixtures without requests and clamps pages after filtering', () => {
    const load = vi.fn();
    const fixture = {
      ...initialData,
      items: Array.from({ length: 25 }, (_, index) => ({
        name: `Person ${index}`,
        email: `person${index}@example.com`,
      })),
    };
    const { result } = renderHook(() =>
      useOrganizationPage({ initialData: fixture, load, enabled: false }),
    );
    expect(result.current.data.items).toHaveLength(12);
    act(() => result.current.setPage(3));
    expect(result.current.data.items[0]?.name).toBe('Person 24');
    act(() => result.current.setSearch('PERSON24@'));
    expect(result.current.data.page).toBe(1);
    expect(result.current.data.total).toBe(1);
    expect(result.current.data.items[0]?.name).toBe('Person 24');
    expect(result.current.isLoading).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });
});
