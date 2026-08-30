import { eq, sql, and } from 'drizzle-orm';
import { db, schema } from '@repo/db';
import {
  type PlanTier,
  type SubscriptionState,
  resolveEntitlements,
  type SubscriptionResponse,
} from '@repo/contracts';
import { getCachedEntitlement, setCachedEntitlement } from '../../lib/redis.js';

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
  razorpayStatus: null,
  currentPeriodEnd: null,
  cancellationScheduled: false,
  seatUsage: 0,
  branchUsage: 0,
  entitlements: resolveEntitlements('hobby', 'active', false),
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
    const [subscription] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, caller.activeOrgId))
      .limit(1);

    if (!subscription) {
      return HOBBY_DEFAULT;
    }

    const tier = subscription.planTier as PlanTier;
    const state = subscription.subscriptionState as SubscriptionState;

    // Resolve isVerified from the org's verification application.
    // An org is verified when their application status is 'verified' and not expired.
    const isVerified = await checkOrgVerified(caller.activeOrgId);

    const response: SubscriptionResponse = {
      tier,
      lifecycleState: state,
      razorpayStatus: subscription.razorpayStatus,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      cancellationScheduled: subscription.razorpayStatus === 'cancelled' && tier !== 'hobby',
      seatUsage: await countSeats(caller.activeOrgId),
      branchUsage: await countBranches(caller.activeOrgId),
      entitlements: resolveEntitlements(tier, state, isVerified),
    };

    // Cache the response
    await setCachedEntitlement(caller.activeOrgId, JSON.stringify(response));

    return response;
  },
};


// ─── Usage Count Helpers ─────────────────────────────────────────────────────

/** Count active members (seats) for the organization. */
async function countSeats(organizationId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.member)
    .where(eq(schema.member.organizationId, organizationId));
  return result?.count ?? 0;
}

/** Count branches (designer profiles) for the organization. */
async function countBranches(organizationId: string): Promise<number> {
  // A "branch" is a designer profile / studio under the organization.
  // Currently 1:1 (unique constraint on orgId), but future E-244 may allow multiple.
  // This intentionally counts profiles, NOT projects — projects are unlimited.
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.designerProfile)
    .where(eq(schema.designerProfile.orgId, organizationId));
  return result?.count ?? 0;
}


/**
 * Check whether the organization has a verified (and non-expired) verification application.
 * Returns true only when status = 'verified' AND expiresAt is in the future.
 */
async function checkOrgVerified(organizationId: string): Promise<boolean> {
  const [app] = await db
    .select({ status: schema.verificationApplication.status })
    .from(schema.verificationApplication)
    .where(
      and(
        eq(schema.verificationApplication.organizationId, organizationId),
        eq(schema.verificationApplication.status, 'verified'),
        sql`${schema.verificationApplication.expiresAt} > NOW()`,
      ),
    )
    .limit(1);
  return !!app;
}
