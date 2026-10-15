import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ auth: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/auth-guard', () => ({ requireAuth: mock.auth }));
vi.mock('next/cache', () => ({ revalidatePath: mock.revalidate }));
import { refreshVisitorHomeActivity } from '@/lib/visitor-activity.actions';

describe('visitor activity cache invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.auth.mockResolvedValue({ user: { id: 'visitor' } });
  });
  it('authenticates and invalidates only the home route', async () => {
    await refreshVisitorHomeActivity();
    expect(mock.auth).toHaveBeenCalledOnce();
    expect(mock.revalidate).toHaveBeenCalledExactlyOnceWith('/home');
  });
  it('does not invalidate anything for an unauthenticated request', async () => {
    mock.auth.mockRejectedValue(new Error('Unauthorized'));
    await expect(refreshVisitorHomeActivity()).rejects.toThrow('Unauthorized');
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
});
