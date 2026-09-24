import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBillingAutoRefresh } from '../../src/components/subscribe/use-billing-auto-refresh';

function pendingRefresh() {
  let complete = () => {};
  const promise = new Promise<void>((resolve) => { complete = resolve; });
  return { promise, complete };
}

async function settle() {
  await act(async () => { await Promise.resolve(); });
}

async function advance(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}

describe('useBillingAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('refreshes immediately, then polls every 30 seconds after completion', async () => {
    const pending = pendingRefresh();
    const refresh = vi.fn<() => Promise<void>>().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
    renderHook(() => useBillingAutoRefresh(refresh));
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
    await advance(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    pending.complete();
    await settle();
    await advance(29_999);
    expect(refresh).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('polls urgent billing state every five seconds', async () => {
    const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    renderHook(() => useBillingAutoRefresh(refresh, { urgent: true }));
    await settle();
    await advance(4_999);
    expect(refresh).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('uses the latest callback without starting another immediate request on rerender', async () => {
    const first = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const next = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ refresh }) => useBillingAutoRefresh(refresh), { initialProps: { refresh: first } });
    await settle();
    rerender({ refresh: next });
    await settle();
    expect(next).not.toHaveBeenCalled();
    await advance(30_000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not overlap requests when focus and online events arrive during a refresh', async () => {
    const pending = pendingRefresh();
    const refresh = vi.fn<() => Promise<void>>().mockReturnValue(pending.promise);
    renderHook(() => useBillingAutoRefresh(refresh, { urgent: true }));
    act(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await advance(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    pending.complete();
    await settle();
  });

  it('coalesces explicit refresh with an in-flight automatic refresh', async () => {
    const pending = pendingRefresh();
    const refresh = vi.fn<() => Promise<void>>().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
    const { result } = renderHook(() => useBillingAutoRefresh(refresh));
    let manualRefresh: Promise<void> | undefined;
    act(() => { manualRefresh = result.current(); });
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
    pending.complete();
    await act(async () => { await manualRefresh; });
    await advance(30_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('adopts urgency changes without overlapping a pending refresh', async () => {
    const pending = pendingRefresh();
    const refresh = vi.fn<() => Promise<void>>().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
    const { rerender } = renderHook(({ urgent }) => useBillingAutoRefresh(refresh, { urgent }), { initialProps: { urgent: false } });
    rerender({ urgent: true });
    await advance(30_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    pending.complete();
    await settle();
    await advance(5_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('pauses while hidden and refreshes once when visible again', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    renderHook(() => useBillingAutoRefresh(refresh));
    await advance(60_000);
    expect(refresh).not.toHaveBeenCalled();
    visibility.mockReturnValue('visible');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await advance(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('pauses offline and resumes on online or focus events', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    renderHook(() => useBillingAutoRefresh(refresh));
    await advance(60_000);
    expect(refresh).not.toHaveBeenCalled();
    online.mockReturnValue(true);
    act(() => { window.dispatchEvent(new Event('online')); });
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new Event('focus')); });
    await settle();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('does not refresh while disabled and resumes when enabled', async () => {
    const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ enabled }) => useBillingAutoRefresh(refresh, { enabled }), { initialProps: { enabled: false } });
    await advance(60_000);
    expect(refresh).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
    rerender({ enabled: false });
    act(() => { window.dispatchEvent(new Event('focus')); });
    await advance(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('stops after unmount even if the in-flight request finishes later', async () => {
    const pending = pendingRefresh();
    const refresh = vi.fn<() => Promise<void>>().mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => useBillingAutoRefresh(refresh));
    await settle();
    unmount();
    pending.complete();
    await settle();
    act(() => { window.dispatchEvent(new Event('focus')); });
    await advance(120_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('backs off failed urgent requests up to 60 seconds and resets after success', async () => {
    const refresh = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('Provider unavailable'));
    renderHook(() => useBillingAutoRefresh(refresh, { urgent: true }));
    await settle();
    for (const [index, delay] of [10_000, 20_000, 40_000, 60_000, 60_000].entries()) {
      await advance(delay - 1);
      expect(refresh).toHaveBeenCalledTimes(index + 1);
      if (index === 4) refresh.mockResolvedValue(undefined);
      await advance(1);
      expect(refresh).toHaveBeenCalledTimes(index + 2);
    }
    await advance(4_999);
    expect(refresh).toHaveBeenCalledTimes(6);
    await advance(1);
    expect(refresh).toHaveBeenCalledTimes(7);
  });
});
