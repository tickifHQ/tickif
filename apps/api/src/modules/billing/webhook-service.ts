import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '@repo/db';
import { config } from '@repo/config';
import {
  RAZORPAY_EVENT,
  SUBSCRIPTION_STATE,
  type PlanTier,
  type RazorpayEvent,
  type SubscriptionState,
} from '@repo/contracts';
import { recordSearchProjectionEvents } from '../search-index/repository.js';
import { invalidateEntitlementCache } from '../../lib/redis.js';

/**
 * E-117 Razorpay Webhook Service.
 *
 * Processes subscription webhook events from Razorpay and transitions the local
 * subscription state machine accordingly. Uses E-114's lifecycle CHECK constraints
 * as the authoritative state-machine validator.
 *
 * Idempotency:
 * - Payment events: payment_transaction.razorpay_payment_id UNIQUE (ON CONFLICT DO NOTHING)
 * - Non-payment events: state checks + idempotent UPDATEs (same-state writes are no-ops)
 *
 * Notifications:
 * - Deferred. Billing notifications depend on E-238's billing_admin role for complete
 *   recipient resolution. Owner-only notifications can be added independently later.
 *
 * Resource freeze/unfreeze:
 * - Deferred to E-239/E-240. No branch/seat freeze infrastructure exists yet.
 *   E-117 restores planTier from preLapseTier on reactivation — that IS the
 *   entitlement restoration (E-119 reads planTier for access decisions).
 */

// ─── Signature Verification ──────────────────────────────────────────────────

/**
 * Verify Razorpay webhook signature using HMAC-SHA256.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (sigBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

type SubscriptionRecord = typeof schema.subscription.$inferSelect;

export type WebhookResult =
  | { outcome: 'processed' }
  | { outcome: 'duplicate' }
  | { outcome: 'ignored'; reason: string }
  | { outcome: 'invalid_transition'; reason: string };

// ─── Event Processing ────────────────────────────────────────────────────────

/**
 * Process a validated Razorpay webhook event.
 * Assumes signature has already been verified.
 * Always returns a result — never throws for business-logic rejections.
 */
export async function processWebhookEvent(
  event: RazorpayEvent,
  payload: Record<string, unknown>,
): Promise<WebhookResult> {
  const razorpaySubscriptionId = extractSubscriptionId(payload);
  if (!razorpaySubscriptionId) {
    return { outcome: 'ignored', reason: 'No subscription ID in payload' };
  }

  const [subscription] = await db
    .select()
    .from(schema.subscription)
    .where(eq(schema.subscription.razorpaySubscriptionId, razorpaySubscriptionId))
    .limit(1);

  if (!subscription) {
    return { outcome: 'ignored', reason: `Subscription ${razorpaySubscriptionId} not found locally` };
  }

  let result: WebhookResult;

  switch (event) {
    case RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED:
      result = await handleActivated(subscription, payload);
      break;
    case RAZORPAY_EVENT.SUBSCRIPTION_CHARGED:
      result = await handleCharged(subscription, payload);
      break;
    case RAZORPAY_EVENT.PAYMENT_FAILED:
      result = await handlePaymentFailed(subscription, payload);
      break;
    case RAZORPAY_EVENT.SUBSCRIPTION_HALTED:
      result = await handleHalted(subscription, payload);
      break;
    case RAZORPAY_EVENT.SUBSCRIPTION_CANCELLED:
      result = await handleCancelled(subscription, payload);
      break;
    case RAZORPAY_EVENT.SUBSCRIPTION_PENDING:
      result = await handlePending(subscription, payload);
      break;
    default:
      return { outcome: 'ignored', reason: `Unhandled event: ${event}` };
  }

  // Invalidate entitlement cache after any successful state/tier change.
  // This ensures the next entitlement read reflects the webhook-driven update.
  if (result.outcome === 'processed') {
    await invalidateEntitlementCache(subscription.organizationId);
  }

  return result;
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

/**
 * subscription.activated — Razorpay confirms the subscription is live.
 * This is the authoritative activation signal (E-116 checkout → E-117 activation).
 * Upgrades planTier to the target tier stored in Razorpay notes or subscription plan.
 */
async function handleActivated(
  subscription: SubscriptionRecord,
  payload: Record<string, unknown>,
): Promise<WebhookResult> {
  const currentState = subscription.subscriptionState as SubscriptionState;
  const razorpayStatus = extractRazorpayStatus(payload) ?? 'active';

  // Determine the target tier. During E-116 checkout, planTier stays 'hobby' until
  // activation is confirmed. The target tier comes from the Razorpay subscription's
  // current plan_id (authoritative — updated by change-plan PATCH), falling back to
  // notes.tier (set at creation, may be stale after plan changes).
  //
  // Priority: plan_id config lookup (authoritative) → notes.tier (fallback) → payment amount → reject
  const targetTier = inferTierFromPlanId(payload) ?? extractTargetTier(payload) ?? inferTierFromPlan(payload);

  if (!targetTier) {
    // Cannot determine the paid tier — refuse to activate blindly.
    // This prevents an accidentally staying on hobby or wrong tier assignment.
    return {
      outcome: 'ignored',
      reason: 'Cannot determine target tier from activation payload (no notes.tier, plan_id, or payment amount)',
    };
  }

  // If already active with the correct tier, this is a duplicate/replay
  if (currentState === SUBSCRIPTION_STATE.ACTIVE && subscription.planTier === targetTier) {
    return { outcome: 'duplicate' };
  }

  return db.transaction(async (tx) => {
    const updates: Partial<typeof schema.subscription.$inferInsert> = {
      subscriptionState: SUBSCRIPTION_STATE.ACTIVE,
      planTier: targetTier,
      razorpayStatus,
      // Clear any lapse fields (handles reactivation from lapse states)
      graceStartedAt: null,
      lockedAt: null,
      downgradedAt: null,
      preLapseTier: null,
    };

    await tx
      .update(schema.subscription)
      .set(updates)
      .where(eq(schema.subscription.id, subscription.id));

    // Queue reindex if tier changed
    if (targetTier && targetTier !== subscription.planTier) {
      await queueDesignerReindex(tx, subscription.organizationId);
    }

    return { outcome: 'processed' as const };
  });
}

/**
 * subscription.charged — successful recurring payment.
 *
 * Three scenarios:
 * 1. Normal renewal (already active, same plan) — record payment, extend period
 * 2. Scheduled paid↔paid plan change — Razorpay does not send subscription.activated
 *    for an already-active sub; the charge that starts the new cycle is the signal.
 *    Apply plan_id (authoritative) or payment amount; never notes.tier (stale after
 *    change-plan PATCH).
 * 3. Reactivation from grace/locked — restore pre-lapse tier, then apply (1)/(2)
 *
 * Idempotency: payment_transaction.razorpay_payment_id UNIQUE via ON CONFLICT DO NOTHING.
 */
async function handleCharged(
  subscription: SubscriptionRecord,
  payload: Record<string, unknown>,
): Promise<WebhookResult> {
  const currentState = subscription.subscriptionState as SubscriptionState;

  // Cannot reactivate from downgraded via payment alone (requires explicit action)
  if (currentState === SUBSCRIPTION_STATE.DOWNGRADED) {
    return { outcome: 'ignored', reason: 'Subscription is downgraded; charge ignored' };
  }

  const razorpayPaymentId = extractPaymentId(payload);
  if (!razorpayPaymentId) {
    return { outcome: 'ignored', reason: 'No payment ID in charged event' };
  }

  const amount = extractAmount(payload);
  const currency = extractCurrency(payload) ?? 'INR';
  const razorpayStatus = extractRazorpayStatus(payload) ?? 'active';
  const currentPeriodEnd = extractCurrentPeriodEnd(payload) ?? new Date();

  return db.transaction(async (tx) => {
    // Idempotent insert: UNIQUE on razorpay_payment_id prevents double-processing.
    const [inserted] = await tx
      .insert(schema.paymentTransaction)
      .values({
        subscriptionId: subscription.id,
        razorpayPaymentId,
        amount,
        currency,
        status: razorpayStatus,
        payload,
        processedAt: new Date(),
      })
      .onConflictDoNothing({ target: schema.paymentTransaction.razorpayPaymentId })
      .returning({ id: schema.paymentTransaction.id });

    if (!inserted) {
      return { outcome: 'duplicate' as const };
    }

    // Build subscription updates based on current state
    const isReactivation =
      currentState === SUBSCRIPTION_STATE.PAYMENT_FAILED ||
      currentState === SUBSCRIPTION_STATE.GRACE ||
      currentState === SUBSCRIPTION_STATE.LOCKED;

    const updates: Partial<typeof schema.subscription.$inferInsert> = {
      subscriptionState: SUBSCRIPTION_STATE.ACTIVE,
      razorpayStatus,
      currentPeriodEnd,
    };

    if (isReactivation) {
      // Restore pre-lapse tier and clear all lapse fields
      updates.planTier = (subscription.preLapseTier as PlanTier) ?? (subscription.planTier as PlanTier);
      updates.graceStartedAt = null;
      updates.lockedAt = null;
      updates.downgradedAt = null;
      updates.preLapseTier = null;
    }

    // Do not use notes.tier — change-plan updates plan_id, not notes.
    // Amount fallback is only for already-active cycle-end charges. On
    // reactivation, restore preLapseTier unless plan_id explicitly differs
    // (a missing/default payment amount must not clobber the restored tier).
    const chargedTier = isReactivation
      ? inferTierFromPlanId(payload)
      : (inferTierFromPlanId(payload) ?? inferTierFromPlan(payload));
    const currentTier = (updates.planTier ?? subscription.planTier) as PlanTier;
    if (chargedTier && chargedTier !== currentTier) {
      updates.planTier = chargedTier;
    }

    await tx
      .update(schema.subscription)
      .set(updates)
      .where(eq(schema.subscription.id, subscription.id));

    const nextTier = (updates.planTier ?? subscription.planTier) as PlanTier;
    if (nextTier !== subscription.planTier) {
      await queueDesignerReindex(tx, subscription.organizationId);
    }

    return { outcome: 'processed' as const };
  });
}

/**
 * payment.failed — payment attempt failed.
 * Valid only from active state (first failure in a billing cycle).
 */
async function handlePaymentFailed(
  subscription: SubscriptionRecord,
  payload: Record<string, unknown>,
): Promise<WebhookResult> {
  const currentState = subscription.subscriptionState as SubscriptionState;

  if (currentState !== SUBSCRIPTION_STATE.ACTIVE) {
    return {
      outcome: 'invalid_transition',
      reason: `Cannot transition from ${currentState} to payment_failed`,
    };
  }

  const razorpayStatus = extractRazorpayStatus(payload) ?? 'halted';

  await db
    .update(schema.subscription)
    .set({
      subscriptionState: SUBSCRIPTION_STATE.PAYMENT_FAILED,
      razorpayStatus,
    })
    .where(eq(schema.subscription.id, subscription.id));

  return { outcome: 'processed' };
}

/**
 * subscription.halted — Razorpay halts the subscription after payment retries fail.
 * Maps to our grace state. Valid only from payment_failed.
 * Sets graceStartedAt and preserves preLapseTier for future restoration.
 */
async function handleHalted(
  subscription: SubscriptionRecord,
  payload: Record<string, unknown>,
): Promise<WebhookResult> {
  const currentState = subscription.subscriptionState as SubscriptionState;

  if (currentState !== SUBSCRIPTION_STATE.PAYMENT_FAILED) {
    return {
      outcome: 'invalid_transition',
      reason: `Cannot transition from ${currentState} to grace`,
    };
  }

  const razorpayStatus = extractRazorpayStatus(payload) ?? 'halted';

  await db
    .update(schema.subscription)
    .set({
      subscriptionState: SUBSCRIPTION_STATE.GRACE,
      graceStartedAt: new Date(),
      preLapseTier: subscription.planTier as PlanTier,
      razorpayStatus,
    })
    .where(eq(schema.subscription.id, subscription.id));

  return { outcome: 'processed' };
}

/**
 * subscription.cancelled — voluntary cancellation by user or admin.
 * Sets subscription to active + hobby, clears all Razorpay/lapse fields.
 * Does NOT route through grace/locked (that's involuntary lapse).
 * Valid from any state except downgraded (already terminal).
 */
async function handleCancelled(
  subscription: SubscriptionRecord,
  _payload: Record<string, unknown>,
): Promise<WebhookResult> {
  const currentState = subscription.subscriptionState as SubscriptionState;

  if (currentState === SUBSCRIPTION_STATE.DOWNGRADED) {
    return { outcome: 'ignored', reason: 'Subscription is downgraded; cancellation ignored' };
  }

  return db.transaction(async (tx) => {
    const previousTier = subscription.planTier as PlanTier;

    await tx
      .update(schema.subscription)
      .set({
        planTier: 'hobby',
        subscriptionState: SUBSCRIPTION_STATE.ACTIVE,
        razorpaySubscriptionId: null,
        razorpayStatus: null,
        currentPeriodEnd: null,
        graceStartedAt: null,
        lockedAt: null,
        downgradedAt: null,
        preLapseTier: null,
      })
      .where(eq(schema.subscription.id, subscription.id));

    // Queue reindex if tier actually changed (cancellation from a paid tier)
    if (previousTier !== 'hobby') {
      await queueDesignerReindex(tx, subscription.organizationId);
    }

    return { outcome: 'processed' as const };
  });
}

/**
 * subscription.pending — informational status update.
 * Only updates razorpayStatus. No state machine transition.
 */
async function handlePending(
  subscription: SubscriptionRecord,
  payload: Record<string, unknown>,
): Promise<WebhookResult> {
  const razorpayStatus = extractRazorpayStatus(payload) ?? 'pending';

  await db
    .update(schema.subscription)
    .set({ razorpayStatus })
    .where(eq(schema.subscription.id, subscription.id));

  return { outcome: 'processed' };
}

// ─── Search Reindex ──────────────────────────────────────────────────────────

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Queue a designer profile reindex when their subscription tier changes.
 * Resolves org → designer_profile, then inserts into the search outbox.
 */
async function queueDesignerReindex(tx: Transaction, organizationId: string): Promise<void> {
  const [profile] = await tx
    .select({ id: schema.designerProfile.id })
    .from(schema.designerProfile)
    .where(eq(schema.designerProfile.orgId, organizationId))
    .limit(1);

  if (profile) {
    await recordSearchProjectionEvents(tx, [
      {
        entityKind: 'designer',
        entityId: profile.id,
        operation: 'index',
        sourceUpdatedAt: new Date(),
      },
    ]);
  }
}

// ─── Payload Extraction Helpers ──────────────────────────────────────────────

function extractSubscriptionId(payload: Record<string, unknown>): string | null {
  // Razorpay nests: payload.subscription.entity.id
  const subEntity = (payload as { payload?: { subscription?: { entity?: { id?: string } } } })
    ?.payload?.subscription?.entity?.id;
  if (subEntity) return subEntity;

  // Some events nest under payment.entity.subscription_id
  const paymentSub = (
    payload as { payload?: { payment?: { entity?: { subscription_id?: string } } } }
  )?.payload?.payment?.entity?.subscription_id;
  return paymentSub ?? null;
}

function extractPaymentId(payload: Record<string, unknown>): string | null {
  return (
    (payload as { payload?: { payment?: { entity?: { id?: string } } } })?.payload?.payment?.entity
      ?.id ?? null
  );
}

function extractAmount(payload: Record<string, unknown>): number {
  const amount = (payload as { payload?: { payment?: { entity?: { amount?: number } } } })
    ?.payload?.payment?.entity?.amount;
  return typeof amount === 'number' ? amount : 0;
}

function extractCurrency(payload: Record<string, unknown>): string | null {
  return (
    (payload as { payload?: { payment?: { entity?: { currency?: string } } } })?.payload?.payment
      ?.entity?.currency ?? null
  );
}

function extractRazorpayStatus(payload: Record<string, unknown>): string | null {
  return (
    (payload as { payload?: { subscription?: { entity?: { status?: string } } } })?.payload
      ?.subscription?.entity?.status ?? null
  );
}

function extractCurrentPeriodEnd(payload: Record<string, unknown>): Date | null {
  const end = (
    payload as { payload?: { subscription?: { entity?: { current_end?: number } } } }
  )?.payload?.subscription?.entity?.current_end;
  if (typeof end === 'number') return new Date(end * 1000); // Razorpay uses Unix seconds
  return null;
}

/**
 * Extract target tier from Razorpay subscription notes.
 * E-115's createSubscription stores { tier: 'professional_plus' } in notes.
 */
function extractTargetTier(payload: Record<string, unknown>): PlanTier | null {
  const notes = (
    payload as { payload?: { subscription?: { entity?: { notes?: Record<string, string> } } } }
  )?.payload?.subscription?.entity?.notes;
  if (notes?.tier && ['professional_plus', 'corporate'].includes(notes.tier)) {
    return notes.tier as PlanTier;
  }
  return null;
}

/**
 * Infer tier from the Razorpay plan_id using our server-side configuration.
 * This is more reliable than notes when Razorpay echoes the plan_id in the payload.
 */
function inferTierFromPlanId(payload: Record<string, unknown>): PlanTier | null {
  const planId = (
    payload as { payload?: { subscription?: { entity?: { plan_id?: string } } } }
  )?.payload?.subscription?.entity?.plan_id;
  if (!planId) return null;

  // Reverse-lookup: which tier has this plan_id in our config?
  if (planId === config.RAZORPAY_PLAN_ID_PROFESSIONAL_PLUS) return 'professional_plus';
  if (planId === config.RAZORPAY_PLAN_ID_CORPORATE) return 'corporate';
  return null;
}

/**
 * Infer tier from the plan amount when notes are not available.
 * Professional+ = 299900 paise, Corporate = 799900 paise.
 */
function inferTierFromPlan(payload: Record<string, unknown>): PlanTier | null {
  // Try payment amount as a fallback
  const amount = extractAmount(payload);
  if (amount === 299900) return 'professional_plus';
  if (amount === 799900) return 'corporate';
  return null;
}
