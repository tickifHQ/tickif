/**
 * Billing data adapter for E-179.
 *
 * Temporary: returns typed mock data until the billing API (E-71/E-114/E-119/E-239)
 * is implemented. Replace getBillingState() with a real API call when available.
 * The component layer uses only the BillingState type and is unaffected by this swap.
 */

import type { BillingState } from './billing-types';

/**
 * Fetch billing state for the active organization.
 * TODO(E-239): Replace with real API call to /api/billing/state
 */
export async function getBillingState(): Promise<BillingState> {
  return {
    lifecycle: 'active',
    tier: 'professional_plus',
    renewalDate: '2026-12-12',
    subscriptionId: 'sub_TICKIF_demo',
    usage: {
      seats: { label: 'Team Seats', current: 1, limit: 1, unit: 'seats' },
    },
    billing: {
      nextBillingDate: '2026-12-12',
      billingCycle: 'monthly',
      planAmount: 2999,
      tax: 539.82,
      total: 3538.82,
      paymentMethodLast4: '4242',
      paymentMethodBrand: 'Visa',
    },
    graceDaysRemaining: null,
    lastPaymentFailedDate: null,
    frozenResources: [],
    lockedAccess: null,
  };
}
