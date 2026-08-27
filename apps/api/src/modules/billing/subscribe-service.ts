import { eq } from 'drizzle-orm';
import { db, schema } from '@repo/db';
import { ORGANIZATION_CAPABILITY, type PlanTier } from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import {
  createSubscription,
  updateSubscription,
  hasPaidPlan,
  resolveRazorpayPlanId,
} from './razorpay-client.js';
import { config } from '@repo/config';
import { orgsService } from '../orgs/service.js';

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
  if (
    !(await orgsService.hasCapability(
      caller.userId,
      caller.activeOrgId,
      ORGANIZATION_CAPABILITY.BILLING,
    ))
  ) {
    throw AppError.forbidden('Organization billing access required');
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

    // Update Razorpay subscription plan
    const updated = await updateSubscription({
      subscriptionId: subscription.razorpaySubscriptionId,
      planId: razorpayPlanId,
    });

    // Persist tier change locally
    await db
      .update(schema.subscription)
      .set({
        planTier: params.targetTier,
        razorpayStatus: updated.status,
      })
      .where(eq(schema.subscription.id, subscription.id));

    return { razorpaySubscriptionId: subscription.razorpaySubscriptionId };
  },
};
