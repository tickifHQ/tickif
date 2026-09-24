import { PLAN_TIER_VALUES, type PlanTier } from '@repo/contracts';

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
