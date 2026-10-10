import { describe, expect, it } from 'vitest';
import { resolveEntitlements, type SubscriptionResponse } from '@repo/contracts';
import { mapSubscriptionToBillingState } from '../../src/lib/billing-state';

const subscription: SubscriptionResponse = {
  tier: 'professional_plus',
  lifecycleState: 'active',
  preLapseTier: null,
  razorpayStatus: 'active',
  currentPeriodEnd: '2026-10-08T00:00:00.000Z',
  cancellationScheduled: false,
  seatUsage: 1,
  branchUsage: 1,
  entitlements: resolveEntitlements('professional_plus', 'active'),
  graceDaysRemaining: null,
  lockedDaysRemaining: null,
  frozenResources: [],
};
const now = Date.parse('2026-10-09T00:00:00.000Z');

describe('billing renewal display', () => {
  it.each(['2026-10-08T00:00:00.000Z', '2026-10-09T00:00:00.000Z', 'invalid', null])(
    'does not present an unverified active period as an upcoming renewal (%s)',
    (currentPeriodEnd) => {
      const state = mapSubscriptionToBillingState({ ...subscription, currentPeriodEnd }, now);
      expect(state.renewalDate).toBeNull();
      expect(state.billing?.nextBillingDate).toBeNull();
      expect(state.tier).toBe('professional_plus');
      expect(state.lifecycle).toBe('active');
    },
  );

  it('preserves a future period for renewal and scheduled cancellation', () => {
    for (const cancellationScheduled of [false, true]) {
      const currentPeriodEnd = '2026-11-08T00:00:00.000Z';
      const state = mapSubscriptionToBillingState(
        { ...subscription, cancellationScheduled, currentPeriodEnd },
        now,
      );
      expect(state.renewalDate).toBe(currentPeriodEnd);
      expect(state.billing?.nextBillingDate).toBe(currentPeriodEnd);
    }
  });

  it('retains the historical period for a failed-payment lifecycle', () => {
    const state = mapSubscriptionToBillingState(
      { ...subscription, lifecycleState: 'payment_failed' },
      now,
    );
    expect(state.billing?.nextBillingDate).toBe(subscription.currentPeriodEnd);
  });
});
