import { describe, it, expect, vi } from 'vitest';

// Hoist mock functions so they're available when vi.mock factories run.
const { mockInvalidateEntitlementCache } = vi.hoisted(() => ({
  mockInvalidateEntitlementCache: vi.fn().mockResolvedValue(undefined),
}));

// Mock Redis — avoid requiring a live Redis connection in CI.
// The webhook service calls invalidateEntitlementCache after processing.
vi.mock('../../../src/lib/redis.js', () => ({
  getCachedEntitlement: vi.fn().mockResolvedValue(null),
  setCachedEntitlement: vi.fn().mockResolvedValue(undefined),
  invalidateEntitlementCache: mockInvalidateEntitlementCache,
  closeRedisCache: vi.fn().mockResolvedValue(undefined),
}));

// Mock config to ensure Razorpay plan IDs are available for tier inference.
vi.mock('@repo/config', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = (await importOriginal()) as typeof import('@repo/config');
  return {
    ...actual,
    config: {
      ...actual.config,
      RAZORPAY_KEY_ID: actual.config.RAZORPAY_KEY_ID || 'rzp_test_ci_mock',
      RAZORPAY_KEY_SECRET: actual.config.RAZORPAY_KEY_SECRET || 'ci_mock_secret',
      RAZORPAY_WEBHOOK_SECRET: 'test_webhook_secret',
      RAZORPAY_PLAN_ID_PROFESSIONAL_PLUS: 'plan_test_pro_plus',
      RAZORPAY_PLAN_ID_CORPORATE: 'plan_test_corporate',
    },
  };
});

import { eq } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { db, schema } from '@repo/db';
import { makeSubscription } from '@repo/db/testing';
import {
  verifyWebhookSignature,
  processWebhookEvent,
} from '../../../src/modules/billing/webhook-service.js';
import type { RazorpayEvent } from '@repo/contracts';

/**
 * E-117 Webhook handler integration tests.
 *
 * Tests the real webhook-service against PostgreSQL with mocked Redis.
 * Covers: signature verification, all 6 event handlers, idempotency,
 * unknown events, DB state transitions, payment_transaction creation,
 * Redis invalidation, and tier changes.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a Razorpay-style webhook payload. */
function buildPayload(
  event: string,
  opts: {
    subscriptionId: string;
    status?: string;
    planId?: string;
    notes?: Record<string, string>;
    paymentId?: string;
    amount?: number;
    currency?: string;
    currentEnd?: number;
  },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    event,
    payload: {
      subscription: {
        entity: {
          id: opts.subscriptionId,
          status: opts.status ?? 'active',
          plan_id: opts.planId ?? 'plan_test_pro_plus',
          notes: opts.notes ?? { tier: 'professional_plus' },
          current_end: opts.currentEnd ?? Math.floor(Date.now() / 1000) + 30 * 86400,
        },
      },
    },
  };

  if (opts.paymentId) {
    (payload.payload as Record<string, unknown>).payment = {
      entity: {
        id: opts.paymentId,
        amount: opts.amount ?? 299900,
        currency: opts.currency ?? 'INR',
        subscription_id: opts.subscriptionId,
      },
    };
  }

  return payload;
}

// ─── Signature Verification ──────────────────────────────────────────────────

describe('E-117: webhook signature verification', () => {
  const secret = 'test_webhook_secret';

  it('returns true for a valid HMAC-SHA256 signature', () => {
    const body = '{"event":"test"}';
    const sig = createHmac('sha256', secret).update(body).digest('hex');

    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(verifyWebhookSignature('{"event":"test"}', 'bad_signature', secret)).toBe(false);
  });

  it('returns false for a null signature', () => {
    expect(verifyWebhookSignature('{"event":"test"}', null, secret)).toBe(false);
  });

  it('returns false for an undefined signature', () => {
    expect(verifyWebhookSignature('{"event":"test"}', undefined, secret)).toBe(false);
  });

  it('returns false for an empty string signature', () => {
    expect(verifyWebhookSignature('{"event":"test"}', '', secret)).toBe(false);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const body = '{"event":"test"}';
    const wrongSig = createHmac('sha256', 'wrong_secret').update(body).digest('hex');

    expect(verifyWebhookSignature(body, wrongSig, secret)).toBe(false);
  });
});

// ─── Event Processing ────────────────────────────────────────────────────────

describe('E-117: subscription.activated', () => {
  it('upgrades hobby → professional_plus on activation', async () => {
    const sub = await makeSubscription({
      planTier: 'hobby',
      subscriptionState: 'active',
      razorpaySubscriptionId: `sub_activated_${Date.now()}`,
      razorpayStatus: 'created',
    });

    const payload = buildPayload('subscription.activated', {
      subscriptionId: sub.razorpaySubscriptionId!,
      status: 'active',
      planId: 'plan_test_pro_plus',
    });

    const result = await processWebhookEvent('subscription.activated' as RazorpayEvent, payload);
    expect(result.outcome).toBe('processed');

    const [updated] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.id, sub.id));

    expect(updated!.planTier).toBe('professional_plus');
    expect(updated!.subscriptionState).toBe('active');
    expect(updated!.razorpayStatus).toBe('active');
    expect(updated!.graceStartedAt).toBeNull();
    expect(updated!.lockedAt).toBeNull();
    expect(updated!.preLapseTier).toBeNull();
  });

  it('returns duplicate when already active with the same tier', async () => {
    const sub = await makeSubscription({
      planTier: 'professional_plus',
      subscriptionState: 'active',
      razorpaySubscriptionId: `sub_dup_act_${Date.now()}`,
      razorpayStatus: 'active',
    });

    const payload = buildPayload('subscription.activated', {
      subscriptionId: sub.razorpaySubscriptionId!,
      status: 'active',
      planId: 'plan_test_pro_plus',
    });

    const result = await processWebhookEvent('subscription.activated' as RazorpayEvent, payload);
    expect(result.outcome).toBe('duplicate');
  });

  it('rejects activation when tier cannot be determined', async () => {
    const sub = await makeSubscription({
      planTier: 'hobby',
      subscriptionState: 'active',
      razorpaySubscriptionId: `sub_no_tier_${Date.now()}`,
      razorpayStatus: 'created',
    });

    const payload = buildPayload('subscription.activated', {
      subscriptionId: sub.razorpaySubscriptionId!,
      status: 'active',
      planId: 'plan_unknown_id',
      notes: {},
    });
    // Remove payment entity so amount fallback also fails
    delete (payload.payload as Record<string, unknown>).payment;

    const result = await processWebhookEvent('subscription.activated' as RazorpayEvent, payload);
    expect(result.outcome).toBe('ignored');
  });

  it('invalidates Redis entitlement cache after activation', async () => {
    mockInvalidateEntitlementCache.mockClear();

    const sub = await makeSubscription({
      planTier: 'hobby',
      subscriptionState: 'active',
      razorpaySubscriptionId: `sub_cache_${Date.now()}`,
      razorpayStatus: 'created',
    });

    const payload = buildPayload('subscription.activated', {
      subscriptionId: sub.razorpaySubscriptionId!,
      planId: 'plan_test_pro_plus',
    });

    await processWebhookEvent('subscription.activated' as RazorpayEvent, payload);

    expect(mockInvalidateEntitlementCache).toHaveBeenCalledWith(sub.organizationId);
  });
});

describe('E-117: subscription.charged', () => {
  it('creates a payment_transaction and updates subscription', async () => {
    const sub = await makeSubscription({
      planTier: 'professional_plus',
      subscriptionState: 'active',
      razorpaySubscriptionId: `sub_charged_${Date.now()}`,
      razorpayStatus: 'active',
    });

    const paymentId = `pay_test_${Date.now()}`;
    const payload = buildPayload('subscription.charged', {
      subscriptionId: sub.razorpaySubscriptionId!,
      status: 'active',
      planId: 'plan_test_pro_plus',
      paymentId,
      amount: 299900,
      currency: 'INR',
    });

    const result = await processWebhookEvent('subscription.charged' as RazorpayEvent, payload);
    expect(result.outcome).toBe('processed');

    // Verify payment_transaction was created
    const [txn] = await db
      .select()
      .from(schema.paymentTransaction)
      .where(eq(schema.paymentTransaction.razorpayPaymentId, paymentId));

    expect(txn).toBeDefined();
    expect(txn!.subscriptionId).toBe(sub.id);
    expect(txn!.amount).toBe(299900);
    expect(txn!.currency).toBe('INR');
    expect(txn!.status).toBe('active');
    expect(txn!.payload).toBeDefined();
    expect(txn!.processedAt).not.toBeNull();
  });

  it('returns duplicate for the same payment ID (idempotency)', async () => {
    const sub = await makeSubscription({
      planTier: 'professional_plus',
      subscriptionState: 'active',
      razorpaySubscriptionId: `sub_idem_${Date.now()}`,
      razorpayStatus: 'active',
    });

    const paymentId = `pay_idem_${Date.now()}`;
    const payload = buildPayload('subscription.charged', {
      subscriptionId: sub.razorpaySubscriptionId!,
      paymentId,
      amount: 299900,
    });

    // First call — processed
    const first = await processWebhookEvent('subscription.charged' as RazorpayEvent, payload);
    expect(first.outcome).toBe('processed');

    // Second call — duplicate
    const second = await processWebhookEvent('subscription.charged' as RazorpayEvent, payload);
    expect(second.outcome).toBe('duplicate');

    // Only one payment_transaction row
    const txns = await db
      .select()
      .from(schema.paymentTransaction)
      .where(eq(schema.paymentTransaction.razorpayPaymentId, paymentId));
    expect(txns).toHaveLength(1);
  });

  it('updates tier on paid→paid plan change via subscription.charged', async () => {
    const sub = await makeSubscription({
      planTier: 'professional_plus',
      subscriptionState: 'active',
      razorpaySubscriptionId: `sub_planchange_${Date.now()}`,
      razorpayStatus: 'active',
    });

    const payload = buildPayload('subscription.charged', {
      subscriptionId: sub.razorpaySubscriptionId!,
      planId: 'plan_test_corporate',
      paymentId: `pay_upgrade_${Date.now()}`,
      amount: 799900,
    });

    const result = await processWebhookEvent('subscription.charged' as RazorpayEvent, payload);
    expect(result.outcome).toBe('processed');

    const [updated] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.id, sub.id));
    expect(updated!.planTier).toBe('corporate');
  });

  it('reactivates from grace state with payment', async () => {
    const sub = await makeSubscription({
      planTier: 'professional_plus',
      subscriptionState: 'grace',
      razorpaySubscriptionId: `sub_reactivate_${Date.now()}`,
      razorpayStatus: 'halted',
    });

    const payload = buildPayload('subscription.charged', {
      subscriptionId: sub.razorpaySubscriptionId!,
      planId: 'plan_test_pro_plus',
      paymentId: `pay_reactivate_${Date.now()}`,
      amount: 299900,
    });

    const result = await processWebhookEvent('subscription.charged' as RazorpayEvent, payload);
    expect(result.outcome).toBe('processed');

    const [updated] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.id, sub.id));
    expect(updated!.subscriptionState).toBe('active');
    expect(updated!.planTier).toBe('professional_plus');
    expect(updated!.graceStartedAt).toBeNull();
    expect(updated!.preLapseTier).toBeNull();
  });

  it('ignores charge for downgraded subscription', async () => {
    const sub = await makeSubscription({
      subscriptionState: 'downgraded',
      razorpaySubscriptionId: `sub_downgraded_${Date.now()}`,
      razorpayStatus: 'halted',
    });

    const payload = buildPayload('subscription.charged', {
      subscriptionId: sub.razorpaySubscriptionId!,
      paymentId: `pay_ignored_${Date.now()}`,
    });

    const result = await processWebhookEvent('subscription.charged' as RazorpayEvent, payload);
    expect(result.outcome).toBe('ignored');
  });
});

describe('E-117: payment.failed', () => {
  it('transitions active → payment_failed', async () => {
    const sub = await makeSubscription({
      planTier: 'professional_plus',
      subscriptionState: 'active',
      razorpaySubscriptionId: `sub_pf_${Date.now()}`,
      razorpayStatus: 'active',
    });

    const payload = buildPayload('payment.failed', {
      subscriptionId: sub.razorpaySubscriptionId!,
      status: 'halted',
    });

    const result = await processWebhookEvent('payment.failed' as RazorpayEvent, payload);
    expect(result.outcome).toBe('processed');

    const [updated] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.id, sub.id));
    expect(updated!.subscriptionState).toBe('payment_failed');
  });

  it('rejects payment.failed from non-active state', async () => {
    const sub = await makeSubscription({
      planTier: 'professional_plus',
      subscriptionState: 'grace',
      razorpaySubscriptionId: `sub_pf_bad_${Date.now()}`,
      razorpayStatus: 'halted',
    });

    const payload = buildPayload('payment.failed', {
      subscriptionId: sub.razorpaySubscriptionId!,
    });

    const result = await processWebhookEvent('payment.failed' as RazorpayEvent, payload);
    expect(result.outcome).toBe('invalid_transition');
  });
});

describe('E-117: subscription.pending', () => {
  it('updates razorpayStatus without state transition', async () => {
    const sub = await makeSubscription({
      planTier: 'professional_plus',
      subscriptionState: 'active',
      razorpaySubscriptionId: `sub_pending_${Date.now()}`,
      razorpayStatus: 'active',
    });

    const payload = buildPayload('subscription.pending', {
      subscriptionId: sub.razorpaySubscriptionId!,
      status: 'pending',
    });

    const result = await processWebhookEvent('subscription.pending' as RazorpayEvent, payload);
    expect(result.outcome).toBe('processed');

    const [updated] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.id, sub.id));
    expect(updated!.razorpayStatus).toBe('pending');
    expect(updated!.subscriptionState).toBe('active'); // unchanged
    expect(updated!.planTier).toBe('professional_plus'); // unchanged
  });
});

describe('E-117: subscription.halted', () => {
  it('transitions payment_failed → grace with preLapseTier', async () => {
    const sub = await makeSubscription({
      planTier: 'professional_plus',
      subscriptionState: 'payment_failed',
      razorpaySubscriptionId: `sub_halted_${Date.now()}`,
      razorpayStatus: 'halted',
    });

    const payload = buildPayload('subscription.halted', {
      subscriptionId: sub.razorpaySubscriptionId!,
      status: 'halted',
    });

    const result = await processWebhookEvent('subscription.halted' as RazorpayEvent, payload);
    expect(result.outcome).toBe('processed');

    const [updated] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.id, sub.id));
    expect(updated!.subscriptionState).toBe('grace');
    expect(updated!.graceStartedAt).not.toBeNull();
    expect(updated!.preLapseTier).toBe('professional_plus');
    expect(updated!.planTier).toBe('professional_plus'); // preserved
  });

  it('rejects halted from active state (must go through payment_failed first)', async () => {
    const sub = await makeSubscription({
      planTier: 'professional_plus',
      subscriptionState: 'active',
      razorpaySubscriptionId: `sub_halted_bad_${Date.now()}`,
      razorpayStatus: 'active',
    });

    const payload = buildPayload('subscription.halted', {
      subscriptionId: sub.razorpaySubscriptionId!,
    });

    const result = await processWebhookEvent('subscription.halted' as RazorpayEvent, payload);
    expect(result.outcome).toBe('invalid_transition');
  });
});

describe('E-117: subscription.cancelled', () => {
  it('reverts to hobby and clears all Razorpay fields', async () => {
    const sub = await makeSubscription({
      planTier: 'professional_plus',
      subscriptionState: 'active',
      razorpaySubscriptionId: `sub_cancel_${Date.now()}`,
      razorpayStatus: 'active',
      cancelAtPeriodEnd: true,
    });

    const payload = buildPayload('subscription.cancelled', {
      subscriptionId: sub.razorpaySubscriptionId!,
      status: 'cancelled',
    });

    const result = await processWebhookEvent('subscription.cancelled' as RazorpayEvent, payload);
    expect(result.outcome).toBe('processed');

    const [updated] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.id, sub.id));
    expect(updated!.planTier).toBe('hobby');
    expect(updated!.subscriptionState).toBe('active');
    expect(updated!.razorpaySubscriptionId).toBeNull();
    expect(updated!.razorpayStatus).toBeNull();
    expect(updated!.cancelAtPeriodEnd).toBe(false);
    expect(updated!.currentPeriodEnd).toBeNull();
    expect(updated!.graceStartedAt).toBeNull();
    expect(updated!.preLapseTier).toBeNull();
  });

  it('ignores cancellation for already-downgraded subscription', async () => {
    const sub = await makeSubscription({
      subscriptionState: 'downgraded',
      razorpaySubscriptionId: `sub_cancel_dg_${Date.now()}`,
      razorpayStatus: 'cancelled',
    });

    const payload = buildPayload('subscription.cancelled', {
      subscriptionId: sub.razorpaySubscriptionId!,
    });

    const result = await processWebhookEvent('subscription.cancelled' as RazorpayEvent, payload);
    expect(result.outcome).toBe('ignored');
  });
});

describe('E-117: unknown and edge-case events', () => {
  it('ignores a subscription ID not found locally', async () => {
    const payload = buildPayload('subscription.activated', {
      subscriptionId: 'sub_nonexistent',
    });

    const result = await processWebhookEvent('subscription.activated' as RazorpayEvent, payload);
    expect(result.outcome).toBe('ignored');
    expect('reason' in result && result.reason).toContain('not found locally');
  });

  it('ignores a payload with no subscription ID', async () => {
    const payload = { event: 'subscription.activated', payload: {} };

    const result = await processWebhookEvent(
      'subscription.activated' as RazorpayEvent,
      payload as Record<string, unknown>,
    );
    expect(result.outcome).toBe('ignored');
    expect('reason' in result && result.reason).toContain('No subscription ID');
  });

  it('does not invalidate cache when outcome is not processed', async () => {
    mockInvalidateEntitlementCache.mockClear();

    const payload = buildPayload('subscription.activated', {
      subscriptionId: 'sub_nonexistent',
    });

    await processWebhookEvent('subscription.activated' as RazorpayEvent, payload);

    expect(mockInvalidateEntitlementCache).not.toHaveBeenCalled();
  });
});
