import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveEntitlements, type SubscriptionResponse } from '@repo/contracts';

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  refresh: vi.fn(),
  getSubscription: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      billing: {
        subscription: {
          refresh: { $get: mocks.refresh },
          $get: mocks.getSubscription,
        },
      },
    },
  },
}));

const { getBillingState } = await import('../../src/lib/billing-data');

const subscription: SubscriptionResponse = {
  tier: 'corporate',
  lifecycleState: 'active',
  preLapseTier: null,
  razorpayStatus: 'active',
  currentPeriodEnd: '2026-10-01T00:00:00.000Z',
  cancellationScheduled: false,
  seatUsage: 7,
  branchUsage: 5,
  entitlements: resolveEntitlements('corporate', 'active'),
  graceDaysRemaining: null,
  lockedDaysRemaining: null,
  frozenResources: [],
};

describe('getBillingState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ cookie: 'better-auth.session_token=session-1' }));
    mocks.refresh.mockResolvedValue(new Response(null, { status: 200 }));
    mocks.getSubscription.mockResolvedValue(
      new Response(JSON.stringify(subscription), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('forwards the incoming cookie to protected billing endpoints', async () => {
    await expect(getBillingState()).resolves.toMatchObject({ tier: 'corporate' });

    expect(mocks.refresh).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ headers: { cookie: 'better-auth.session_token=session-1' } }),
    );
    expect(mocks.getSubscription).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ headers: { cookie: 'better-auth.session_token=session-1' } }),
    );
  });
});
