import { claimEarlyBird, earlyBirdStatus, expireEarlyBird } from '@repo/billing';
import type { EarlyBirdTier } from '@repo/contracts';
import { assertBillingAccess, type BillingCaller } from './selection-service.js';
import { invalidateEntitlementCache } from '../../lib/redis.js';
import { AppError } from '../../lib/errors.js';

export const earlyBirdService = {
  async status(caller: BillingCaller) {
    await assertBillingAccess(caller);
    if (await expireEarlyBird(caller.activeOrgId!))
      await invalidateEntitlementCache(caller.activeOrgId!);
    return earlyBirdStatus(caller.activeOrgId!);
  },
  async claim(caller: BillingCaller, tier: EarlyBirdTier) {
    await assertBillingAccess(caller);
    const trial = await claimEarlyBird(caller.activeOrgId!, tier);
    if (!trial)
      throw AppError.conflict('This organization is not eligible for a new early-bird trial.');
    await invalidateEntitlementCache(caller.activeOrgId!);
    return { eligible: false, trial };
  },
};
