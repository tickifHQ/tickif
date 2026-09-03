import { z } from 'zod';
import { type PlanTier, type SubscriptionState, planTierSchema, subscriptionStateSchema } from './billing';

/**
 * E-119 Entitlement reads — tier × lifecycleState → feature map.
 *
 * Source of truth: Phase 2 Plans/Entitlements/RBAC v2 implementation spec (14 Aug rewrite).
 * The entitlement surface is two-dimensional: (planTier, subscriptionState).
 * Never read tier without considering lifecycle state.
 *
 * Lifecycle behavior:
 *   active         → full tier entitlements
 *   payment_failed → preserve full entitlements (retries ongoing)
 *   grace          → preserve full entitlements (7-day grace period)
 *   locked         → suspend paid features; public pages stay live
 *   downgraded     → Hobby entitlements (planTier is already 'hobby' in schema)
 */

// ─── Entitlement Value Types ─────────────────────────────────────────────────

export const ANALYTICS_SCOPE = {
  BASIC: 'basic',
  BRANCH: 'branch',
} as const;

export const ANALYTICS_SCOPE_VALUES = [ANALYTICS_SCOPE.BASIC, ANALYTICS_SCOPE.BRANCH] as const;
export const analyticsScopeSchema = z.enum(ANALYTICS_SCOPE_VALUES).meta({ id: 'AnalyticsScope' });
export type AnalyticsScope = z.infer<typeof analyticsScopeSchema>;

// ─── Entitlement Constants (from Phase 2 spec) ──────────────────────────────

/** Seat limit per tier. -1 = unlimited. */
export const SEAT_LIMIT: Record<PlanTier, number> = {
  hobby: 1,
  professional_plus: 1,
  corporate: -1, // Infinity
};

/** Branch limit per tier. -1 = unlimited. */
export const BRANCH_LIMIT: Record<PlanTier, number> = {
  hobby: 1,
  professional_plus: 1,
  corporate: -1, // Infinity
};

/** Whether RBAC (granular role assignment) is available. */
export const RBAC_ENABLED: Record<PlanTier, boolean> = {
  hobby: false,
  professional_plus: false,
  corporate: true,
};

/** Analytics scope per tier. */
export const ANALYTICS_SCOPE_MAP: Record<PlanTier, AnalyticsScope> = {
  hobby: ANALYTICS_SCOPE.BASIC,
  professional_plus: ANALYTICS_SCOPE.BASIC,
  corporate: ANALYTICS_SCOPE.BRANCH,
};

/** Ranking tier (numeric rank: higher = better placement). */
export const RANKING_TIER: Record<PlanTier, number> = {
  hobby: 0,
  professional_plus: 1,
  corporate: 2,
};

/** Directory top placement — Corporate only. */
export const DIRECTORY_TOP_PLACEMENT: Record<PlanTier, boolean> = {
  hobby: false,
  professional_plus: false,
  corporate: true,
};

// ─── Entitlement Resolution Functions ────────────────────────────────────────

/**
 * Whether the lifecycle state suspends paid features.
 * locked = suspended; all other states preserve entitlements.
 * (downgraded is handled by planTier already being 'hobby' in the schema.)
 */
function isSuspended(state: SubscriptionState): boolean {
  return state === 'locked';
}

export function seatLimit(tier: PlanTier, state: SubscriptionState): number {
  if (isSuspended(state)) return SEAT_LIMIT.hobby;
  return SEAT_LIMIT[tier];
}

export function branchLimit(tier: PlanTier, state: SubscriptionState): number {
  if (isSuspended(state)) return BRANCH_LIMIT.hobby;
  return BRANCH_LIMIT[tier];
}

export function rbacEnabled(tier: PlanTier, state: SubscriptionState): boolean {
  if (isSuspended(state)) return RBAC_ENABLED.hobby;
  return RBAC_ENABLED[tier];
}

export function analyticsScope(tier: PlanTier, state: SubscriptionState): AnalyticsScope {
  if (isSuspended(state)) return ANALYTICS_SCOPE_MAP.hobby;
  return ANALYTICS_SCOPE_MAP[tier];
}

export function rankingTier(tier: PlanTier, state: SubscriptionState): number {
  if (isSuspended(state)) return RANKING_TIER.hobby;
  return RANKING_TIER[tier];
}

export function directoryTopPlacement(tier: PlanTier, state: SubscriptionState): boolean {
  if (isSuspended(state)) return DIRECTORY_TOP_PLACEMENT.hobby;
  return DIRECTORY_TOP_PLACEMENT[tier];
}

/**
 * Verified badge eligibility:
 *   isVerified() && tier >= professional_plus && state NOT IN {locked, downgraded}
 *
 * Note: `isVerified` is resolved at call time from the org's verification status.
 * This function only evaluates the tier/state portion of the rule.
 */
export function canDisplayVerifiedBadge(
  tier: PlanTier,
  state: SubscriptionState,
  isVerified: boolean,
): boolean {
  if (!isVerified) return false;
  if (state === 'locked' || state === 'downgraded') return false;
  return tier === 'professional_plus' || tier === 'corporate';
}

/**
 * Resolve all entitlements for a given (tier, state) pair.
 * Returns the complete entitlement object for the API response.
 */
export function resolveEntitlements(
  tier: PlanTier,
  state: SubscriptionState,
  isVerified: boolean = false,
) {
  return {
    seatLimit: seatLimit(tier, state),
    branchLimit: branchLimit(tier, state),
    rbacEnabled: rbacEnabled(tier, state),
    analyticsScope: analyticsScope(tier, state),
    rankingTier: rankingTier(tier, state),
    directoryTopPlacement: directoryTopPlacement(tier, state),
    canDisplayVerifiedBadge: canDisplayVerifiedBadge(tier, state, isVerified),
  };
}

// ─── Response Schema ─────────────────────────────────────────────────────────

export const entitlementsObjectSchema = z
  .object({
    seatLimit: z.number().int(),
    branchLimit: z.number().int(),
    rbacEnabled: z.boolean(),
    analyticsScope: analyticsScopeSchema,
    rankingTier: z.number().int().min(0).max(2),
    directoryTopPlacement: z.boolean(),
    canDisplayVerifiedBadge: z.boolean(),
  })
  .meta({ id: 'Entitlements' });

/** A resource preserved-but-frozen while a subscription is downgraded (E-239). */
export const frozenResourceSchema = z
  .object({
    kind: z.enum(['seat', 'branch']),
    label: z.string(),
    count: z.number().int().min(0),
  })
  .meta({ id: 'FrozenResource' });
export type FrozenResource = z.infer<typeof frozenResourceSchema>;

export const subscriptionResponseSchema = z
  .object({
    tier: planTierSchema,
    lifecycleState: subscriptionStateSchema,
    preLapseTier: planTierSchema.nullable(),
    razorpayStatus: z.string().nullable(),
    currentPeriodEnd: z.string().datetime().nullable(),
    cancellationScheduled: z.boolean(),
    seatUsage: z.number().int().min(0),
    branchUsage: z.number().int().min(0),
    entitlements: entitlementsObjectSchema,
    // ─── E-239 plan-lapse lifecycle fields ───
    /** Whole days left in the grace window before lock. Null unless state = 'grace'. */
    graceDaysRemaining: z.number().int().min(0).nullable(),
    /** Whole days left in the locked window before downgrade. Null unless state = 'locked'. */
    lockedDaysRemaining: z.number().int().min(0).nullable(),
    /** Resources preserved-but-frozen while downgraded. */
    frozenResources: z.array(frozenResourceSchema),
  })
  .meta({ id: 'SubscriptionResponse' });
export type SubscriptionResponse = z.infer<typeof subscriptionResponseSchema>;
