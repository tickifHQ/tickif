/**
 * Billing data adapter for E-179.
 *
 * Fetches real subscription state from GET /api/billing/subscription (E-119)
 * and maps it to the BillingState type used by the Plan & Billing UI.
 */

import { headers } from 'next/headers';
import { api } from '@/lib/api';
import type { BillingState } from './billing-types';
import type { SubscriptionResponse } from '@repo/contracts';
import { HOBBY_DEFAULT, mapSubscriptionToBillingState } from './billing-state';

/**
 * Fetch billing state for the active organization.
 * Calls GET /api/billing/subscription (E-119) and maps to BillingState.
 */
export async function getBillingState(): Promise<BillingState> {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');
  if (!cookie) return HOBBY_DEFAULT;

  try {
    // Trigger Razorpay reconciliation on page load — self-heals if webhooks were missed.
    // The refresh endpoint is idempotent and skips if states already match.
    try {
      await api.api.billing.subscription.refresh.$get(undefined, {
        headers: { cookie },
        init: { cache: 'no-store' },
      });
    } catch {
      // Reconciliation failure is non-fatal — continue with local state
    }

    const response = await api.api.billing.subscription.$get(undefined, {
      headers: { cookie },
      init: { cache: 'no-store' },
    });

    if (!response.ok) {
      return HOBBY_DEFAULT;
    }

    const data = (await response.json()) as SubscriptionResponse;
    return mapSubscriptionToBillingState(data);
  } catch {
    // API unavailable — return hobby defaults
    return HOBBY_DEFAULT;
  }
}
