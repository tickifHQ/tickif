import { and, eq } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { db, schema } from '@repo/db';
import type { PlanTier } from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import {
  createSubscription,
  updateSubscription,
  cancelSubscription,
  hasPaidPlan,
  resolveRazorpayPlanId,
} from './razorpay-client.js';
import { config } from '@repo/config';

/**
 * E-115 Subscribe service — business logic for subscription creation and plan changes.
 *
 * Security:
 * - Resolves Razorpay plan ID server-side (never trusts client-supplied plan IDs)
 * - Verifies caller is the organization owner before any billing mutation
 * - Uses DB unique constraint on organization_id for idempotency
 *
 * Does NOT handle:
 * - Webhook processing (E-117)
 * - Lifecycle state transitions (E-117/E-239)
 * - Entitlement reads (E-119)
 */

type Caller = { userId: string; activeOrgId: string | null };

async function assertOrgOwner(caller: Caller): Promise<void> {
  if (!caller.activeOrgId) {
    throw AppError.unprocessable('No active organization');
  }
  // Verify the user is the org owner. Only owners can manage billing.
  const [membership] = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, caller.activeOrgId),
        eq(schema.member.userId, caller.userId),
      ),
    )
    .limit(1);

  const role = membership?.role ?? '';
  const isOwner = role.split(',').some((r) => r.trim() === 'owner');
  if (!isOwner) {
    throw AppError.forbidden('Only the organization owner can manage billing');
  }
}

function assertBillingConfigured(): void {
  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) {
    throw AppError.unprocessable('Billing is not configured');
  }
}

export const subscribeService = {
  /**
   * Create a new Razorpay subscription for an organization.
   *
   * The Razorpay plan ID is resolved server-side from the target tier.
   * Client cannot control which plan ID is used.
   *
   * Idempotency: the DB unique constraint on subscription.organization_id prevents
   * duplicate Razorpay subscriptions. If the org already has a subscription with a
   * razorpaySubscriptionId, the request is rejected.
   */
  async createSubscription(
    caller: Caller,
    params: { targetTier: PlanTier },
  ): Promise<{ razorpaySubscriptionId: string; shortUrl: string | null }> {
    assertBillingConfigured();
    await assertOrgOwner(caller);

    if (!hasPaidPlan(params.targetTier)) {
      throw AppError.unprocessable('Cannot create a Razorpay subscription for Hobby tier');
    }

    // Server-side plan resolution — never trust client
    const razorpayPlanId = resolveRazorpayPlanId(params.targetTier);
    if (!razorpayPlanId) {
      throw AppError.unprocessable(
        `Razorpay plan not configured for tier: ${params.targetTier}`,
      );
    }

    // Use a transaction with row-level locking to serialize concurrent subscribe
    // requests for the same organization. This prevents the race where two requests
    // both pass the "no existing subscription" check and both call Razorpay.
    return db.transaction(async (tx) => {
      // Lock the subscription row (or verify none exists) using FOR UPDATE.
      // If another transaction is already creating a subscription for this org,
      // this will block until that transaction completes.
      const [existing] = await tx
        .select({
          id: schema.subscription.id,
          razorpaySubscriptionId: schema.subscription.razorpaySubscriptionId,
        })
        .from(schema.subscription)
        .where(eq(schema.subscription.organizationId, caller.activeOrgId!))
        .for('update')
        .limit(1);

      if (existing?.razorpaySubscriptionId) {
        throw AppError.conflict(
          'Organization already has an active Razorpay subscription. Use change-plan instead.',
        );
      }

      // Razorpay call happens inside the transaction while we hold the row lock.
      // This ensures only one request per org can reach Razorpay at a time.
      const razorpaySub = await createSubscription({
        planId: razorpayPlanId,
        notes: { organizationId: caller.activeOrgId!, tier: params.targetTier },
      });

      // Persist — upsert pattern.
      // IMPORTANT: Do NOT set planTier to the target tier yet. The subscription is
      // in Razorpay "created" status — the customer has not paid. The tier upgrade
      // happens when E-117 receives subscription.activated or subscription.charged.
      // We store razorpaySubscriptionId so the webhook can match this org.
      if (existing) {
        await tx
          .update(schema.subscription)
          .set({
            razorpaySubscriptionId: razorpaySub.id,
            razorpayStatus: razorpaySub.status,
          })
          .where(eq(schema.subscription.id, existing.id));
      } else {
        await tx.insert(schema.subscription).values({
          organizationId: caller.activeOrgId!,
          planTier: 'hobby',
          subscriptionState: 'active',
          razorpaySubscriptionId: razorpaySub.id,
          razorpayStatus: razorpaySub.status,
        });
      }

      return {
        razorpaySubscriptionId: razorpaySub.id,
        shortUrl: razorpaySub.short_url,
      };
    });
  },

  /**
   * Change plan for an existing paid subscription.
   *
   * The target Razorpay plan ID is resolved server-side.
   * Only org owners can change plans.
   */
  async changePlan(
    caller: Caller,
    params: { targetTier: PlanTier },
  ): Promise<{ razorpaySubscriptionId: string }> {
    assertBillingConfigured();
    await assertOrgOwner(caller);

    if (!hasPaidPlan(params.targetTier)) {
      throw AppError.unprocessable('Cannot change to Hobby via Razorpay. Use cancellation.');
    }

    // Server-side plan resolution
    const razorpayPlanId = resolveRazorpayPlanId(params.targetTier);
    if (!razorpayPlanId) {
      throw AppError.unprocessable(
        `Razorpay plan not configured for tier: ${params.targetTier}`,
      );
    }

    // Find existing subscription
    const [subscription] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, caller.activeOrgId!))
      .limit(1);

    if (!subscription?.razorpaySubscriptionId) {
      throw AppError.notFound('No active Razorpay subscription found for this organization');
    }

    // Only allow plan changes on subscriptions that Razorpay has confirmed as active.
    // A subscription in 'created' status means checkout was never completed.
    if (subscription.razorpayStatus !== 'active') {
      throw AppError.unprocessable(
        'Subscription is not yet active. Complete checkout before changing plans.',
      );
    }

    if (subscription.planTier === params.targetTier) {
      throw AppError.unprocessable('Already on the target plan');
    }

    // Update Razorpay subscription plan — deferred to cycle end.
    // The local planTier is NOT updated here. E-117 webhook will confirm the
    // actual plan change and update planTier at that time.
    const updated = await updateSubscription({
      subscriptionId: subscription.razorpaySubscriptionId,
      planId: razorpayPlanId,
      scheduleChangeAt: 'cycle_end',
    });

    // Only update razorpayStatus (informational) — do NOT change planTier.
    // The tier change happens when E-117 receives subscription.charged on the new plan.
    await db
      .update(schema.subscription)
      .set({
        razorpayStatus: updated.status,
      })
      .where(eq(schema.subscription.id, subscription.id));

    return { razorpaySubscriptionId: subscription.razorpaySubscriptionId };
  },

  /**
   * Cancel a paid subscription — transitions to Hobby at cycle end.
   *
   * Calls Razorpay's cancel API with cancel_at_cycle_end=true.
   * The local planTier is NOT changed here — E-117 will process the
   * subscription.cancelled webhook and transition to active+hobby.
   *
   * Only org owners can cancel.
   */
  async cancelSubscription(
    caller: Caller,
  ): Promise<{ razorpaySubscriptionId: string }> {
    assertBillingConfigured();
    await assertOrgOwner(caller);

    const [subscription] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, caller.activeOrgId!))
      .limit(1);

    if (!subscription?.razorpaySubscriptionId) {
      throw AppError.notFound('No active Razorpay subscription found for this organization');
    }

    if (subscription.planTier === 'hobby') {
      throw AppError.unprocessable('Already on the Hobby plan');
    }

    // Cancel at cycle end — subscription stays active until the period ends.
    // Razorpay sends subscription.cancelled webhook when the period expires.
    const cancelled = await cancelSubscription({
      subscriptionId: subscription.razorpaySubscriptionId,
      cancelAtCycleEnd: true,
    });

    // Update razorpayStatus only — planTier stays until E-117 confirms cancellation.
    await db
      .update(schema.subscription)
      .set({ razorpayStatus: cancelled.status })
      .where(eq(schema.subscription.id, subscription.id));

    return { razorpaySubscriptionId: subscription.razorpaySubscriptionId };
  },

  /**
   * Verify a Razorpay Checkout JS payment callback.
   *
   * Verifies the signature from the Checkout JS handler callback.
   * Does NOT upgrade planTier — E-117 webhook is authoritative for activation.
   * Updates razorpayStatus to 'authenticated' to acknowledge the payment.
   *
   * Idempotent: safe to call multiple times for the same payment.
   */
  async verifyPayment(
    caller: Caller,
    params: {
      razorpayPaymentId: string;
      razorpaySubscriptionId: string;
      razorpaySignature: string;
    },
  ): Promise<{ verified: boolean }> {
    assertBillingConfigured();

    if (!caller.activeOrgId) {
      throw AppError.unprocessable('No active organization');
    }

    // Verify signature: HMAC-SHA256(razorpay_payment_id + '|' + razorpay_subscription_id, key_secret)
    const expectedSignature = createHmac('sha256', config.RAZORPAY_KEY_SECRET!)
      .update(`${params.razorpayPaymentId}|${params.razorpaySubscriptionId}`)
      .digest('hex');

    if (expectedSignature !== params.razorpaySignature) {
      throw AppError.badRequest('Invalid payment signature');
    }

    // Signature valid — update razorpayStatus to acknowledge payment.
    // Do NOT change planTier here. The webhook is authoritative for activation.
    const [subscription] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, caller.activeOrgId))
      .limit(1);

    if (subscription?.razorpaySubscriptionId === params.razorpaySubscriptionId) {
      await db
        .update(schema.subscription)
        .set({ razorpayStatus: 'authenticated' })
        .where(eq(schema.subscription.id, subscription.id));
    }

    return { verified: true };
  },
};
