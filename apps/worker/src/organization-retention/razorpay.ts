import { config } from '@repo/config';

type RazorpaySubscriptionResponse = { status?: string };

function credentials(): { authorization: string } {
  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay credentials are required for subscription cleanup');
  }
  return {
    authorization: `Basic ${Buffer.from(
      `${config.RAZORPAY_KEY_ID}:${config.RAZORPAY_KEY_SECRET}`,
    ).toString('base64')}`,
  };
}

async function parseStatus(response: Response): Promise<string | null> {
  const body = (await response.json()) as RazorpaySubscriptionResponse;
  return typeof body.status === 'string' ? body.status : null;
}

/** Confirm cancellation before the durable cleanup item releases its provider ID. */
export async function cancelRazorpaySubscription(subscriptionId: string): Promise<void> {
  const { authorization } = credentials();
  const url = `https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`;
  const current = await fetch(url, { headers: { Authorization: authorization } });
  if (current.status === 404) return;
  if (!current.ok) throw new Error(`Razorpay subscription lookup failed with ${current.status}`);
  const currentStatus = await parseStatus(current);
  if (
    currentStatus === 'cancelled' ||
    currentStatus === 'completed' ||
    currentStatus === 'expired'
  ) {
    return;
  }

  const cancelled = await fetch(`${url}/cancel`, {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cancel_at_cycle_end: false }),
  });
  if (!cancelled.ok)
    throw new Error(`Razorpay subscription cancellation failed with ${cancelled.status}`);
  const cancelledStatus = await parseStatus(cancelled);
  if (cancelledStatus !== 'cancelled' && cancelledStatus !== 'completed') {
    throw new Error(
      `Razorpay subscription cancellation returned ${cancelledStatus ?? 'no status'}`,
    );
  }
}
