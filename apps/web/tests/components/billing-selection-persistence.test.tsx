import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlanSelection } from '../../src/components/subscribe/use-plan-selection';

describe('billing selection persistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });
  it('keeps explicit Corporate intent across a remount and clears it after activation', () => {
    const props = { userId: 'user-a', organizationId: 'org-a', currentTier: 'hobby' as const };
    const first = renderHook(() => usePlanSelection(props));
    act(() => first.result.current.setSelectedTier('corporate'));
    first.unmount();
    const next = renderHook(() => usePlanSelection(props));
    expect(next.result.current.selectedTier).toBe('corporate');
    next.unmount();
    const activated = renderHook(() => usePlanSelection({ ...props, currentTier: 'corporate' }));
    expect(activated.result.current.selectedTier).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
  it('isolates users and organizations and resets on logout', () => {
    const { result, rerender } = renderHook<
      ReturnType<typeof usePlanSelection>,
      { userId?: string; organizationId?: string }
    >((props) => usePlanSelection({ ...props, currentTier: 'hobby' }), {
      initialProps: { userId: 'user-a', organizationId: 'org-a' },
    });
    act(() => result.current.setSelectedTier('corporate'));
    rerender({ userId: 'user-a', organizationId: 'org-b' });
    expect(result.current.selectedTier).toBeNull();
    rerender({ userId: 'user-b', organizationId: 'org-a' });
    expect(result.current.selectedTier).toBeNull();
    rerender({});
    expect(result.current.selectedTier).toBeNull();
  });
  it('rejects an invalid stored tier', () => {
    sessionStorage.setItem('tickif:billing-selection:v1:user-a:org-a', 'enterprise');
    const { result } = renderHook(() =>
      usePlanSelection({ userId: 'user-a', organizationId: 'org-a', currentTier: 'hobby' }),
    );
    expect(result.current.selectedTier).toBeNull();
  });
  it('does not leak previous intent when storage access fails during organization change', () => {
    const { result, rerender } = renderHook(
      ({ organizationId }) =>
        usePlanSelection({ userId: 'user-a', organizationId, currentTier: 'hobby' }),
      { initialProps: { organizationId: 'org-a' } },
    );
    act(() => result.current.setSelectedTier('corporate'));
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    rerender({ organizationId: 'org-b' });
    expect(result.current.selectedTier).toBeNull();
  });
});
