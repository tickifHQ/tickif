import { afterEach, describe, expect, it, vi } from 'vitest';
import { billingCatalogResponseSchema } from '@repo/contracts';
import { catalogRoutes } from '../../../src/modules/billing/catalog-routes.js';
import { RAZORPAY_PLAN_CONFIG } from '../../../src/modules/billing/razorpay-client.js';
afterEach(() => vi.useRealTimers());

describe('public billing catalogue', () => {
  it('does not cache an offer beyond its IST deadline and hides it afterward', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-31T18:29:50.000Z'));
    const before = await catalogRoutes.request('/plans');
    expect(before.headers.get('cache-control')).toBe('public, max-age=10');
    expect(billingCatalogResponseSchema.parse(await before.json()).earlyBird).toMatchObject({
      months: 3,
      cardRequired: false,
    });
    vi.setSystemTime(new Date('2026-12-31T18:30:00.000Z'));
    const after = await catalogRoutes.request('/plans');
    expect(billingCatalogResponseSchema.parse(await after.json()).earlyBird).toBeNull();
  });
  it('serves configured prices and real tier limits without authentication or provider IDs', async () => {
    const response = await catalogRoutes.request('/plans');
    expect(response.status).toBe(200);
    const body = await response.json();
    const { plans } = billingCatalogResponseSchema.parse(body);
    expect(plans.map((plan) => plan.tier)).toEqual(['hobby', 'professional_plus', 'corporate']);
    expect(plans.map((plan) => plan.amountPaise)).toEqual([
      0,
      RAZORPAY_PLAN_CONFIG.professional_plus.amountPaise,
      RAZORPAY_PLAN_CONFIG.corporate.amountPaise,
    ]);
    expect(plans[0]?.features).toContain('1 seat');
    expect(plans[1]?.features).toContain('1 branch');
    expect(plans[2]?.features).toContain('Unlimited seats');
    expect(plans[2]?.features).toContain('Full role-based access');
    expect(plans.every((plan) => plan.features.includes('Enquiries and client contact'))).toBe(
      true,
    );
    expect(JSON.stringify(body)).not.toMatch(/razorpay|secret/i);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
  });
});
