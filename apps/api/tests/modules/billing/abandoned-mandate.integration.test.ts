import { afterEach, describe, expect, it, vi } from 'vitest';
import { db, schema, eq } from '@repo/db';
import { makeSubscription } from '@repo/db/testing';
import { abandonedCheckoutRepository, replacementProvider } from '@repo/billing';
import { processWebhookEvent } from '../../../src/modules/billing/webhook-service.js';

vi.mock('../../../src/lib/redis.js', () => ({
  invalidateEntitlementCache: vi.fn().mockResolvedValue(undefined),
}));
afterEach(() => vi.restoreAllMocks());

describe('superseded checkout webhooks', () => {
  it.each([false, true])(
    'compensates late mandates during retention=%s without changing the chosen plan',
    async (retained) => {
      const local = await makeSubscription({
        planTier: 'corporate',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_current',
        razorpayStatus: 'active',
      });
      await abandonedCheckoutRepository.trackAbandonedCheckout({
        organizationId: local.organizationId,
        razorpaySubscriptionId: 'sub_abandoned',
      });
      if (retained) {
        const now = new Date('2026-10-01T00:00:00Z');
        await db.insert(schema.organizationRetention).values({
          status: 'deletion_requested',
          organizationId: local.organizationId,
          requestedByUserId: 'owner',
          requestedAt: now,
          archiveDueAt: now,
          hardDeleteDueAt: now,
          delistWindowDays: 1,
          archiveWindowDays: 1,
        });
      }
      const remote = {
        id: 'sub_abandoned',
        entity: 'subscription' as const,
        plan_id: 'plan_old',
        status: 'active',
        current_start: null,
        current_end: null,
        short_url: null,
        created_at: 1_700_000_000,
      };
      vi.spyOn(replacementProvider, 'subscription').mockResolvedValue(remote);
      const cancel = vi
        .spyOn(replacementProvider, 'cancel')
        .mockResolvedValue({ ...remote, status: 'cancelled' });
      vi.spyOn(replacementProvider, 'invoices').mockResolvedValue([
        {
          id: 'inv_old',
          subscription_id: 'sub_abandoned',
          payment_id: 'pay_late',
          status: 'paid',
          billing_start: null,
          billing_end: null,
          amount_paid: 299900,
          currency: 'INR',
        },
      ]);
      vi.spyOn(replacementProvider, 'payment').mockResolvedValue({
        id: 'pay_late',
        order_id: null,
        amount: 299900,
        currency: 'INR',
        status: 'captured',
        amount_refunded: 0,
        created_at: 1_700_000_000,
      });
      const refund = vi.spyOn(replacementProvider, 'refund').mockResolvedValue(undefined);
      const result = await processWebhookEvent('subscription.charged', {
        payload: { subscription: { entity: { id: 'sub_abandoned' } } },
      });
      expect(result).toEqual({ outcome: 'ignored', reason: 'Superseded checkout agreement' });
      expect(cancel).toHaveBeenCalledWith('sub_abandoned', false);
      expect(refund).toHaveBeenCalledWith('pay_late', 299900, 'sub_abandoned');
      const [current] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, local.id));
      expect(current).toMatchObject({
        planTier: 'corporate',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_current',
      });
      const [record] = await db
        .select()
        .from(schema.paymentTransaction)
        .where(eq(schema.paymentTransaction.razorpayPaymentId, 'pay_late'));
      expect(record?.amount).toBe(299900);
    },
  );
});
