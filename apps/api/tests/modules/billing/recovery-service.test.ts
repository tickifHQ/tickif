import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  assertAccess: vi.fn(),
  validate: vi.fn(),
  fetch: vi.fn(),
  cancel: vi.fn(),
  resolveTier: vi.fn(),
  findRecovery: vi.fn(),
  insertRecovery: vi.fn(),
  updateRecovery: vi.fn(),
  findOperation: vi.fn(),
  findOpenOperation: vi.fn(),
  insertOperation: vi.fn(),
  updateOperation: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
}));
vi.mock('../../../src/modules/billing/selection-service.js', () => ({
  assertBillingAccess: mocks.assertAccess,
  validateBillingPreview: mocks.validate,
}));
vi.mock('../../../src/modules/billing/subscribe-repository.js', () => ({
  subscribeRepository: {
    ...mocks,
    withOrganizationLock: async (_org: string, fn: (repo: typeof mocks) => Promise<unknown>) =>
      fn(mocks),
  },
}));
vi.mock('../../../src/modules/billing/recovery-repository.js', () => ({
  recoveryRepository: mocks,
}));
vi.mock('../../../src/modules/billing/razorpay-client.js', () => ({
  fetchSubscription: mocks.fetch,
  cancelSubscription: mocks.cancel,
  resolveTierFromRazorpayPlanId: mocks.resolveTier,
}));
vi.mock('../../../src/lib/redis.js', () => ({ invalidateEntitlementCache: vi.fn() }));
import { recoveryService } from '../../../src/modules/billing/recovery-service.js';
import { AppError } from '../../../src/lib/errors.js';

const caller = { userId: 'actor', activeOrgId: 'org' };
const input = {
  targetTier: 'corporate' as const,
  expectedRevision: null,
  previewToken: 'token',
  operationId: 'bc2ef990-1744-4f42-9e08-135282894e75',
};
const row = {
  id: 'bc2ef990-1744-4f42-9e08-135282894e74',
  organizationId: 'org',
  actorId: 'actor',
  targetTier: 'corporate',
  sourceSubscriptionId: 'sub_old',
  status: 'requested',
  eligibleAt: null,
  reason: null,
  revision: 1,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};
describe('durable recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.validate.mockResolvedValue({
      preview: { action: 'recover', sourceSubscriptionId: 'sub_old' },
      revision: 'state',
    });
    mocks.insertRecovery.mockResolvedValue(row);
    mocks.updateRecovery.mockResolvedValue({ ...row, revision: 2, status: 'waiting_for_expiry' });
    mocks.fetch.mockResolvedValue({
      id: 'sub_old',
      status: 'active',
      cancel_at_cycle_end: false,
      current_end: 1800000000,
    });
    mocks.cancel.mockResolvedValue({
      id: 'sub_old',
      status: 'active',
      cancel_at_cycle_end: true,
      current_end: 1800000000,
    });
  });
  it('persists accepted intent before cancellation and returns verified waiting status', async () => {
    mocks.findRecovery.mockResolvedValueOnce(undefined).mockResolvedValue(row);
    const result = await recoveryService.save(caller, input);
    expect(mocks.insertOperation.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.cancel.mock.invocationCallOrder[0]!,
    );
    expect(result.recovery?.status).toBe('waiting_for_expiry');
    expect(mocks.updateOperation).toHaveBeenCalledWith(
      'org',
      input.operationId,
      expect.objectContaining({ status: 'scheduled' }),
    );
  });
  it('replay does not repeat provider mutation', async () => {
    mocks.findOperation.mockResolvedValue({ kind: 'recover', targetTier: 'corporate' });
    mocks.findRecovery.mockResolvedValue(row);
    await recoveryService.save(caller, input);
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.validate).not.toHaveBeenCalled();
  });
  it('rejects stale revision before any provider action', async () => {
    mocks.findRecovery.mockResolvedValue({ ...row, revision: 3 });
    await expect(recoveryService.save(caller, input)).rejects.toMatchObject({
      code: 'recovery_revision_conflict',
    });
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it('keeps timeout uncertain and retains accepted target', async () => {
    mocks.findRecovery.mockResolvedValueOnce(undefined).mockResolvedValue(row);
    mocks.cancel.mockRejectedValue(new Error('timeout'));
    await expect(recoveryService.save(caller, input)).rejects.toThrow('timeout');
    expect(mocks.updateOperation).toHaveBeenCalledWith(
      'org',
      input.operationId,
      expect.objectContaining({ status: 'reconciliation_pending' }),
    );
    expect(mocks.updateRecovery).toHaveBeenCalledWith('org', row.id, 1, {
      reason: 'provider_outcome_unconfirmed',
    });
  });
  it('dismisses intent without reversing provider cancellation', async () => {
    mocks.findRecovery.mockResolvedValue(row);
    await recoveryService.dismiss(caller, { expectedRevision: 1 });
    expect(mocks.updateRecovery).toHaveBeenCalledWith(
      'org',
      row.id,
      1,
      expect.objectContaining({ status: 'dismissed' }),
    );
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it('releases a definitively rejected operation for a new explicit review', async () => {
    mocks.findRecovery.mockResolvedValueOnce(undefined).mockResolvedValue(row);
    mocks.cancel.mockRejectedValue(AppError.unprocessable('Cancellation is not supported'));
    await expect(recoveryService.save(caller, input)).rejects.toMatchObject({
      code: 'validation_error',
    });
    expect(mocks.updateOperation).toHaveBeenCalledWith('org', input.operationId, {
      status: 'failed',
      result: { reason: 'review_required' },
    });
  });
  it('does not leave an open uncertain operation when second preflight fails', async () => {
    mocks.findRecovery.mockResolvedValueOnce(undefined).mockResolvedValue(row);
    mocks.validate
      .mockResolvedValueOnce({
        preview: { action: 'recover', sourceSubscriptionId: 'sub_old' },
        revision: 'state',
      })
      .mockRejectedValueOnce(new AppError('preview_stale', 'Review again', 409));
    await expect(recoveryService.save(caller, input)).rejects.toMatchObject({
      code: 'preview_stale',
    });
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.updateOperation).toHaveBeenCalledWith('org', input.operationId, {
      status: 'failed',
      result: { reason: 'review_required' },
    });
  });
  it('checks current billing access even for reads', async () => {
    mocks.assertAccess.mockRejectedValue(new Error('forbidden'));
    await expect(recoveryService.get(caller)).rejects.toThrow('forbidden');
    expect(mocks.findRecovery).not.toHaveBeenCalled();
  });
  it('completes recovery on reload after confirmed replacement activation without a worker tick', async () => {
    mocks.findRecovery.mockResolvedValue({ ...row, status: 'checkout_pending' });
    mocks.find.mockResolvedValue({
      razorpaySubscriptionId: 'sub_new',
      planTier: 'corporate',
      subscriptionState: 'active',
    });
    mocks.fetch
      .mockResolvedValueOnce({ id: 'sub_new', status: 'active', plan_id: 'plan_corporate' })
      .mockResolvedValueOnce({ id: 'sub_old', status: 'cancelled' });
    mocks.resolveTier.mockReturnValue('corporate');
    mocks.updateRecovery.mockResolvedValue({ ...row, status: 'completed', revision: 2 });
    expect((await recoveryService.get(caller)).recovery?.status).toBe('completed');
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.updateRecovery).toHaveBeenCalledWith('org', row.id, 1, {
      status: 'completed',
      eligibleAt: null,
      reason: null,
    });
  });
  it('does not complete a paid recovery from provider status before local activation', async () => {
    mocks.findRecovery.mockResolvedValue({ ...row, status: 'checkout_pending' });
    mocks.find.mockResolvedValue({
      razorpaySubscriptionId: 'sub_new',
      planTier: 'hobby',
      subscriptionState: 'active',
    });
    mocks.fetch.mockResolvedValue({ id: 'sub_new', status: 'active', plan_id: 'plan_corporate' });
    mocks.resolveTier.mockReturnValue('corporate');
    expect((await recoveryService.get(caller)).recovery?.status).toBe('checkout_pending');
    expect(mocks.updateRecovery).not.toHaveBeenCalled();
  });
  it('does not complete replacement recovery while original provider subscription is live', async () => {
    mocks.findRecovery.mockResolvedValue({ ...row, status: 'checkout_pending' });
    mocks.find.mockResolvedValue({
      razorpaySubscriptionId: 'sub_new',
      planTier: 'corporate',
      subscriptionState: 'active',
    });
    mocks.fetch
      .mockResolvedValueOnce({ id: 'sub_new', status: 'active', plan_id: 'plan_corporate' })
      .mockResolvedValueOnce({ id: 'sub_old', status: 'active' });
    mocks.resolveTier.mockReturnValue('corporate');
    expect((await recoveryService.get(caller)).recovery?.status).toBe('checkout_pending');
    expect(mocks.updateRecovery).not.toHaveBeenCalled();
  });
  it('marks recovery eligible on a visit only after verified terminal provider state', async () => {
    mocks.findRecovery.mockResolvedValue({ ...row, status: 'waiting_for_expiry' });
    mocks.find.mockResolvedValue({
      razorpaySubscriptionId: 'sub_old',
      planTier: 'hobby',
      subscriptionState: 'active',
    });
    mocks.fetch.mockResolvedValue({ id: 'sub_old', status: 'cancelled', plan_id: 'plan_old' });
    mocks.updateRecovery.mockResolvedValue({ ...row, status: 'eligible', revision: 2 });
    expect((await recoveryService.get(caller)).recovery?.status).toBe('eligible');
    expect(mocks.updateRecovery).toHaveBeenCalledWith('org', row.id, 1, {
      status: 'eligible',
      eligibleAt: null,
      reason: 'source_subscription_terminated',
    });
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it('never marks eligibility from an elapsed date while provider remains live', async () => {
    mocks.findRecovery.mockResolvedValue({
      ...row,
      status: 'waiting_for_expiry',
      eligibleAt: new Date('2000-01-01'),
    });
    mocks.find.mockResolvedValue({
      razorpaySubscriptionId: 'sub_old',
      planTier: 'professional_plus',
      subscriptionState: 'active',
    });
    mocks.fetch.mockResolvedValue({
      id: 'sub_old',
      status: 'active',
      plan_id: 'plan_old',
      cancel_at_cycle_end: false,
    });
    mocks.resolveTier.mockReturnValue('professional_plus');
    expect((await recoveryService.get(caller)).recovery?.status).toBe('waiting_for_expiry');
    expect(mocks.updateRecovery).not.toHaveBeenCalled();
  });
  it('replaces an eligible target after cancellation cleared the local provider ID without cancelling again', async () => {
    mocks.findRecovery.mockResolvedValue({ ...row, status: 'eligible' });
    mocks.validate.mockResolvedValue({
      preview: { action: 'subscribe', sourceSubscriptionId: null },
      revision: 'state',
    });
    mocks.fetch.mockResolvedValue({ id: 'sub_old', status: 'cancelled' });
    mocks.updateRecovery.mockResolvedValue({
      ...row,
      targetTier: 'professional_plus',
      status: 'eligible',
      revision: 2,
    });
    const result = await recoveryService.save(caller, {
      ...input,
      targetTier: 'professional_plus',
      expectedRevision: 1,
    });
    expect(result.recovery).toMatchObject({ targetTier: 'professional_plus', status: 'eligible' });
    expect(mocks.fetch).toHaveBeenCalledWith('sub_old');
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.insertOperation).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'scheduled', sourceSubscriptionId: 'sub_old' }),
    );
  });
  it('rejects saved eligibility when original provider mandate is still live', async () => {
    mocks.findRecovery.mockResolvedValue({ ...row, status: 'eligible' });
    mocks.validate.mockResolvedValue({
      preview: { action: 'subscribe', sourceSubscriptionId: null },
      revision: 'state',
    });
    mocks.fetch.mockResolvedValue({ id: 'sub_old', status: 'active' });
    await expect(
      recoveryService.save(caller, { ...input, expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: 'recovery_not_eligible' });
    expect(mocks.updateRecovery).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
});
