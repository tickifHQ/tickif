import { describe, expect, it } from 'vitest';
import { config } from '@repo/config';
import {
  verifyConnectivity,
  createPlan,
  createSubscription,
  RAZORPAY_PLAN_CONFIG,
} from '../../../src/modules/billing/razorpay-client.js';

/**
 * E-115 Razorpay Test Mode integration tests.
 *
 * These tests make real HTTP calls to Razorpay's Test Mode API.
 * They require RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.
 * Skipped when credentials are not configured.
 */
const hasCredentials = Boolean(config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET);

describe.skipIf(!hasCredentials)('Razorpay Test Mode integration', () => {
  it('verifies Test Mode credentials are valid', async () => {
    const connected = await verifyConnectivity();
    expect(connected).toBe(true);
  }, 10000);

  it('creates a plan in Test Mode', async () => {
    const plan = await createPlan({
      name: `E-115 Integration Test Plan ${Date.now()}`,
      amountPaise: 100, // ₹1 test plan
      currency: 'INR',
      period: 'monthly',
    });

    expect(plan.id).toMatch(/^plan_/);
    expect(plan.entity).toBe('plan');
    expect(plan.item.amount).toBe(100);
    expect(plan.item.currency).toBe('INR');
  }, 10000);

  it('creates a subscription against a plan', async () => {
    // First create a test plan
    const plan = await createPlan({
      name: `E-115 Sub Test Plan ${Date.now()}`,
      amountPaise: RAZORPAY_PLAN_CONFIG.professional_plus.amountPaise,
      currency: 'INR',
      period: 'monthly',
    });

    // Then create a subscription
    const subscription = await createSubscription({
      planId: plan.id,
      notes: { test: 'e115-integration' },
    });

    expect(subscription.id).toMatch(/^sub_/);
    expect(subscription.entity).toBe('subscription');
    expect(subscription.plan_id).toBe(plan.id);
    expect(subscription.status).toBe('created');
  }, 15000);

  it('rejects creation with an invalid plan ID', async () => {
    await expect(
      createSubscription({ planId: 'plan_invalid_does_not_exist' }),
    ).rejects.toThrow(/Razorpay createSubscription failed/);
  }, 10000);
});
