import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  update: vi.fn(),
  providerUpdate: vi.fn(),
  validate: vi.fn(),
}));
vi.mock('@repo/config', () => ({
  config: { RAZORPAY_KEY_ID: 'test', RAZORPAY_KEY_SECRET: 'test' },
}));
vi.mock('../../../src/modules/billing/subscribe-repository.js', () => ({
  subscribeRepository: {
    withOrganizationLock: async (_org: string, action: (repo: typeof mocks) => unknown) =>
      action(mocks),
  },
}));
vi.mock('../../../src/modules/billing/selection-service.js', () => ({
  validateBillingPreview: mocks.validate,
}));
vi.mock('../../../src/modules/orgs/service.js', () => ({
  orgsService: { hasCapability: vi.fn().mockResolvedValue(true) },
}));
vi.mock('../../../src/lib/redis.js', () => ({
  invalidateEntitlementCache: vi.fn(),
}));
vi.mock('../../../src/modules/billing/razorpay-client.js', () => ({
  hasPaidPlan: (tier: string) => tier !== 'hobby',
  resolveRazorpayPlanId: (tier: string) => `plan_${tier}`,
  updateSubscription: mocks.providerUpdate,
}));

import { subscribeService } from '../../../src/modules/billing/subscribe-service.js';

const caller = { userId: 'user', activeOrgId: 'org' };
const params = {
  targetTier: 'corporate' as const,
  previewToken: 'server-reviewed',
  operationId: 'cd5cd966-dce7-4e91-81ad-6c113005c847',
};
const local = {
  id: 'local',
  razorpaySubscriptionId: 'sub_source',
  razorpayStatus: 'active',
  planTier: 'professional_plus',
  cancelAtPeriodEnd: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.find.mockResolvedValue(local);
  mocks.validate.mockResolvedValue({ preview: { action: 'change_plan', timing: 'now' } });
  mocks.providerUpdate.mockResolvedValue({ id: 'sub_source', status: 'active' });
});

describe('reviewed paid plan changes', () => {
  // Synthetic eligibility is deliberate: production selection remains disabled
  // until merchant capability and charge authorization have been verified.
  it('submits an approved upgrade immediately without granting Corporate access', async () => {
    await subscribeService.changePlan(caller, params);
    expect(mocks.providerUpdate).toHaveBeenCalledWith({
      subscriptionId: 'sub_source',
      planId: 'plan_corporate',
      scheduleChangeAt: 'now',
    });
    expect(mocks.update).toHaveBeenCalledWith('local', { razorpayStatus: 'active' });
  });

  it('defers an approved downgrade to cycle end without removing Corporate access', async () => {
    mocks.find.mockResolvedValue({ ...local, planTier: 'corporate' });
    mocks.validate.mockResolvedValue({ preview: { action: 'change_plan', timing: 'cycle_end' } });
    await subscribeService.changePlan(caller, { ...params, targetTier: 'professional_plus' });
    expect(mocks.providerUpdate).toHaveBeenCalledWith({
      subscriptionId: 'sub_source',
      planId: 'plan_professional_plus',
      scheduleChangeAt: 'cycle_end',
    });
    expect(mocks.update).toHaveBeenCalledWith('local', { razorpayStatus: 'active' });
  });

  it('rejects an upgrade preview with downgrade timing before contacting the provider', async () => {
    mocks.validate.mockResolvedValue({ preview: { action: 'change_plan', timing: 'cycle_end' } });
    await expect(subscribeService.changePlan(caller, params)).rejects.toMatchObject({
      code: 'billing_action_unavailable',
    });
    expect(mocks.providerUpdate).not.toHaveBeenCalled();
  });

  it('cannot bypass review by omitting the token or operation ID', async () => {
    for (const request of [
      { targetTier: params.targetTier },
      { targetTier: params.targetTier, previewToken: params.previewToken },
      { targetTier: params.targetTier, operationId: params.operationId },
    ]) {
      await expect(subscribeService.changePlan(caller, request)).rejects.toMatchObject({
        code: 'billing_action_unavailable',
      });
    }
    expect(mocks.providerUpdate).not.toHaveBeenCalled();
  });

  it('preserves local access on a failed adjustment and never retries the provider call', async () => {
    mocks.providerUpdate.mockRejectedValue(new Error('adjustment charge failed'));
    await expect(subscribeService.changePlan(caller, params)).rejects.toThrow(
      'adjustment charge failed',
    );
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.providerUpdate).toHaveBeenCalledTimes(1);
  });
});
