import { act, renderHook } from '@testing-library/react';
import type { OrganizationListQuery, OrganizationPage } from '@repo/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrganizationOptions } from '@/lib/use-organization-options';

type Person = { id: string; name: string; email: string };
const first: Person = { id: 'one', name: 'First', email: 'first@example.com' };
const second: Person = { id: 'two', name: 'Second', email: 'second@example.com' };
function page(items: Person[], currentPage = 1, totalPages = 1): OrganizationPage<Person> {
  return { items, page: currentPage, totalPages, total: items.length, limit: 12 };
}
async function advance(milliseconds = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

describe('useOrganizationOptions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('accumulates later pages without removing earlier options or duplicating them', async () => {
    const load = vi.fn(async (query: OrganizationListQuery) =>
      query.page === 1 ? page([first], 1, 2) : page([first, second], 2, 2),
    );
    const { result } = renderHook(() =>
      useOrganizationOptions({ initialItems: [], load, enabled: true }),
    );
    await advance();
    expect(result.current.items).toEqual([first]);
    expect(result.current.hasMore).toBe(true);
    act(() => result.current.loadMore());
    await advance();
    expect(result.current.items).toEqual([first, second]);
    expect(result.current.hasMore).toBe(false);
  });

  it('clears previous options on search and rejects late aborted results', async () => {
    let resolveOld!: (value: OrganizationPage<Person>) => void;
    const oldRequest = new Promise<OrganizationPage<Person>>((resolve) => {
      resolveOld = resolve;
    });
    const load = vi
      .fn<
        (query: OrganizationListQuery, signal: AbortSignal) => Promise<OrganizationPage<Person>>
      >()
      .mockReturnValueOnce(oldRequest)
      .mockResolvedValue(page([second]));
    const { result } = renderHook(() =>
      useOrganizationOptions({ initialItems: [first], load, enabled: true }),
    );
    await advance();
    const oldSignal = load.mock.calls[0]![1];
    act(() => result.current.setSearch('second@'));
    expect(result.current.items).toEqual([]);
    expect(oldSignal.aborted).toBe(true);
    await advance(250);
    expect(result.current.items).toEqual([second]);
    resolveOld(page([first]));
    await advance();
    expect(result.current.items).toEqual([second]);
    expect(load).toHaveBeenLastCalledWith(
      { page: 1, limit: 12, q: 'second@' },
      expect.any(AbortSignal),
    );
  });

  it('offers a retry after failure and restarts at the first page', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValue(page([first]));
    const { result } = renderHook(() =>
      useOrganizationOptions({ initialItems: [], load, enabled: true }),
    );
    await advance();
    expect(result.current.error).toBe('Unavailable');
    act(() => result.current.reload());
    await advance();
    expect(result.current.error).toBeNull();
    expect(result.current.items).toEqual([first]);
    expect(load).toHaveBeenLastCalledWith({ page: 1, limit: 12, q: '' }, expect.any(AbortSignal));
  });

  it('never skips a failed middle page when load more is clicked again', async () => {
    const load = vi.fn(async (query: OrganizationListQuery) => {
      if (query.page === 2) throw new Error('Second page unavailable');
      return page([first], query.page, 3);
    });
    const { result } = renderHook(() =>
      useOrganizationOptions({ initialItems: [], load, enabled: true }),
    );
    await advance();
    act(() => result.current.loadMore());
    await advance();
    expect(result.current.error).toBe('Second page unavailable');
    act(() => result.current.loadMore());
    await advance();
    expect(load.mock.calls.map(([query]) => query.page)).toEqual([1, 2]);
  });

  it('restarts from page one if the available result pages shrink while loading more', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(page([first], 1, 2))
      .mockResolvedValue(page([second], 1, 1));
    const { result } = renderHook(() =>
      useOrganizationOptions({ initialItems: [], load, enabled: true }),
    );
    await advance();
    act(() => result.current.loadMore());
    await advance();
    await advance();
    expect(result.current.items).toEqual([second]);
    expect(result.current.hasMore).toBe(false);
  });

  it('filters local fixtures without fetching or truncating eligible nominees', () => {
    const load = vi.fn();
    const fixtures = Array.from({ length: 20 }, (_, index) => ({
      ...first,
      id: `person-${index}`,
      email: `person${index}@example.com`,
    }));
    const { result } = renderHook(() =>
      useOrganizationOptions({ initialItems: fixtures, load, enabled: false }),
    );
    expect(result.current.items).toHaveLength(20);
    act(() => result.current.setSearch('PERSON19@'));
    expect(result.current.items[0]?.id).toBe('person-19');
    expect(result.current.hasMore).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it('discards accumulated earlier pages and restarts at page one after workspace refresh', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(page([first], 1, 2))
      .mockResolvedValueOnce(page([second], 2, 2))
      .mockResolvedValue(page([second], 1, 1));
    const { result, rerender } = renderHook(
      ({ refreshKey }) =>
        useOrganizationOptions({ initialItems: [], load, enabled: true, refreshKey }),
      { initialProps: { refreshKey: 1 } },
    );
    await advance();
    act(() => result.current.loadMore());
    await advance();
    expect(result.current.items).toEqual([first, second]);
    rerender({ refreshKey: 2 });
    await advance();
    expect(load).toHaveBeenLastCalledWith({ page: 1, limit: 12, q: '' }, expect.any(AbortSignal));
    expect(result.current.items).toEqual([second]);
    expect(result.current.hasMore).toBe(false);
  });

  it('exposes a retryable error when nominee loading fails after a workspace refresh', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(page([first]))
      .mockRejectedValueOnce(new Error('Refresh failed'))
      .mockResolvedValue(page([second]));
    const { result, rerender } = renderHook(
      ({ refreshKey }) =>
        useOrganizationOptions({ initialItems: [], load, enabled: true, refreshKey }),
      { initialProps: { refreshKey: 1 } },
    );
    await advance();
    rerender({ refreshKey: 2 });
    await advance();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe('Refresh failed');
    act(() => result.current.reload());
    await advance();
    expect(result.current.error).toBeNull();
    expect(result.current.items).toEqual([second]);
  });
});
