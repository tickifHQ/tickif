import { describe, expect, it } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { abandonedCheckoutRepository } from '@repo/billing';
import { makeOrganization, makeSubscription } from '@repo/db/testing';

describe('abandoned checkout durability', () => {
  it('reopens a resolved attempt durably before a failed compensation pass', async () => {
    const organization = await makeOrganization();
    await makeSubscription({
      organizationId: organization.id,
      razorpaySubscriptionId: 'sub_current',
    });
    await db.insert(schema.billingAbandonedCheckout).values({
      organizationId: organization.id,
      razorpaySubscriptionId: 'sub_retired',
      resolvedAt: new Date('2026-10-17T00:00:00Z'),
    });

    await expect(
      abandonedCheckoutRepository.locked('sub_retired', async ({ resolve }) => {
        await resolve();
        throw new Error('provider unavailable');
      }),
    ).rejects.toThrow('provider unavailable');

    expect((await abandonedCheckoutRepository.byProvider('sub_retired'))?.resolvedAt).toBeNull();
  });

  it('records refreshed payment details once and only resolves after successful work', async () => {
    const organization = await makeOrganization();
    const subscription = await makeSubscription({
      organizationId: organization.id,
      razorpaySubscriptionId: 'sub_current',
    });
    await abandonedCheckoutRepository.trackAbandonedCheckout({
      organizationId: organization.id,
      razorpaySubscriptionId: 'sub_retired',
    });
    const payment = {
      id: 'pay_retired',
      order_id: null,
      amount: 20000,
      amount_refunded: 20000,
      currency: 'INR',
      status: 'refunded',
      created_at: 1792195200,
    };
    for (let pass = 0; pass < 2; pass++) {
      await abandonedCheckoutRepository.locked(
        'sub_retired',
        async ({ currentSubscriptionId, recordPayment, resolve }) => {
          expect(currentSubscriptionId).toBe('sub_current');
          await recordPayment(payment);
          await resolve();
        },
      );
    }

    const payments = await db
      .select()
      .from(schema.paymentTransaction)
      .where(eq(schema.paymentTransaction.razorpayPaymentId, payment.id));
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      subscriptionId: subscription.id,
      status: 'refunded',
      payload: payment,
    });
    expect(
      (await abandonedCheckoutRepository.byProvider('sub_retired'))?.resolvedAt,
    ).toBeInstanceOf(Date);
  });
});
