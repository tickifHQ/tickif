import { config } from '@repo/config';
import { razorpaySubscriptionSchema } from '@repo/contracts';

/** Read only: a lifecycle sweep must never purchase, cancel or update a mandate. */
export async function fetchRecoverySubscription(id: string) {
  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay recovery lookup is not configured');
  }
  const authorization = Buffer.from(
    `${config.RAZORPAY_KEY_ID}:${config.RAZORPAY_KEY_SECRET}`,
  ).toString('base64');
  const response = await fetch(
    `https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(id)}`,
    {
      headers: { Authorization: `Basic ${authorization}` },
      signal: AbortSignal.timeout(8_000),
    },
  );
  // A missing object is unknown, never proof of termination.
  if (!response.ok) throw new Error(`Razorpay recovery lookup failed (${response.status})`);
  const subscription = razorpaySubscriptionSchema.parse(await response.json());
  if (subscription.id !== id) throw new Error('Razorpay recovery lookup identity mismatch');
  return subscription;
}
