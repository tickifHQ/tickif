import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '@repo/config';
import {
  ORGANIZATION_CAPABILITY,
  PLAN_TIER_VALUES,
  type BillingChangePreview,
  type BillingMutationRequest,
  type BillingSelectionContext,
  type PlanTier,
} from '@repo/contracts';
import { orgsService } from '../orgs/service.js';
import { AppError } from '../../lib/errors.js';
import { operationRepository } from './operation-repository.js';
import { recoveryService } from './recovery-service.js';
import { subscribeRepository } from './subscribe-repository.js';
import {
  fetchSubscription,
  fetchScheduledChanges,
  fetchPlan,
  resolveRazorpayPlanId,
  resolveTierFromRazorpayPlanId,
} from './razorpay-client.js';

export type BillingCaller = { userId: string; activeOrgId: string | null };
type Reader = Pick<typeof subscribeRepository, 'find'>;
export async function assertBillingAccess(caller: BillingCaller) {
  if (!caller.activeOrgId) throw AppError.unprocessable('No active organization');
  if (
    !(await orgsService.hasCapability(
      caller.userId,
      caller.activeOrgId,
      ORGANIZATION_CAPABILITY.BILLING,
    ))
  )
    throw AppError.forbidden('Organization billing access required');
}
const iso = (seconds: number | null | undefined) =>
  seconds ? new Date(seconds * 1000).toISOString() : null;
function sign(value: string) {
  return createHmac('sha256', config.BETTER_AUTH_SECRET)
    .update(`billing-preview:${value}`)
    .digest('hex');
}

async function snapshot(caller: BillingCaller, reader: Reader = subscribeRepository) {
  const local = await reader.find(caller.activeOrgId!);
  let remote: Awaited<ReturnType<typeof fetchSubscription>> | null = null;
  let unknown = false;
  if (local?.razorpaySubscriptionId) {
    try {
      remote = await fetchSubscription(local.razorpaySubscriptionId);
    } catch {
      unknown = true;
    }
  }
  let scheduledChange: BillingSelectionContext['scheduledChange'] = null;
  if (remote?.has_scheduled_changes) {
    scheduledChange = { targetTier: null, effectiveAt: iso(remote.change_scheduled_at) };
    try {
      const scheduled = await fetchScheduledChanges(remote.id);
      scheduledChange.targetTier = resolveTierFromRazorpayPlanId(scheduled.plan_id);
    } catch {
      unknown = true;
    }
  }
  const currentTier = local?.planTier ?? 'hobby';
  const terminal = !!remote && ['cancelled', 'expired', 'completed'].includes(remote.status);
  const effectiveAt = iso(remote?.current_end);
  const checkout =
    remote && ['created', 'authenticated'].includes(remote.status)
      ? {
          targetTier: resolveTierFromRazorpayPlanId(remote.plan_id),
          status: remote.status,
          razorpaySubscriptionId: remote.id,
        }
      : null;
  const actions: BillingSelectionContext['actions'] = PLAN_TIER_VALUES.map((targetTier) => {
    const result = (
      action: BillingSelectionContext['actions'][number]['action'],
      reason: string | null = null,
    ) => ({ targetTier, action, reason, effectiveAt });
    if (unknown) return result('blocked', 'provider_unavailable');
    if (checkout) {
      if (!checkout.targetTier) return result('blocked', 'unknown_checkout_plan');
      if (checkout.status === 'authenticated') return result('blocked', 'activation_pending');
      return targetTier === checkout.targetTier
        ? result('subscribe')
        : result('blocked', 'unfinished_checkout_conflict');
    }
    if (scheduledChange) return result('blocked', 'scheduled_change_pending');
    if (terminal && currentTier !== 'hobby')
      return result('blocked', 'subscription_refresh_required');
    if (
      remote?.status === 'active' &&
      resolveTierFromRazorpayPlanId(remote.plan_id) !== currentTier
    )
      return result('blocked', 'subscription_refresh_required');
    if (targetTier === currentTier && !terminal) return result('current');
    if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET)
      return result('blocked', 'billing_not_configured');
    if (targetTier !== 'hobby' && !resolveRazorpayPlanId(targetTier))
      return result('blocked', 'plan_not_configured');
    if (!remote && currentTier !== 'hobby')
      return result('blocked', 'subscription_state_unverified');
    if (!remote || terminal)
      return targetTier === 'hobby' ? result('current') : result('subscribe');
    if (remote.status !== 'active' || (local && local.subscriptionState !== 'active'))
      return result('blocked', 'payment_recovery_required');
    if (targetTier === 'hobby')
      return result(
        'cancel',
        local?.cancelAtPeriodEnd || remote.cancel_at_cycle_end ? 'cancellation_scheduled' : null,
      );
    if (local?.cancelAtPeriodEnd || remote.cancel_at_cycle_end)
      return result('recover', 'cancellation_scheduled');
    // A card marker does not establish international-card mandate eligibility.
    // No verified provider quote/cap exists: never submit an unbounded immediate charge.
    return result(
      'recover',
      currentTier === 'professional_plus'
        ? 'amount_authorization_unavailable'
        : 'payment_method_unverified',
    );
  });
  const context: BillingSelectionContext = {
    organizationId: caller.activeOrgId!,
    currentTier,
    sourceSubscriptionId: local?.razorpaySubscriptionId ?? null,
    providerState: unknown ? 'unknown' : 'known',
    actions,
    unfinishedCheckout: checkout,
    recovery: null,
    pendingOperation: null,
    scheduledChange,
  };
  return {
    context,
    local,
    remote,
    revision: sign(JSON.stringify({ local, remote, actions, scheduledChange })),
  };
}

async function buildPreview(caller: BillingCaller, targetTier: PlanTier, reader?: Reader) {
  const state = await snapshot(caller, reader);
  const action = state.context.actions.find((entry) => entry.targetTier === targetTier)!;
  let recurringAmount: number | null = targetTier === 'hobby' ? 0 : null;
  let currency: string | null = targetTier === 'hobby' ? 'INR' : null;
  if (targetTier !== 'hobby') {
    const planId = resolveRazorpayPlanId(targetTier);
    if (planId) {
      try {
        const plan = await fetchPlan(planId);
        if (
          plan.id === planId &&
          plan.period === 'monthly' &&
          plan.interval === 1 &&
          plan.item.currency === 'INR'
        ) {
          recurringAmount = plan.item.amount;
          currency = plan.item.currency;
        }
      } catch {
        /* Unknown pricing stays unknown; provider checkout collects fresh consent. */
      }
    }
  }
  const noCharge = action.action === 'cancel' || action.action === 'recover';
  const preview: Omit<BillingChangePreview, 'expiresAt' | 'previewToken'> = {
    organizationId: state.context.organizationId,
    sourceSubscriptionId: state.context.sourceSubscriptionId,
    currentTier: state.context.currentTier,
    targetTier,
    action: action.action,
    timing:
      action.action === 'subscribe'
        ? 'now'
        : action.action === 'cancel'
          ? 'cycle_end'
          : action.action === 'recover'
            ? 'after_expiry'
            : 'unavailable',
    effectiveAt: action.action === 'subscribe' ? null : action.effectiveAt,
    nextRenewalAt: iso(state.remote?.current_end),
    nextEligibleAction: action.action === 'recover' ? 'subscribe' : null,
    nextEligibleAt: action.action === 'recover' ? action.effectiveAt : null,
    reason: action.reason,
    recurringAmount,
    currency,
    adjustmentAmount: noCharge ? 0 : null,
    adjustmentDirection: noCharge ? 'none' : 'unknown',
    amountCertainty: noCharge ? 'confirmed' : 'unavailable',
    confirmationAllowed:
      ['subscribe', 'cancel', 'recover'].includes(action.action) &&
      state.context.providerState === 'known',
  };
  return { preview, revision: sign(JSON.stringify({ revision: state.revision, preview })) };
}
export const billingSelectionService = {
  async context(caller: BillingCaller) {
    await assertBillingAccess(caller);
    const recovery = await recoveryService.get(caller);
    const state = await snapshot(caller);
    const context = state.context;
    let pending = await operationRepository.findOpenOperation(caller.activeOrgId!);
    let cancellationSource = state.remote;
    if (
      pending?.kind === 'cancel' &&
      pending.sourceSubscriptionId &&
      pending.sourceSubscriptionId !== cancellationSource?.id
    ) {
      try {
        cancellationSource = await fetchSubscription(pending.sourceSubscriptionId);
      } catch {
        cancellationSource = null;
      }
    }
    // A timed-out cancellation can be confirmed by an authoritative fresh fetch.
    // Unknown create outcomes have no safely discoverable provider ID: keep them
    // blocked for support reconciliation instead of risking a duplicate purchase.
    if (
      pending?.kind === 'cancel' &&
      cancellationSource &&
      pending.sourceSubscriptionId === cancellationSource.id &&
      (cancellationSource.cancel_at_cycle_end ||
        (state.local?.razorpaySubscriptionId === cancellationSource.id &&
          state.local.cancelAtPeriodEnd) ||
        ['cancelled', 'completed', 'expired'].includes(cancellationSource.status))
    ) {
      await operationRepository.updateOperation(caller.activeOrgId!, pending.operationId, {
        status: 'scheduled',
        result: {
          operationId: pending.operationId,
          targetTier: pending.targetTier,
          outcome: 'scheduled',
          razorpaySubscriptionId: cancellationSource.id,
          effectiveAt: iso(cancellationSource.current_end),
          currentPeriodEnd: iso(cancellationSource.current_end),
          alreadyCancelled: true,
        },
      });
      pending = undefined;
    }
    if (
      pending?.kind === 'subscribe' &&
      state.remote &&
      resolveTierFromRazorpayPlanId(state.remote.plan_id) === pending.targetTier &&
      ['created', 'authenticated', 'active'].includes(state.remote.status) &&
      (pending.sourceSubscriptionId !== state.remote.id || state.remote.status === 'created')
    ) {
      const active = state.remote.status === 'active';
      await operationRepository.updateOperation(caller.activeOrgId!, pending.operationId, {
        status: active ? 'activated' : 'scheduled',
        result: {
          operationId: pending.operationId,
          targetTier: pending.targetTier,
          outcome: active ? 'activated' : 'processing',
          razorpaySubscriptionId: state.remote.id,
          shortUrl: state.remote.status === 'created' ? state.remote.short_url : null,
          effectiveAt: null,
        },
      });
      pending = undefined;
    }
    if (pending) {
      context.pendingOperation = {
        operationId: pending.operationId,
        targetTier: pending.targetTier,
        status: pending.status,
        reason:
          pending.kind === 'subscribe'
            ? 'provider_outcome_support_required'
            : 'reconciliation_pending',
      };
      context.actions = context.actions.map((action) => ({
        ...action,
        action: 'blocked',
        reason: context.pendingOperation!.reason,
      }));
    }
    return { ...context, ...recovery };
  },
  async preview(
    caller: BillingCaller,
    params: { targetTier: PlanTier },
  ): Promise<BillingChangePreview> {
    await assertBillingAccess(caller);
    const { preview, revision } = await buildPreview(caller, params.targetTier);
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const payload = Buffer.from(
      JSON.stringify({
        organizationId: caller.activeOrgId,
        actorId: caller.userId,
        targetTier: params.targetTier,
        revision,
        expiresAt,
      }),
    ).toString('base64url');
    return { ...preview, expiresAt, previewToken: `${payload}.${sign(payload)}` };
  },
};

export async function validateBillingPreview(
  caller: BillingCaller,
  params: BillingMutationRequest,
  reader?: Reader,
) {
  const stale = () =>
    new AppError(
      'preview_stale',
      'Billing changed or this preview expired. Refresh and review your selection again.',
      409,
    );
  const [payload, signature] = params.previewToken.split('.');
  if (
    !payload ||
    !signature ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    !timingSafeEqual(Buffer.from(sign(payload), 'hex'), Buffer.from(signature, 'hex'))
  )
    throw stale();
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw stale();
  }
  if (
    !decoded ||
    typeof decoded !== 'object' ||
    !('organizationId' in decoded) ||
    !('actorId' in decoded) ||
    !('targetTier' in decoded) ||
    !('expiresAt' in decoded) ||
    !('revision' in decoded)
  )
    throw stale();
  if (
    decoded.organizationId !== caller.activeOrgId ||
    decoded.actorId !== caller.userId ||
    decoded.targetTier !== params.targetTier ||
    typeof decoded.expiresAt !== 'string' ||
    !(Date.parse(decoded.expiresAt) > Date.now())
  )
    throw stale();
  const fresh = await buildPreview(caller, params.targetTier, reader);
  if (decoded.revision !== fresh.revision) throw stale();
  if (!fresh.preview.confirmationAllowed)
    throw new AppError(
      'billing_action_unavailable',
      'This billing action is unavailable. Refresh billing for the next action.',
      409,
    );
  return fresh;
}
