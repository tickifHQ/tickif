import { abandonedCheckoutRepository as repository } from './abandoned-repository.js';
import { replacementProvider as provider } from './provider.js';

const TERMINAL = new Set(['cancelled', 'completed', 'expired']);

/** A retired checkout can authorize later; it must never grant access or retain a charge. */
export async function reconcileAbandonedCheckout(id: string) {
  return repository.locked(id, async ({ row, currentSubscriptionId, recordPayment, resolve }) => {
    if (currentSubscriptionId === row.razorpaySubscriptionId) return;
    let remote = await provider.subscription(row.razorpaySubscriptionId);
    // Razorpay cannot cancel a created subscription. The worker and webhook retry
    // once an old checkout link is authenticated, including after browser dismissal.
    if (remote.status !== 'created' && !TERMINAL.has(remote.status))
      remote = await provider.cancel(remote.id, false);
    let settled = TERMINAL.has(remote.status);
    for (const invoice of await provider.invoices(remote.id)) {
      if (invoice.subscription_id !== remote.id || !invoice.payment_id) continue;
      let payment = await provider.payment(invoice.payment_id);
      if (payment.status === 'captured' && payment.amount_refunded < payment.amount) {
        await provider.refund(payment.id, payment.amount, row.razorpaySubscriptionId);
        payment = await provider.payment(payment.id);
      }
      if (
        payment.status === 'authorized' ||
        payment.status === 'created' ||
        (payment.status === 'captured' && payment.amount_refunded < payment.amount)
      )
        settled = false;
      await recordPayment(payment);
    }
    if (settled) await resolve();
  });
}
