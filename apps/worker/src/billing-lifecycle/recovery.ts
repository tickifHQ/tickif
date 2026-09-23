import { config } from '@repo/config';
import type { RazorpaySubscription } from '@repo/contracts';
import { fetchRecoverySubscription } from './recovery-provider.js';
import { findOpenRecoveryIntents, reconcileRecoveryIntent } from './recovery-repository.js';
import type {
  RecoveryRecord,
  RecoverySubscription,
  RecoveryUpdate,
} from './recovery-repository.js';

const TERMINAL = new Set(['cancelled', 'completed', 'expired']);

function tierForPlan(planId: string) {
  const professional = planId === config.RAZORPAY_PLAN_ID_PROFESSIONAL_PLUS;
  const corporate = planId === config.RAZORPAY_PLAN_ID_CORPORATE;
  if (professional && corporate) return null;
  if (professional) return 'professional_plus';
  if (corporate) return 'corporate';
  return null;
}

export function resolveRecovery(
  intent: RecoveryRecord,
  local: RecoverySubscription | null,
  source: RazorpaySubscription,
  current: RazorpaySubscription | null,
): RecoveryUpdate {
  const pending = (reason: string): RecoveryUpdate => ({
    status: 'requested',
    eligibleAt: null,
    reason,
  });
  if (!local) return pending('subscription_missing');
  if (
    current?.status === 'active' &&
    (current.id === source.id || TERMINAL.has(source.status)) &&
    tierForPlan(current.plan_id) === intent.targetTier &&
    local.planTier === intent.targetTier &&
    local.subscriptionState === 'active'
  ) {
    return { status: 'completed', eligibleAt: null, reason: null };
  }
  if (!TERMINAL.has(source.status)) {
    if (source.cancel_at_cycle_end && source.current_end) {
      return {
        status: 'waiting_for_expiry',
        eligibleAt: new Date(source.current_end * 1000),
        reason: 'cancellation_scheduled',
      };
    }
    return pending('source_subscription_live');
  }
  if (current && current.id !== source.id && !TERMINAL.has(current.status)) {
    const currentTier = tierForPlan(current.plan_id);
    if (
      current.status === 'active' &&
      currentTier &&
      currentTier !== intent.targetTier &&
      local.planTier === currentTier &&
      local.subscriptionState === 'active'
    ) {
      return { status: 'superseded', eligibleAt: null, reason: 'another_plan_activated' };
    }
    if (
      currentTier === intent.targetTier &&
      ['created', 'authenticated', 'active'].includes(current.status)
    ) {
      return { status: 'checkout_pending', eligibleAt: null, reason: 'awaiting_activation' };
    }
    return pending('another_subscription_live');
  }
  return { status: 'eligible', eligibleAt: null, reason: 'source_subscription_terminated' };
}

export async function processBillingRecoverySweep(now: Date) {
  let reconciled = 0;
  let failed = 0;
  const candidates = await findOpenRecoveryIntents(20);
  for (const candidate of candidates) {
    try {
      const changed = await reconcileRecoveryIntent(candidate, now, async (intent, local) => {
        try {
          const source = await fetchRecoverySubscription(intent.sourceSubscriptionId);
          const current = local?.razorpaySubscriptionId
            ? local.razorpaySubscriptionId === source.id
              ? source
              : await fetchRecoverySubscription(local.razorpaySubscriptionId)
            : null;
          return resolveRecovery(intent, local, source, current);
        } catch {
          failed += 1;
          return { status: 'requested', eligibleAt: null, reason: 'provider_unavailable' };
        }
      });
      if (changed) reconciled += 1;
    } catch {
      failed += 1;
      // Do not include provider payloads or credentials in worker logs.
      console.error(`[worker] recovery reconciliation failed for intent ${candidate.id}`);
    }
  }
  return { reconciled, failed };
}
