import { describe, it, expect, vi } from 'vitest';
import { db, schema } from '@repo/db';
import { makeOrganization, makeSubscription, makeUser } from '@repo/db/testing';

// Mock Redis to avoid requiring a live Redis connection in CI integration tests.
// The service falls through to DB when Redis returns null (cache miss).
vi.mock('../../../src/lib/redis.js', () => ({
  getCachedEntitlement: vi.fn().mockResolvedValue(null),
  setCachedEntitlement: vi.fn().mockResolvedValue(undefined),
  invalidateEntitlementCache: vi.fn().mockResolvedValue(undefined),
  closeRedisCache: vi.fn().mockResolvedValue(undefined),
}));

const { entitlementService } = await import(
  '../../../src/modules/billing/entitlement-service.js'
);

/**
 * E-119 Entitlement service integration tests.
 *
 * Tests the real service against PostgreSQL with mocked Redis (always cache miss).
 * Verifies that the correct entitlements are returned for each subscription state.
 */

async function makeOrgWithOwner() {
  const user = await makeUser();
  const org = await makeOrganization();
  await db.insert(schema.member).values({
    id: `mbr_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    organizationId: org.id,
    userId: user.id,
    role: 'owner',
    createdAt: new Date(),
  });
  return { user, org };
}

describe('E-119: entitlement service integration', () => {
  it('returns Hobby defaults when no subscription exists', async () => {
    const { user, org } = await makeOrgWithOwner();

    const result = await entitlementService.getSubscription({
      userId: user.id,
      activeOrgId: org.id,
    });

    expect(result.tier).toBe('hobby');
    expect(result.lifecycleState).toBe('active');
    expect(result.entitlements.seatLimit).toBe(1);
    expect(result.entitlements.branchLimit).toBe(1);
    expect(result.entitlements.rbacEnabled).toBe(false);
    expect(result.entitlements.analyticsScope).toBe('basic');
    expect(result.entitlements.rankingTier).toBe(0);
    expect(result.entitlements.directoryTopPlacement).toBe(false);
    expect(result.entitlements.canDisplayVerifiedBadge).toBe(false);
    expect(result.razorpayStatus).toBeNull();
    expect(result.currentPeriodEnd).toBeNull();
    expect(result.seatUsage).toBeGreaterThanOrEqual(0);
    expect(result.branchUsage).toBeGreaterThanOrEqual(0);
  });

  it('returns Hobby defaults when activeOrgId is null', async () => {
    const user = await makeUser();

    const result = await entitlementService.getSubscription({
      userId: user.id,
      activeOrgId: null,
    });

    expect(result.tier).toBe('hobby');
    expect(result.lifecycleState).toBe('active');
  });

  it('returns Professional+ active entitlements', async () => {
    const { user, org } = await makeOrgWithOwner();
    await makeSubscription({
      organizationId: org.id,
      planTier: 'professional_plus',
      subscriptionState: 'active',
    });

    const result = await entitlementService.getSubscription({
      userId: user.id,
      activeOrgId: org.id,
    });

    expect(result.tier).toBe('professional_plus');
    expect(result.lifecycleState).toBe('active');
    expect(result.entitlements.seatLimit).toBe(1);
    expect(result.entitlements.branchLimit).toBe(1);
    expect(result.entitlements.rbacEnabled).toBe(false);
    expect(result.entitlements.analyticsScope).toBe('basic');
    expect(result.entitlements.rankingTier).toBe(1);
    expect(result.entitlements.directoryTopPlacement).toBe(false);
  });

  it('returns Corporate active entitlements', async () => {
    const { user, org } = await makeOrgWithOwner();
    await makeSubscription({
      organizationId: org.id,
      planTier: 'corporate',
      subscriptionState: 'active',
    });

    const result = await entitlementService.getSubscription({
      userId: user.id,
      activeOrgId: org.id,
    });

    expect(result.tier).toBe('corporate');
    expect(result.lifecycleState).toBe('active');
    expect(result.entitlements.seatLimit).toBe(-1);
    expect(result.entitlements.branchLimit).toBe(-1);
    expect(result.entitlements.rbacEnabled).toBe(true);
    expect(result.entitlements.analyticsScope).toBe('branch');
    expect(result.entitlements.rankingTier).toBe(2);
    expect(result.entitlements.directoryTopPlacement).toBe(true);
  });

  it('preserves full entitlements in grace state', async () => {
    const { user, org } = await makeOrgWithOwner();
    await makeSubscription({
      organizationId: org.id,
      planTier: 'corporate',
      preLapseTier: 'corporate',
      subscriptionState: 'grace',
    });

    const result = await entitlementService.getSubscription({
      userId: user.id,
      activeOrgId: org.id,
    });

    expect(result.tier).toBe('corporate');
    expect(result.lifecycleState).toBe('grace');
    // Full corporate entitlements preserved during grace
    expect(result.entitlements.seatLimit).toBe(-1);
    expect(result.entitlements.rbacEnabled).toBe(true);
    expect(result.entitlements.rankingTier).toBe(2);
  });

  it('suspends paid features in locked state', async () => {
    const { user, org } = await makeOrgWithOwner();
    await makeSubscription({
      organizationId: org.id,
      planTier: 'corporate',
      preLapseTier: 'corporate',
      subscriptionState: 'locked',
    });

    const result = await entitlementService.getSubscription({
      userId: user.id,
      activeOrgId: org.id,
    });

    expect(result.tier).toBe('corporate');
    expect(result.lifecycleState).toBe('locked');
    // Locked = suspended to hobby-equivalent
    expect(result.entitlements.seatLimit).toBe(1);
    expect(result.entitlements.branchLimit).toBe(1);
    expect(result.entitlements.rbacEnabled).toBe(false);
    expect(result.entitlements.analyticsScope).toBe('basic');
    expect(result.entitlements.rankingTier).toBe(0);
    expect(result.entitlements.directoryTopPlacement).toBe(false);
  });

  it('returns Hobby entitlements for downgraded state', async () => {
    const { user, org } = await makeOrgWithOwner();
    await makeSubscription({
      organizationId: org.id,
      planTier: 'hobby',
      preLapseTier: 'corporate',
      subscriptionState: 'downgraded',
    });

    const result = await entitlementService.getSubscription({
      userId: user.id,
      activeOrgId: org.id,
    });

    // Downgraded: planTier is already 'hobby' (E-114 CHECK enforces this)
    expect(result.tier).toBe('hobby');
    expect(result.lifecycleState).toBe('downgraded');
    expect(result.entitlements.seatLimit).toBe(1);
    expect(result.entitlements.branchLimit).toBe(1);
    expect(result.entitlements.rbacEnabled).toBe(false);
    expect(result.entitlements.rankingTier).toBe(0);
  });

  it('includes currentPeriodEnd and razorpayStatus from subscription', async () => {
    const { user, org } = await makeOrgWithOwner();
    const periodEnd = new Date('2026-09-25T00:00:00Z');
    await db.insert(schema.subscription).values({
      organizationId: org.id,
      planTier: 'professional_plus',
      subscriptionState: 'active',
      razorpaySubscriptionId: 'sub_period_test',
      razorpayStatus: 'active',
      currentPeriodEnd: periodEnd,
    });

    const result = await entitlementService.getSubscription({
      userId: user.id,
      activeOrgId: org.id,
    });

    expect(result.razorpayStatus).toBe('active');
    expect(result.currentPeriodEnd).toBe('2026-09-25T00:00:00.000Z');
  });
});
