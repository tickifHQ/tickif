import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  getSubscription: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      billing: {
        subscription: {
          refresh: { $get: apiMocks.refresh },
          $get: apiMocks.getSubscription,
        },
      },
    },
  },
}));

import { waitForSubscriptionActivation } from '../../src/lib/subscription-activation';

describe('waitForSubscriptionActivation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.refresh.mockResolvedValue({ ok: true });
  });

  it('returns true only when the target tier is active', async () => {
    apiMocks.getSubscription.mockResolvedValue({
      ok: true,
      json: async () => ({ tier: 'corporate', lifecycleState: 'active' }),
    });

    await expect(
      waitForSubscriptionActivation('corporate', { maxAttempts: 1, intervalMs: 0 }),
    ).resolves.toBe(true);
  });

  it('does not treat a retained paid tier in a locked lifecycle as activated', async () => {
    apiMocks.getSubscription.mockResolvedValue({
      ok: true,
      json: async () => ({ tier: 'corporate', lifecycleState: 'locked' }),
    });

    await expect(
      waitForSubscriptionActivation('corporate', { maxAttempts: 2, intervalMs: 0 }),
    ).resolves.toBe(false);
    expect(apiMocks.getSubscription).toHaveBeenCalledTimes(2);
  });

  it('returns false after the polling window instead of claiming success', async () => {
    apiMocks.getSubscription.mockResolvedValue({ ok: false });

    await expect(
      waitForSubscriptionActivation('professional_plus', { maxAttempts: 2, intervalMs: 0 }),
    ).resolves.toBe(false);
  });
});
