import { createHmac, timingSafeEqual } from 'node:crypto';
import { subscribeRepository, type SubscriptionUpdate } from './subscribe-repository.js';
import {
  ORGANIZATION_CAPABILITY,
  type PlanTier,
  type BillingVerifyRequest,
  type BillingPaymentsResponse,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import {
  createSubscription,
  updateSubscription,
  cancelSubscription,
  fetchSubscription,
  hasPaidPlan,
  resolveRazorpayPlanId,
} from './razorpay-client.js';
import { config } from '@repo/config';
import { invalidateEntitlementCache } from '../../lib/redis.js';
import { orgsService } from '../orgs/service.js';

/**
 * E-115 Subscribe service — business logic for subscription creation and plan changes.
 *
 * Security:
 * - Resolves Razorpay plan ID server-side (never trusts client-supplied plan IDs)
 * - Verifies the caller has the live organization billing capability
 * - Uses DB unique constraint on organization_id for idempotency
 *
 * Does NOT handle:
 * - Webhook processing (E-117)
 * - Lifecycle state transitions (E-117/E-239)
 * - Entitlement reads (E-119)
 */

type Caller = { userId: string; activeOrgId: string | null };

async function assertOrgBillingAccess(caller: Caller): Promise<void> {
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

async function withBillingUpdate<T>(
  organizationId: string,
  action: Parameters<typeof subscribeRepository.withOrganizationLock<T>>[1],
): Promise<T> {
  const result = await subscribeRepository.withOrganizationLock(organizationId, action);
  // Evict after commit, so a concurrent cache reader cannot repopulate old state.
  await invalidateEntitlementCache(organizationId);
  return result;
}

export const subscribeService = {
  async paymentMethod(
    caller: Caller,
  ): Promise<{ razorpaySubscriptionId: string; shortUrl: string | null }> {
    assertBillingConfigured();
    await assertOrgBillingAccess(caller);
    return withBillingUpdate(caller.activeOrgId!, async (repository) => {
      const subscription = await repository.find(caller.activeOrgId!);
      if (!subscription?.razorpaySubscriptionId)
        throw AppError.notFound('No subscription to update. Choose a paid plan.');
      const remote = await fetchSubscription(subscription.razorpaySubscriptionId);
      if (!['active', 'pending', 'halted'].includes(remote.status)) {
        throw AppError.conflict(
          'This subscription cannot update its payment method. Refresh billing and choose a plan if it has ended.',
        );
      }
      return {
        razorpaySubscriptionId: subscription.razorpaySubscriptionId,
        shortUrl: remote.short_url,
      };
    });
  },

  async payments(
    caller: Caller,
    query: { offset: number; limit: number },
  ): Promise<BillingPaymentsResponse> {
    await assertOrgBillingAccess(caller);
    const rows = await subscribeRepository.payments(
      caller.activeOrgId!,
      query.offset,
      query.limit + 1,
    );
    return {
      items: rows
        .slice(0, query.limit)
        .map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() })),
      nextOffset: rows.length > query.limit ? query.offset + query.limit : null,
    };
  },
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
    await assertOrgBillingAccess(caller);

    if (!hasPaidPlan(params.targetTier)) {
      throw AppError.unprocessable('Cannot create a Razorpay subscription for Hobby tier');
    }

    // Server-side plan resolution — never trust client
    const razorpayPlanId = resolveRazorpayPlanId(params.targetTier);
    if (!razorpayPlanId) {
      throw AppError.unprocessable(`Razorpay plan not configured for tier: ${params.targetTier}`);
    }

    // Use a transaction with row-level locking to serialize concurrent subscribe
    // requests for the same organization. This prevents the race where two requests
    // both pass the "no existing subscription" check and both call Razorpay.
    return withBillingUpdate(caller.activeOrgId!, async (repository) => {
      const existing = await repository.find(caller.activeOrgId!);

      // Never infer abandonment from local status. In particular, Razorpay's
      // `authenticated` status means the authorization transaction completed and
      // replacing that ID can orphan a valid subscription. Reconcile the existing
      // ID with Razorpay before deciding whether it is safe to create another one.
      if (existing?.razorpaySubscriptionId) {
        let remoteSubscription;
        try {
          remoteSubscription = await fetchSubscription(existing.razorpaySubscriptionId);
        } catch {
          throw AppError.conflict(
            'An existing checkout could not be verified. Retry shortly or contact support.',
          );
        }

        if (remoteSubscription.status === 'created' && existing.planTier === 'hobby') {
          const checkoutTier =
            inferTierFromConfig(remoteSubscription.plan_id) ??
            inferTierFromNotes(remoteSubscription.notes);
          if (checkoutTier && checkoutTier !== params.targetTier) {
            throw AppError.conflict(
              'A checkout for another plan is already open. Complete or expire it before changing plans.',
            );
          }

          if (existing.razorpayStatus !== remoteSubscription.status) {
            await repository.update(existing.id, { razorpayStatus: remoteSubscription.status });
          }

          return {
            razorpaySubscriptionId: remoteSubscription.id,
            shortUrl: remoteSubscription.short_url,
          };
        }

        const terminalStatuses = new Set(['cancelled', 'completed', 'expired']);
        const isExplicitRecovery =
          existing.subscriptionState === 'locked' || existing.subscriptionState === 'downgraded';
        const recoverableStatuses = terminalStatuses;
        const canReplace =
          (existing.planTier === 'hobby' && terminalStatuses.has(remoteSubscription.status)) ||
          (isExplicitRecovery && recoverableStatuses.has(remoteSubscription.status));
        if (!canReplace) {
          throw AppError.conflict(
            'Organization already has a live Razorpay subscription. Complete checkout or use change-plan instead.',
          );
        }
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
        await repository.update(existing.id, {
          razorpaySubscriptionId: razorpaySub.id,
          razorpayStatus: razorpaySub.status,
        });
      } else {
        await repository.create({
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
   * Only callers with organization billing access can change plans.
   */
  async changePlan(
    caller: Caller,
    params: { targetTier: PlanTier },
  ): Promise<{ razorpaySubscriptionId: string }> {
    assertBillingConfigured();
    await assertOrgBillingAccess(caller);

    if (!hasPaidPlan(params.targetTier)) {
      throw AppError.unprocessable('Cannot change to Hobby via Razorpay. Use cancellation.');
    }

    // Server-side plan resolution
    const razorpayPlanId = resolveRazorpayPlanId(params.targetTier);
    if (!razorpayPlanId) {
      throw AppError.unprocessable(`Razorpay plan not configured for tier: ${params.targetTier}`);
    }

    return withBillingUpdate(caller.activeOrgId!, async (repository) => {
      // Find existing subscription
      const subscription = await repository.find(caller.activeOrgId!);

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

      if (subscription.cancelAtPeriodEnd) {
        throw AppError.conflict(
          'Cancellation is already scheduled. Wait until the current period ends.',
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
      await repository.update(subscription.id, {
        razorpayStatus: updated.status,
      });

      return { razorpaySubscriptionId: subscription.razorpaySubscriptionId };
    });
  },

  /**
   * Cancel a paid subscription — transitions to Hobby at cycle end.
   *
   * Calls Razorpay's cancel API with cancel_at_cycle_end=true.
   * The local planTier is NOT changed here — E-117 will process the
   * subscription.cancelled webhook and transition to active+hobby.
   *
   * Only callers with organization billing access can cancel.
   */
  async cancelSubscription(caller: Caller): Promise<{
    razorpaySubscriptionId: string;
    alreadyCancelled: boolean;
    currentPeriodEnd: string | null;
  }> {
    assertBillingConfigured();
    await assertOrgBillingAccess(caller);

    return withBillingUpdate(caller.activeOrgId!, async (repository) => {
      const subscription = await repository.find(caller.activeOrgId!);

      if (!subscription?.razorpaySubscriptionId) {
        throw AppError.notFound('No active Razorpay subscription found for this organization');
      }

      if (subscription.planTier === 'hobby') {
        throw AppError.unprocessable('Already on the Hobby plan');
      }

      // A scheduled cancellation is local lifecycle metadata, separate from
      // Razorpay's raw status (which remains `active` until the cycle ends).
      if (subscription.cancelAtPeriodEnd) {
        return {
          razorpaySubscriptionId: subscription.razorpaySubscriptionId,
          alreadyCancelled: true,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        };
      }

      // Cancel at cycle end — subscription stays active until the period ends.
      // Razorpay sends subscription.cancelled webhook when the period expires.
      const cancelled = await cancelSubscription({
        subscriptionId: subscription.razorpaySubscriptionId,
        cancelAtCycleEnd: true,
      });

      // Preserve Razorpay's actual status and record the scheduled transition in
      // its own column. This keeps reconciliation able to observe the later
      // active -> cancelled transition even when the webhook is missed.
      await repository.update(subscription.id, {
        razorpayStatus: cancelled.status,
        cancelAtPeriodEnd: true,
      });

      // Invalidate entitlement cache so GET /subscription reflects cancellationScheduled: true.

      return {
        razorpaySubscriptionId: subscription.razorpaySubscriptionId,
        alreadyCancelled: false,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      };
    });
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
    params: BillingVerifyRequest,
  ): Promise<{ verified: boolean }> {
    assertBillingConfigured();
    await assertOrgBillingAccess(caller);

    if (!caller.activeOrgId) {
      throw AppError.unprocessable('No active organization');
    }

    return withBillingUpdate(caller.activeOrgId!, async (repository) => {
      // Verify signature: HMAC-SHA256(razorpay_payment_id + '|' + razorpay_subscription_id, key_secret)
      const expectedSignature = createHmac('sha256', config.RAZORPAY_KEY_SECRET!)
        .update(`${params.razorpayPaymentId}|${params.razorpaySubscriptionId}`)
        .digest('hex');

      if (
        !/^[a-f0-9]{64}$/i.test(params.razorpaySignature) ||
        !timingSafeEqual(
          Buffer.from(expectedSignature, 'hex'),
          Buffer.from(params.razorpaySignature, 'hex'),
        )
      ) {
        throw AppError.badRequest('Invalid payment signature');
      }

      // Signature valid — update razorpayStatus to acknowledge payment.
      // Do NOT change planTier here. The webhook is authoritative for activation.
      const subscription = await repository.find(caller.activeOrgId!);

      if (!subscription || subscription.razorpaySubscriptionId !== params.razorpaySubscriptionId) {
        throw AppError.forbidden('Payment does not belong to the active organization');
      }
      await repository.acknowledgePayment(subscription.id, params.razorpaySubscriptionId);

      return { verified: true };
    });
  },

  /**
   * Refresh local subscription state by querying Razorpay's live API.
   *
   * Self-healing path: reconciles local DB when webhooks were missed/delayed.
   * E-117 webhooks remain the primary event-driven update mechanism.
   *
   * Razorpay status → local state mapping:
   *   created      → no change (checkout not completed)
   *   authenticated → no change (authorization only, not yet charged)
   *   active       → planTier from plan_id/notes, subscriptionState=active, razorpayStatus=active
   *   pending      → subscriptionState=payment_failed, razorpayStatus=pending
   *   halted       → subscriptionState=grace, razorpayStatus=halted
   *   cancelled    → planTier=hobby, subscriptionState=active, razorpayStatus=cancelled
   *   completed    → planTier=hobby, subscriptionState=active, razorpayStatus=completed
   *   expired      → planTier=hobby, subscriptionState=active, razorpayStatus=expired
   *
   * Idempotent: if local state already matches, no writes occur.
   */
  async refreshSubscription(
    caller: Caller,
  ): Promise<{ reconciled: boolean; razorpayStatus: string | null }> {
    if (!caller.activeOrgId) {
      return { reconciled: false, razorpayStatus: null };
    }

    await assertOrgBillingAccess(caller);
    return withBillingUpdate(caller.activeOrgId, async (repository) => {
      const subscription = await repository.find(caller.activeOrgId!);

      if (!subscription?.razorpaySubscriptionId) {
        return { reconciled: false, razorpayStatus: null };
      }

      // If credentials aren't configured, skip gracefully
      if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) {
        return { reconciled: false, razorpayStatus: subscription.razorpayStatus };
      }

      let rzpSub;
      try {
        rzpSub = await fetchSubscription(subscription.razorpaySubscriptionId);
      } catch {
        // Razorpay API failure — return current local state, don't corrupt DB
        return { reconciled: false, razorpayStatus: subscription.razorpayStatus };
      }

      const terminalStatuses = new Set(['cancelled', 'completed', 'expired']);
      // Terminal statuses must always pass through the state transition below. This
      // also repairs rows written by older code that stored `cancelled` before the
      // subscription had actually ended.
      if (
        subscription.razorpayStatus === rzpSub.status &&
        !terminalStatuses.has(rzpSub.status) &&
        !(
          rzpSub.status === 'active' &&
          (subscription.subscriptionState !== 'active' ||
            subscription.planTier !==
              (inferTierFromConfig(rzpSub.plan_id) ??
                inferTierFromNotes(rzpSub.notes) ??
                subscription.planTier) ||
            subscription.currentPeriodEnd?.getTime() !==
              (rzpSub.current_end ? rzpSub.current_end * 1000 : undefined))
        ) &&
        (rzpSub.cancel_at_cycle_end === undefined ||
          subscription.cancelAtPeriodEnd === rzpSub.cancel_at_cycle_end)
      ) {
        return { reconciled: false, razorpayStatus: rzpSub.status };
      }

      // Reconcile based on Razorpay's live status
      const updates: SubscriptionUpdate = {
        razorpayStatus: rzpSub.status,
      };

      switch (rzpSub.status) {
        case 'active': {
          // Subscription is active — resolve the tier from plan_id or notes
          const tier =
            inferTierFromConfig(rzpSub.plan_id) ?? inferTierFromNotes(rzpSub.notes) ?? null;
          if (tier && subscription.planTier !== tier) {
            updates.planTier = tier;
          }
          updates.subscriptionState = 'active';
          if (rzpSub.cancel_at_cycle_end !== undefined) {
            updates.cancelAtPeriodEnd = rzpSub.cancel_at_cycle_end;
          }
          updates.currentPeriodEnd = rzpSub.current_end
            ? new Date(rzpSub.current_end * 1000)
            : undefined;

          // Clear any lapse fields (reactivation)
          if (subscription.subscriptionState !== 'active') {
            updates.graceStartedAt = null;
            updates.lockedAt = null;
            updates.downgradedAt = null;
            updates.preLapseTier = null;
          }
          break;
        }
        case 'authenticated':
          // Authorization payment done but not yet charged — keep current state
          updates.razorpayStatus = 'authenticated';
          break;
        case 'pending':
          // Payment pending/retrying
          if (subscription.subscriptionState === 'active') {
            updates.subscriptionState = 'payment_failed';
          }
          break;
        case 'halted':
          // Payment retries exhausted → grace period
          if (
            subscription.subscriptionState === 'active' ||
            subscription.subscriptionState === 'payment_failed'
          ) {
            updates.subscriptionState = 'grace';
            updates.graceStartedAt = subscription.graceStartedAt ?? new Date();
            updates.preLapseTier = (subscription.planTier as PlanTier) ?? undefined;
          }
          break;
        case 'cancelled':
        case 'completed':
        case 'expired':
          // Terminal — revert to hobby
          if (subscription.planTier !== 'hobby') {
            updates.planTier = 'hobby';
          }
          updates.subscriptionState = 'active';
          updates.razorpaySubscriptionId = null;
          updates.cancelAtPeriodEnd = false;
          updates.currentPeriodEnd = null;
          updates.graceStartedAt = null;
          updates.lockedAt = null;
          updates.downgradedAt = null;
          updates.preLapseTier = null;
          break;
        default:
          // Unknown status — just update razorpayStatus
          break;
      }

      await repository.update(subscription.id, updates);

      return { reconciled: true, razorpayStatus: rzpSub.status };
    });
  },
};

// ─── Reconciliation Helpers ──────────────────────────────────────────────────

function inferTierFromConfig(planId: string): PlanTier | null {
  if (planId === config.RAZORPAY_PLAN_ID_PROFESSIONAL_PLUS) return 'professional_plus';
  if (planId === config.RAZORPAY_PLAN_ID_CORPORATE) return 'corporate';
  return null;
}

function inferTierFromNotes(notes?: Record<string, string>): PlanTier | null {
  if (notes?.tier && ['professional_plus', 'corporate'].includes(notes.tier)) {
    return notes.tier as PlanTier;
  }
  return null;
}
