import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acquireBillingRefreshLease: vi.fn(),
  fetchSubscription: vi.fn(),
  hasCapability: vi.fn(),
  invalidateEntitlementCache: vi.fn(),
  lockedFind: vi.fn(),
  repositoryFind: vi.fn(),
  repositoryUpdate: vi.fn(),
  withOrganizationLock: vi.fn(),
}));

vi.mock('../../../src/modules/billing/subscribe-repository.js', () => ({
  subscribeRepository: {
    find: mocks.repositoryFind,
    payments: vi.fn(),
    withOrganizationLock: mocks.withOrganizationLock,
  },
}));

vi.mock('../../../src/modules/billing/razorpay-client.js', () => ({
  cancelSubscription: vi.fn(),
  createSubscription: vi.fn(),
  fetchSubscription: mocks.fetchSubscription,
  hasPaidPlan: vi.fn(),
  resolveRazorpayPlanId: vi.fn(),
  updateSubscription: vi.fn(),
}));

vi.mock('../../../src/lib/redis.js', () => ({
  acquireBillingRefreshLease: mocks.acquireBillingRefreshLease,
  invalidateEntitlementCache: mocks.invalidateEntitlementCache,
}));

vi.mock('../../../src/modules/orgs/service.js', () => ({
  orgsService: { hasCapability: mocks.hasCapability },
}));

vi.mock('@repo/config', () => ({
  config: {
    RAZORPAY_KEY_ID: 'rzp_test_key',
    RAZORPAY_KEY_SECRET: 'rzp_test_secret',
    RAZORPAY_PLAN_ID_CORPORATE: 'plan_corporate',
    RAZORPAY_PLAN_ID_PROFESSIONAL_PLUS: 'plan_professional',
  },
}));

import { subscribeService } from '../../../src/modules/billing/subscribe-service.js';

const caller = { userId: 'user-1', activeOrgId: 'org-1' };

function localSubscription(providerId: string, razorpayStatus = 'halted') {
  return {
    id: 'local-subscription',
    organizationId: 'org-1',
    planTier: 'professional_plus',
    subscriptionState: 'grace',
    razorpaySubscriptionId: providerId,
    razorpayStatus,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    graceStartedAt: new Date('2026-01-01T00:00:00.000Z'),
    lockedAt: null,
    downgradedAt: null,
    preLapseTier: 'professional_plus',
  };
}

function remoteSubscription(providerId: string) {
  return {
    id: providerId,
    status: 'active',
    plan_id: 'plan_professional',
    short_url: 'https://rzp.example/recover',
    current_end: 1_800_000_000,
    cancel_at_cycle_end: false,
    notes: { tier: 'professional_plus' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acquireBillingRefreshLease.mockResolvedValue(true);
  mocks.hasCapability.mockResolvedValue(true);
  mocks.invalidateEntitlementCache.mockResolvedValue(undefined);
});

describe('billing provider lock boundaries', () => {
  it('fetches payment recovery outside the DB lock and rejects a replaced provider ID', async () => {
    let insideLock = false;
    mocks.repositoryFind.mockResolvedValue(localSubscription('rzp-old'));
    mocks.lockedFind.mockResolvedValue(localSubscription('rzp-new', 'created'));
    mocks.fetchSubscription.mockImplementation(async (providerId: string) => {
      expect(insideLock).toBe(false);
      return remoteSubscription(providerId);
    });
    mocks.withOrganizationLock.mockImplementation(
      async (_organizationId: string, action: (repository: unknown) => Promise<unknown>) => {
        insideLock = true;
        try {
          return await action({ find: mocks.lockedFind });
        } finally {
          insideLock = false;
        }
      },
    );

    await expect(subscribeService.paymentMethod(caller)).rejects.toMatchObject({ status: 409 });
    expect(mocks.fetchSubscription).toHaveBeenCalledWith('rzp-old');
    expect(mocks.withOrganizationLock).toHaveBeenCalledTimes(1);
  });

  it('fetches refresh state outside the DB lock and ignores a stale provider response', async () => {
    let insideLock = false;
    mocks.repositoryFind.mockResolvedValue(localSubscription('rzp-old'));
    mocks.lockedFind.mockResolvedValue(localSubscription('rzp-new', 'created'));
    mocks.fetchSubscription.mockImplementation(async (providerId: string) => {
      expect(insideLock).toBe(false);
      return remoteSubscription(providerId);
    });
    mocks.withOrganizationLock.mockImplementation(
      async (_organizationId: string, action: (repository: unknown) => Promise<unknown>) => {
        insideLock = true;
        try {
          return await action({
            find: mocks.lockedFind,
            update: mocks.repositoryUpdate,
          });
        } finally {
          insideLock = false;
        }
      },
    );

    await expect(subscribeService.refreshSubscription(caller)).resolves.toEqual({
      reconciled: false,
      razorpayStatus: 'created',
    });
    expect(mocks.fetchSubscription).toHaveBeenCalledWith('rzp-old');
    expect(mocks.repositoryUpdate).not.toHaveBeenCalled();
    expect(mocks.invalidateEntitlementCache).not.toHaveBeenCalled();
  });
});
