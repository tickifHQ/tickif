import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  update: vi.fn(),
  track: vi.fn(),
  fetch: vi.fn(),
  create: vi.fn(),
}));
vi.mock('@repo/billing', () => ({ replacementRepository: { current: vi.fn() }, activeEarlyBirdTrial: vi.fn().mockReturnValue(null) }));
vi.mock('@repo/config', () => ({
  config: {
    RAZORPAY_KEY_ID: 'test',
    RAZORPAY_KEY_SECRET: 'test-secret',
    RAZORPAY_PLAN_ID_PROFESSIONAL_PLUS: 'plan_pro',
    RAZORPAY_PLAN_ID_CORPORATE: 'plan_corp',
  },
}));
vi.mock('../../../src/modules/orgs/service.js', () => ({
  orgsService: { hasCapability: vi.fn().mockResolvedValue(true) },
}));
vi.mock('../../../src/lib/redis.js', () => ({ invalidateEntitlementCache: vi.fn() }));
vi.mock('../../../src/modules/billing/selection-service.js', () => ({
  validateBillingPreview: vi.fn(),
}));
vi.mock('../../../src/modules/billing/subscribe-repository.js', () => ({
  subscribeRepository: {
    find: mocks.find,
    withOrganizationLock: async (_org: string, work: (repo: unknown) => Promise<unknown>) =>
      work({ find: mocks.find, update: mocks.update, trackAbandonedCheckout: mocks.track }),
  },
}));
vi.mock('../../../src/modules/billing/razorpay-client.js', () => ({
  fetchSubscription: mocks.fetch,
  createSubscription: mocks.create,
  hasPaidPlan: (tier: string) => tier !== 'hobby',
  resolveRazorpayPlanId: (tier: string) => (tier === 'corporate' ? 'plan_corp' : 'plan_pro'),
}));
import { subscribeService } from '../../../src/modules/billing/subscribe-service.js';
const caller = { userId: 'owner', activeOrgId: 'org' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.find.mockResolvedValue({
    id: 'local',
    planTier: 'hobby',
    razorpaySubscriptionId: 'old',
    razorpayStatus: 'created',
  });
  mocks.fetch.mockResolvedValue({
    id: 'old',
    status: 'created',
    plan_id: 'plan_corp',
    short_url: 'https://rzp.test/old',
  });
  mocks.create.mockResolvedValue({
    id: 'new',
    status: 'created',
    short_url: 'https://rzp.test/new',
  });
});
describe('abandoned subscription checkout', () => {
  it('tracks the old mandate atomically before switching to another paid plan', async () => {
    mocks.create.mockImplementation(async () => {
      expect(mocks.track).toHaveBeenCalledWith({
        organizationId: 'org',
        razorpaySubscriptionId: 'old',
      });
      return { id: 'new', status: 'created', short_url: null };
    });
    expect(
      await subscribeService.createSubscription(caller, { targetTier: 'professional_plus' }),
    ).toMatchObject({ razorpaySubscriptionId: 'new' });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ planId: 'plan_pro' }));
    expect(mocks.update).toHaveBeenCalledWith('local', {
      razorpaySubscriptionId: 'new',
      razorpayStatus: 'created',
    });
  });
  it('reuses the existing mandate when the user chooses the same plan again', async () => {
    expect(
      await subscribeService.createSubscription(caller, { targetTier: 'corporate' }),
    ).toMatchObject({ razorpaySubscriptionId: 'old' });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });
  it.each(['authenticated', 'active', 'pending'])(
    'protects an existing %s mandate',
    async (status) => {
      mocks.fetch.mockResolvedValue({ id: 'old', status, plan_id: 'plan_corp' });
      await expect(
        subscribeService.createSubscription(caller, { targetTier: 'professional_plus' }),
      ).rejects.toMatchObject({ status: 409 });
      expect(mocks.track).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );
  it('preserves the current checkout if provider state cannot be verified', async () => {
    mocks.fetch.mockRejectedValue(new Error('provider unavailable'));
    await expect(
      subscribeService.createSubscription(caller, { targetTier: 'professional_plus' }),
    ).rejects.toThrow('provider unavailable');
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
