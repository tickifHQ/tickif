import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RazorpaySubscription } from '@repo/contracts';
import type {
  RecoveryRecord,
  RecoverySubscription,
} from '../../src/billing-lifecycle/recovery-repository.js';

const repository = vi.hoisted(() => ({
  findOpenRecoveryIntents: vi.fn(),
  reconcileRecoveryIntent: vi.fn(),
}));
const provider = vi.hoisted(() => ({ fetchRecoverySubscription: vi.fn() }));
vi.mock('../../src/billing-lifecycle/recovery-repository.js', () => repository);
vi.mock('../../src/billing-lifecycle/recovery-provider.js', () => provider);
vi.mock('@repo/config', () => ({
  config: {
    RAZORPAY_PLAN_ID_PROFESSIONAL_PLUS: 'plan_pro',
    RAZORPAY_PLAN_ID_CORPORATE: 'plan_corp',
  },
}));
const { resolveRecovery, processBillingRecoverySweep } =
  await import('../../src/billing-lifecycle/recovery.js');
const now = new Date('2026-09-23T00:00:00Z');
const intent: RecoveryRecord = {
  id: 'intent',
  organizationId: 'org',
  actorId: 'actor',
  targetTier: 'corporate',
  sourceSubscriptionId: 'source',
  status: 'waiting_for_expiry',
  eligibleAt: now,
  reason: null,
  revision: 1,
  createdAt: now,
  updatedAt: now,
};
const local: RecoverySubscription = {
  id: 'local',
  organizationId: 'org',
  planTier: 'professional_plus',
  subscriptionState: 'active',
  razorpaySubscriptionId: 'source',
  razorpayStatus: 'active',
  cancelAtPeriodEnd: true,
  currentPeriodEnd: now,
  graceStartedAt: null,
  lockedAt: null,
  downgradedAt: null,
  preLapseTier: null,
  createdAt: now,
  updatedAt: now,
};
const source: RazorpaySubscription = {
  id: 'source',
  entity: 'subscription',
  plan_id: 'plan_pro',
  status: 'active',
  current_start: 1,
  current_end: 2,
  cancel_at_cycle_end: true,
  short_url: null,
  created_at: 1,
};

describe('durable billing recovery reconciliation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not permit checkout merely because the eligible date elapsed', () => {
    expect(resolveRecovery(intent, local, source, source).status).toBe('waiting_for_expiry');
  });
  it('retains an acknowledged schedule when fetch omits the cancellation request field', () => {
    const remote = { ...source, cancel_at_cycle_end: undefined };
    expect(resolveRecovery(intent, local, remote, remote).status).toBe('waiting_for_expiry');
    expect(
      resolveRecovery(intent, { ...local, razorpaySubscriptionId: 'other' }, remote, remote).status,
    ).toBe('requested');
  });

  it.each(['cancelled', 'completed', 'expired'])(
    'permits explicit checkout after provider %s',
    (status) => {
      const terminal = { ...source, status };
      expect(resolveRecovery(intent, local, terminal, terminal).status).toBe('eligible');
    },
  );

  it('blocks another live subscription and never assumes an unknown plan is the target', () => {
    expect(
      resolveRecovery(
        intent,
        local,
        { ...source, status: 'cancelled' },
        { ...source, id: 'replacement', plan_id: 'unknown' },
      ).status,
    ).toBe('requested');
  });

  it('waits for authoritative entitlement activation after provider activation', () => {
    const current = { ...source, id: 'replacement', plan_id: 'plan_corp' };
    expect(resolveRecovery(intent, local, { ...source, status: 'cancelled' }, current).status).toBe(
      'checkout_pending',
    );
    expect(
      resolveRecovery(
        intent,
        { ...local, planTier: 'corporate' },
        { ...source, status: 'cancelled' },
        current,
      ).status,
    ).toBe('completed');
  });

  it('does not complete a replacement while the original mandate is live', () => {
    expect(
      resolveRecovery(intent, { ...local, planTier: 'corporate' }, source, {
        ...source,
        id: 'replacement',
        plan_id: 'plan_corp',
      }).status,
    ).toBe('waiting_for_expiry');
  });

  it('supersedes only after another known replacement is active locally and at the provider', () => {
    const replacement = { ...source, id: 'replacement' };
    expect(
      resolveRecovery(intent, local, { ...source, status: 'cancelled' }, replacement).status,
    ).toBe('superseded');
    expect(
      resolveRecovery(
        intent,
        { ...local, subscriptionState: 'payment_failed' },
        { ...source, status: 'cancelled' },
        replacement,
      ).status,
    ).toBe('requested');
  });

  it('isolates provider lookup failure and reconciles the remaining intents', async () => {
    repository.findOpenRecoveryIntents.mockResolvedValue([
      { id: 'one', organizationId: 'org' },
      { id: 'two', organizationId: 'org2' },
    ]);
    const updates: unknown[] = [];
    repository.reconcileRecoveryIntent.mockImplementation(
      async (
        _candidate,
        _now,
        resolve: (record: RecoveryRecord, row: RecoverySubscription) => Promise<unknown>,
      ) => {
        updates.push(await resolve(intent, local));
        return true;
      },
    );
    provider.fetchRecoverySubscription
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ ...source, status: 'cancelled' });
    expect(await processBillingRecoverySweep(now)).toEqual({ reconciled: 2, failed: 1 });
    expect(updates).toEqual([
      { status: 'requested', eligibleAt: null, reason: 'provider_unavailable' },
      { status: 'eligible', eligibleAt: null, reason: 'source_subscription_terminated' },
    ]);
  });
});
