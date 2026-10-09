import { sql } from 'drizzle-orm';
import type { PlanTier } from '@repo/contracts';
import { subscription } from './schema/domain.js';

/** Time-bound local trials must not retain paid access if the sweep is delayed. */
export function effectivePlanTier() {
  return sql<PlanTier>`case when ${subscription.earlyBirdEndsAt} <= now()
    and ${subscription.razorpaySubscriptionId} is null then 'hobby'::plan_tier
    else ${subscription.planTier} end`;
}
