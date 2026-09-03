import {
  type PlanTier,
  type SubscriptionState,
  type FrozenResource,
  resolveEntitlements,
  type SubscriptionResponse,
} from '@repo/contracts';
import { config } from '@repo/config';
import { getCachedEntitlement, setCachedEntitlement } from '../../lib/redis.js';
import { entitlementRepository } from './entitlement-repository.js';
import { daysRemaining } from './lifecycle-time.js';

/**
 * E-119 Entitlement Service.
 *
 * Resolves the current organization's entitlements from their subscription state.
 * Uses Redis-backed caching with webhook-driven invalidation.
 *
 * The entitlement surface is two-dimensional: (planTier, subscriptionState).
 * Never reads tier without considering lifecycle state.
 *
 * Cache invalidation is driven by E-117's webhook handler calling
 * invalidateEntitlementCache() after state/tier transitions.
 *
 * Dependencies:
 * - E-114: subscription schema + lifecycle CHECKs
 * - E-117: webhook handler triggers cache invalidation
 * - E-238: billing_admin role (deferred — not used here)
 */

type Caller = { userId: string; activeOrgId: string | null };

/** Hobby defaults when no subscription exists. */
const HOBBY_DEFAULT: SubscriptionResponse = {
  tier: 'hobby',
  lifecycleState: 'active',
  preLapseTier: null,
  razorpayStatus: null,
  currentPeriodEnd: null,
  cancellationScheduled: false,
  seatUsage: 0,
  branchUsage: 0,
  entitlements: resolveEntitlements('hobby', 'active', false),
  graceDaysRemaining: null,
  lockedDaysRemaining: null,
  frozenResources: [],
};

export const entitlementService = {
  /**
   * Get the current subscription + entitlements for the caller's active organization.
   *
   * Resolution order:
   * 1. Check Redis cache
   * 2. On miss: query subscription table → resolve entitlements → cache → return
   * 3. No subscription row: return Hobby defaults (no caching needed — deterministic)
   */
  async getSubscription(caller: Caller): Promise<SubscriptionResponse> {
    if (!caller.activeOrgId) {
      return HOBBY_DEFAULT;
    }

    // Check Redis cache
    const cached = await getCachedEntitlement(caller.activeOrgId);
    if (cached) {
      try {
        return JSON.parse(cached) as SubscriptionResponse;
      } catch {
        // Corrupt cache — fall through to DB
      }
    }

    // Cache miss — query DB
    const subscription = await entitlementRepository.findSubscription(caller.activeOrgId);

    if (!subscription) {
      return HOBBY_DEFAULT;
    }

    const tier = subscription.planTier as PlanTier;
    const state = subscription.subscriptionState as SubscriptionState;

    // Resolve isVerified from the org's verification application.
    // An org is verified when their application status is 'verified' and not expired.
    const isVerified = await entitlementRepository.isOrganizationVerified(caller.activeOrgId);

    const now = new Date();
    const response: SubscriptionResponse = {
      tier,
      lifecycleState: state,
      preLapseTier: subscription.preLapseTier as PlanTier | null,
      razorpayStatus: subscription.razorpayStatus,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      cancellationScheduled: subscription.cancelAtPeriodEnd && tier !== 'hobby',
      seatUsage: await entitlementRepository.countSeats(caller.activeOrgId),
      branchUsage: await entitlementRepository.countBranches(caller.activeOrgId),
      entitlements: resolveEntitlements(tier, state, isVerified),
      // E-239 lapse counters — derived from lapse timestamps + config windows.
      graceDaysRemaining:
        state === 'grace'
          ? daysRemaining(subscription.graceStartedAt, config.BILLING_GRACE_PERIOD_DAYS, now)
          : null,
      lockedDaysRemaining:
        state === 'locked'
          ? daysRemaining(subscription.lockedAt, config.BILLING_LOCKED_PERIOD_DAYS, now)
          : null,
      // Frozen resources are only relevant once downgraded (seats frozen by E-239 sweep).
      frozenResources: state === 'downgraded' ? await frozenResourcesFor(caller.activeOrgId) : [],
    };

    // Cache the response
    await setCachedEntitlement(caller.activeOrgId, JSON.stringify(response));

    return response;
  },
};

/**
 * Resources preserved-but-frozen while downgraded. Currently seats only —
 * branch freeze follows once E-244 lands the branch table.
 */
async function frozenResourcesFor(organizationId: string): Promise<FrozenResource[]> {
  const frozenSeats = await entitlementRepository.countFrozenSeats(organizationId);
  const resources: FrozenResource[] = [];
  if (frozenSeats > 0) {
    resources.push({ kind: 'seat', label: 'Team Seats', count: frozenSeats });
  }
  return resources;
}
