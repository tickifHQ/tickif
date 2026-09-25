import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@repo/billing', () => ({
  replacementRepository: { current: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../../src/modules/billing/replacement-service.js', () => ({
  startReplacement: mocks.change,
}));
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  validate: vi.fn(),
  findOperation: vi.fn(),
  findOpenOperation: vi.fn(),
  insertOperation: vi.fn(),
  updateOperation: vi.fn(),
  create: vi.fn(),
  change: vi.fn(),
  cancel: vi.fn(),
  committed: false,
}));
vi.mock('../../../src/modules/billing/subscribe-repository.js', () => ({
  subscribeRepository: {
    withOrganizationLock: async (
      _org: string,
      action: (repository: typeof mocks) => Promise<unknown>,
    ) => {
      const result = await action(mocks);
      mocks.committed = true;
      return result;
    },
    updateOperation: mocks.updateOperation,
  },
}));
vi.mock('../../../src/modules/billing/subscribe-service.js', () => ({
  subscribeService: {
    createSubscription: mocks.create,
    changePlan: mocks.change,
    cancelSubscription: mocks.cancel,
  },
}));
vi.mock('../../../src/modules/billing/selection-service.js', () => ({
  assertBillingAccess: mocks.access,
  validateBillingPreview: mocks.validate,
}));
import { billingMutationService } from '../../../src/modules/billing/mutation-service.js';
import { AppError } from '../../../src/lib/errors.js';
const caller = { userId: 'user', activeOrgId: 'org' };
const params = {
  targetTier: 'corporate' as const,
  previewToken: 'signed',
  operationId: 'cd5cd966-dce7-4e91-81ad-6c113005c847',
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.committed = false;
  mocks.validate.mockResolvedValue({
    preview: { action: 'subscribe', sourceSubscriptionId: null, effectiveAt: null },
    revision: 'revision',
  });
});
describe('durable billing mutation operations', () => {
  it.each(['now', 'cycle_end'])(
    'keeps a %s plan change pending until reconciliation',
    async (timing) => {
      mocks.validate.mockResolvedValue({
        preview: {
          action: 'change_plan',
          timing,
          sourceSubscriptionId: 'provider_sub',
          effectiveAt: null,
        },
        revision: 'revision',
      });
      mocks.change.mockResolvedValue({ razorpaySubscriptionId: 'provider_sub' });
      const response = await billingMutationService.execute(caller, params, 'change_plan');
      expect(response).toMatchObject({ outcome: 'processing' });
      expect(mocks.updateOperation).toHaveBeenCalledWith('org', params.operationId, {
        status: 'processing',
        result: response,
      });
      mocks.findOperation.mockResolvedValue({
        targetTier: 'corporate',
        kind: 'change_plan',
        status: 'processing',
        result: response,
      });
      expect(await billingMutationService.execute(caller, params, 'change_plan')).toEqual(response);
      expect(mocks.change).toHaveBeenCalledTimes(1);
    },
  );
  it('commits reservation before provider mutation and replays the saved result', async () => {
    mocks.create.mockImplementation(async () => {
      expect(mocks.committed).toBe(true);
      expect(mocks.insertOperation).toHaveBeenCalled();
      return { razorpaySubscriptionId: 'provider_sub', shortUrl: null };
    });
    const response = await billingMutationService.execute(caller, params, 'subscribe');
    expect(response).toMatchObject({ outcome: 'processing', targetTier: 'corporate' });
    mocks.findOperation.mockResolvedValue({
      targetTier: 'corporate',
      kind: 'subscribe',
      status: 'scheduled',
      result: response,
    });
    expect(await billingMutationService.execute(caller, params, 'subscribe')).toEqual(response);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it('retains uncertain timeout durably and blocks new operation IDs', async () => {
    mocks.create.mockRejectedValue(AppError.badGateway('timeout'));
    await expect(billingMutationService.execute(caller, params, 'subscribe')).rejects.toMatchObject(
      { status: 502 },
    );
    expect(mocks.updateOperation).toHaveBeenCalledWith('org', params.operationId, {
      status: 'reconciliation_pending',
      result: null,
    });
    mocks.findOpenOperation.mockResolvedValue({ status: 'reconciliation_pending' });
    await expect(
      billingMutationService.execute(
        caller,
        { ...params, operationId: '4cb0669c-dca1-4a77-bb68-6b9519eb09f2' },
        'subscribe',
      ),
    ).rejects.toMatchObject({ code: 'reconciliation_pending' });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it('never passes a recover preview to a direct paid plan change', async () => {
    mocks.validate.mockResolvedValue({ preview: { action: 'recover' }, revision: 'revision' });
    await expect(
      billingMutationService.execute(caller, params, 'change_plan'),
    ).rejects.toMatchObject({ code: 'billing_action_unavailable' });
    expect(mocks.change).not.toHaveBeenCalled();
    expect(mocks.insertOperation).not.toHaveBeenCalled();
  });
  it('requires new explicit review after a definite failure, without replaying checkout', async () => {
    mocks.findOperation.mockResolvedValue({
      targetTier: 'corporate',
      kind: 'subscribe',
      status: 'failed',
      result: { outcome: 'failed' },
    });
    await expect(billingMutationService.execute(caller, params, 'subscribe')).rejects.toMatchObject(
      { code: 'operation_failed' },
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('rejects reused operation identifiers for a different target', async () => {
    mocks.findOperation.mockResolvedValue({
      targetTier: 'professional_plus',
      kind: 'subscribe',
      status: 'scheduled',
      result: {},
    });
    await expect(billingMutationService.execute(caller, params, 'subscribe')).rejects.toMatchObject(
      { code: 'operation_conflict' },
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
