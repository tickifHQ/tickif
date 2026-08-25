import { eq, sql } from 'drizzle-orm';
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

    // TODO: resolve isVerified from organization's verification status
    // For now, default to false. E-119 spec says:
    //   canDisplayVerifiedBadge = isVerified() && tier >= professional_plus && state NOT IN {locked, downgraded}
    // The isVerified check will be wired when the verification module exposes it.
    const isVerified = false;

    const response: SubscriptionResponse = {
      tier,
      lifecycleState: state,
      razorpayStatus: subscription.razorpayStatus,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
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

/** Count projects (branches) for the organization's designer profile. */
async function countBranches(organizationId: string): Promise<number> {
  const [profile] = await db
    .select({ id: schema.designerProfile.id })
    .from(schema.designerProfile)
    .where(eq(schema.designerProfile.orgId, organizationId))
    .limit(1);

  if (!profile) return 0;

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.project)
    .where(eq(schema.project.designerId, profile.id));
  return result?.count ?? 0;
}
