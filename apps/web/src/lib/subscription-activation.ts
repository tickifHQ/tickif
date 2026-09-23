import type { PlanTier } from '@repo/contracts';
import { api } from '@/lib/api';

interface ActivationPollingOptions {
  isCurrent?: () => boolean;
  maxAttempts?: number;
  intervalMs?: number;
}

/**
 * Wait for the server-side subscription lifecycle to reach the purchased tier.
 * A paid tier by itself is not enough: locked subscriptions retain their tier.
 */
export async function waitForSubscriptionActivation(
  targetTier: PlanTier,
  options: ActivationPollingOptions = {},
): Promise<boolean> {
  const { maxAttempts = 15, intervalMs = 2000 } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (options.isCurrent && !options.isCurrent()) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    if (options.isCurrent && !options.isCurrent()) return false;
    try {
      await api.api.billing.subscription.refresh.$get().catch(() => {});

      const response = await api.api.billing.subscription.$get();
      if (!response.ok) continue;

      const data = (await response.json()) as {
        tier: string;
        lifecycleState: string;
      };

      if (data.lifecycleState === 'active' && data.tier === targetTier) {
        return true;
      }
    } catch {
      // Transient network errors are retried within the polling window.
    }
  }

  return false;
}
