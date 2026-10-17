import { PLAN_TIER_VALUES, type PlanTier } from '@repo/contracts';
import type { Replacement } from '@repo/billing';

/** A fulfilled upgrade can replace its next renewal without surrendering paid access. */
export function canDowngradeConfirmedUpgrade(
  row: Pick<Replacement, 'status' | 'targetTier' | 'replacementSubscriptionId' | 'periodEnd'>,
  local:
    | {
        planTier: PlanTier;
        subscriptionState: string;
        razorpaySubscriptionId: string | null;
        cancelAtPeriodEnd: boolean;
      }
    | undefined,
  targetTier: PlanTier,
) {
  return (
    row.status === 'confirmed' &&
    row.targetTier === 'corporate' &&
    targetTier === 'professional_plus' &&
    local?.planTier === 'corporate' &&
    local.subscriptionState === 'active' &&
    local.razorpaySubscriptionId === row.replacementSubscriptionId &&
    !local.cancelAtPeriodEnd &&
    row.periodEnd.getTime() > Date.now() + 60_000
  );
}

/** Direction follows the tier contract, independently of prices or provider notes.
 * This is desired timing only; it does not establish mandate eligibility or consent.
 * Hobby purchases use checkout and Hobby downgrades use cancellation.
 */
export function getPlanChangeTiming(
  currentTier: PlanTier,
  targetTier: PlanTier,
): 'now' | 'cycle_end' | null {
  const direction = PLAN_TIER_VALUES.indexOf(targetTier) - PLAN_TIER_VALUES.indexOf(currentTier);
  return direction === 0 ? null : direction > 0 ? 'now' : 'cycle_end';
}
