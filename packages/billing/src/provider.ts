import { config } from '@repo/config';
import {
  razorpaySubscriptionSchema,
  razorpayOrderSchema,
  razorpayPaymentsSchema,
  razorpayPaymentSchema,
  razorpayInvoicesSchema,
  razorpayRefundsSchema,
} from '@repo/contracts';

async function request(path: string, body?: Record<string, unknown>): Promise<unknown> {
  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET)
    throw new Error('Billing not configured');
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.RAZORPAY_KEY_ID}:${config.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Billing provider request failed (${response.status})`);
  return response.json();
}
export const replacementProvider = {
  async subscription(id: string) {
    const value = razorpaySubscriptionSchema.parse(
      await request(`/subscriptions/${encodeURIComponent(id)}`),
    );
    if (value.id !== id) throw new Error('Subscription identity mismatch');
    return value;
  },
  async create(planId: string, startAt: number, expireBy: number, operationId: string) {
    return razorpaySubscriptionSchema.parse(
      await request('/subscriptions', {
        plan_id: planId,
        total_count: 120,
        quantity: 1,
        start_at: startAt,
        expire_by: expireBy,
        notes: { tickifReplacementId: operationId },
      }),
    );
  },
  async createOrder(amount: number, currency: string, id: string) {
    return razorpayOrderSchema.parse(
      await request('/orders', { amount, currency, receipt: id, partial_payment: false }),
    );
  },
  async order(id: string) {
    const order = razorpayOrderSchema.parse(await request(`/orders/${encodeURIComponent(id)}`));
    if (order.id !== id) throw new Error('Order identity mismatch');
    return order;
  },
  async payments(orderId: string) {
    return razorpayPaymentsSchema.parse(
      await request(`/orders/${encodeURIComponent(orderId)}/payments`),
    ).items;
  },
  async payment(id: string) {
    const payment = razorpayPaymentSchema.parse(
      await request(`/payments/${encodeURIComponent(id)}`),
    );
    if (payment.id !== id) throw new Error('Payment identity mismatch');
    return payment;
  },
  async capture(id: string, amount: number, currency: string) {
    await request(`/payments/${encodeURIComponent(id)}/capture`, { amount, currency });
    return this.payment(id);
  },
  async invoices(subscriptionId: string) {
    return razorpayInvoicesSchema.parse(
      await request(`/invoices?subscription_id=${encodeURIComponent(subscriptionId)}&count=100`),
    ).items;
  },
  async cancel(id: string, atCycleEnd: boolean) {
    const subscription = razorpaySubscriptionSchema.parse(
      await request(`/subscriptions/${encodeURIComponent(id)}/cancel`, {
        cancel_at_cycle_end: atCycleEnd,
      }),
    );
    if (subscription.id !== id) throw new Error('Cancellation identity mismatch');
    return subscription;
  },
  async refund(paymentId: string, amount: number, operationId: string) {
    const refunds = razorpayRefundsSchema.parse(
      await request(`/payments/${encodeURIComponent(paymentId)}/refunds`),
    ).items;
    if (refunds.some((refund) => refund.receipt === operationId && refund.status !== 'failed'))
      return;
    const payment = await this.payment(paymentId);
    if (payment.amount_refunded >= amount) return;
    await request(`/payments/${encodeURIComponent(paymentId)}/refund`, {
      amount: amount - payment.amount_refunded,
      receipt: operationId,
    });
  },
};
