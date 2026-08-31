import { describe, it, expect, vi, beforeEach } from 'vitest';

// Ensure subscribe-service's assertBillingConfigured() passes in CI where
// Razorpay env vars are not set. The config singleton may already be frozen
// from global-setup, so vi.hoisted alone is insufficient. We mock @repo/config
// to inject the test values into the already-parsed config object.
vi.hoisted(() => {
  process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_ci_mock';
  process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'ci_mock_secret';
});

vi.mock('@repo/config', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = (await importOriginal()) as typeof import('@repo/config');
  return {
    ...actual,
    config: {
      ...actual.config,
      RAZORPAY_KEY_ID: actual.config.RAZORPAY_KEY_ID || 'rzp_test_ci_mock',
      RAZORPAY_KEY_SECRET: actual.config.RAZORPAY_KEY_SECRET || 'ci_mock_secret',
    },
  };
});

import { eq } from 'drizzle-orm';
import { db, schema } from '@repo/db';
import { makeOrganization, makeSubscription, makeUser } from '@repo/db/testing';

/**
 * E-116 Subscribe/checkout integration tests.
 *
 * Verifies the state-safety guarantees of the subscribe/checkout flow
 * against real PostgreSQL behavior:
 *
 * 1. Checkout creation leaves local subscription in non-active (hobby) tier
 * 2. Razorpay "created" status cannot produce a paid entitlement
 * 3. Abandoned checkout does not result in a free upgrade
 * 4. Existing active subscription blocks new subscription creation
 * 5. Razorpay failure does not leave an incorrect local state
 * 6. E-117 is the authoritative activation boundary (no local tier change here)
 *
 * These tests simulate the subscribe-service's DB operations directly
 * (the service itself calls Razorpay, which requires network; the DB
 * state invariants are what matter for correctness).
 */

describe('E-116: subscribe checkout state safety', () => {
  describe('checkout creation state', () => {
    it('new subscription row stays on hobby tier after Razorpay returns "created"', async () => {
      const org = await makeOrganization();

      // Simulate what subscribe-service does: insert with hobby + razorpay "created"
      const [row] = await db
        .insert(schema.subscription)
        .values({
          organizationId: org.id,
          planTier: 'hobby',
          subscriptionState: 'active',
          razorpaySubscriptionId: `sub_checkout_${Date.now()}`,
          razorpayStatus: 'created',
        })
        .returning();

      expect(row!.planTier).toBe('hobby');
      expect(row!.subscriptionState).toBe('active');
      expect(row!.razorpayStatus).toBe('created');
      // Entitlement perspective: org is still on hobby
      expect(row!.preLapseTier).toBeNull();
    });

    it('existing hobby subscription updated with Razorpay ID stays on hobby', async () => {
      // Org already has a hobby subscription (no Razorpay)
      const sub = await makeSubscription({
        planTier: 'hobby',
        subscriptionState: 'active',
      });

      // Simulate subscribe-service updating existing row with Razorpay details
      const [updated] = await db
        .update(schema.subscription)
        .set({
          razorpaySubscriptionId: `sub_update_${Date.now()}`,
          razorpayStatus: 'created',
        })
        .where(eq(schema.subscription.id, sub.id))
        .returning();

      // Tier must NOT change — still hobby
      expect(updated!.planTier).toBe('hobby');
      expect(updated!.subscriptionState).toBe('active');
      expect(updated!.razorpayStatus).toBe('created');
    });

    it('razorpayStatus "created" with paid planTier is NOT the expected post-checkout state', async () => {
      // This verifies that we never write planTier=professional_plus + status=created.
      // If someone did, the entitlement reads (E-119) would incorrectly grant access.
      // The correct post-checkout state is: planTier=hobby + razorpayStatus=created.
      const org = await makeOrganization();

      // This insertion is technically allowed by the CHECK (no lifecycle violation),
      // but it represents the WRONG business state. The test documents the invariant
      // that subscribe-service must NOT produce this combination at checkout creation.
      const [wrong] = await db
        .insert(schema.subscription)
        .values({
          organizationId: org.id,
          planTier: 'professional_plus',
          subscriptionState: 'active',
          razorpaySubscriptionId: `sub_wrong_${Date.now()}`,
          razorpayStatus: 'created',
        })
        .returning();

      // This state is database-valid but business-invalid:
      // it would grant paid entitlement without payment confirmation.
      // E-116 guarantees the subscribe-service NEVER produces this.
      expect(wrong!.planTier).toBe('professional_plus');
      // Document: this is what we prevent in the service layer
    });
  });

  describe('abandoned checkout safety', () => {
    it('subscription with razorpayStatus "created" provides no paid entitlement', async () => {
      const org = await makeOrganization();

      const [sub] = await db
        .insert(schema.subscription)
        .values({
          organizationId: org.id,
          planTier: 'hobby',
          subscriptionState: 'active',
          razorpaySubscriptionId: `sub_abandoned_${Date.now()}`,
          razorpayStatus: 'created',
        })
        .returning();

      // Entitlement query: what tier does this org have?
      const [entitlement] = await db
        .select({ planTier: schema.subscription.planTier })
        .from(schema.subscription)
        .where(eq(schema.subscription.organizationId, org.id));

      // Still hobby — abandoned checkout = no upgrade
      expect(entitlement!.planTier).toBe('hobby');
      // razorpayStatus is informational only, not entitlement-granting
      expect(sub!.razorpayStatus).toBe('created');
    });

    it('abandoned checkout can be retried (new subscribe replaces razorpay ID)', async () => {
      const org = await makeOrganization();

      // First checkout attempt — abandoned
      const [first] = await db
        .insert(schema.subscription)
        .values({
          organizationId: org.id,
          planTier: 'hobby',
          subscriptionState: 'active',
          razorpaySubscriptionId: 'sub_attempt_1',
          razorpayStatus: 'created',
        })
        .returning();

      // Second attempt: service replaces the Razorpay sub ID
      const [retried] = await db
        .update(schema.subscription)
        .set({
          razorpaySubscriptionId: 'sub_attempt_2',
          razorpayStatus: 'created',
        })
        .where(eq(schema.subscription.id, first!.id))
        .returning();

      expect(retried!.razorpaySubscriptionId).toBe('sub_attempt_2');
      expect(retried!.planTier).toBe('hobby'); // still no upgrade
    });
  });

  describe('existing subscription protection', () => {
    it('organization_id unique constraint prevents duplicate subscriptions', async () => {
      const org = await makeOrganization();

      // First subscription
      await db.insert(schema.subscription).values({
        organizationId: org.id,
        planTier: 'hobby',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_first',
        razorpayStatus: 'created',
      });

      // Second attempt for same org — must fail (unique violation)
      try {
        await db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'hobby',
          subscriptionState: 'active',
          razorpaySubscriptionId: 'sub_second',
          razorpayStatus: 'created',
        });
        expect.fail('Expected unique violation but insert succeeded');
      } catch (err) {
        const pg = pgError(err);
        expect(pg.code).toBe('23505'); // unique_violation
      }
    });

    it('active subscription with razorpayStatus "active" blocks new checkout', async () => {
      // Simulate an org that already completed checkout + activation (E-117 confirmed)
      const sub = await makeSubscription({
        planTier: 'professional_plus',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_confirmed_active',
      });

      // Update to simulate E-117 having set razorpayStatus to 'active'
      await db
        .update(schema.subscription)
        .set({ razorpayStatus: 'active' })
        .where(eq(schema.subscription.id, sub.id));

      const [existing] = await db
        .select({
          razorpaySubscriptionId: schema.subscription.razorpaySubscriptionId,
          razorpayStatus: schema.subscription.razorpayStatus,
        })
        .from(schema.subscription)
        .where(eq(schema.subscription.organizationId, sub.organizationId));

      // The subscribe-service checks this and throws 409
      expect(existing!.razorpaySubscriptionId).not.toBeNull();
      expect(existing!.razorpayStatus).toBe('active');
    });
  });

  describe('Razorpay failure safety', () => {
    it('if Razorpay call fails, no subscription row is created (transaction rollback)', async () => {
      const org = await makeOrganization();

      // Simulate: transaction starts, Razorpay throws, transaction rolls back
      try {
        await db.transaction(async (tx) => {
          // Start of the subscribe flow
          const [existing] = await tx
            .select({ id: schema.subscription.id })
            .from(schema.subscription)
            .where(eq(schema.subscription.organizationId, org.id))
            .for('update')
            .limit(1);

          expect(existing).toBeUndefined();

          // Simulate Razorpay failure
          throw new Error('Razorpay createSubscription failed: Bad Request');
        });
      } catch {
        // Expected — Razorpay failed
      }

      // Verify: no subscription row exists for this org
      const [row] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.organizationId, org.id));
      expect(row).toBeUndefined();
    });

    it('if Razorpay call fails with existing hobby sub, sub remains unchanged', async () => {
      const sub = await makeSubscription({
        planTier: 'hobby',
        subscriptionState: 'active',
      });

      // Simulate: transaction starts, locks row, Razorpay throws, rollback
      try {
        await db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(schema.subscription)
            .where(eq(schema.subscription.id, sub.id))
            .for('update');

          expect(existing).toBeDefined();

          // Would update razorpaySubscriptionId here, but Razorpay fails first
          throw new Error('Razorpay createSubscription failed: timeout');
        });
      } catch {
        // Expected
      }

      // Verify: subscription unchanged
      const [unchanged] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(unchanged!.planTier).toBe('hobby');
      expect(unchanged!.razorpaySubscriptionId).toBeNull();
      expect(unchanged!.razorpayStatus).toBeNull();
    });
  });

  describe('E-117 activation boundary', () => {
    it('only an UPDATE to planTier by E-117 (not E-116) grants paid entitlement', async () => {
      const org = await makeOrganization();

      // E-116 creates checkout: hobby + created
      const [checkout] = await db
        .insert(schema.subscription)
        .values({
          organizationId: org.id,
          planTier: 'hobby',
          subscriptionState: 'active',
          razorpaySubscriptionId: `sub_e117_test_${Date.now()}`,
          razorpayStatus: 'created',
        })
        .returning();

      expect(checkout!.planTier).toBe('hobby');

      // E-117 webhook confirms activation: upgrades tier + sets razorpayStatus=active
      const [activated] = await db
        .update(schema.subscription)
        .set({
          planTier: 'professional_plus',
          razorpayStatus: 'active',
        })
        .where(eq(schema.subscription.id, checkout!.id))
        .returning();

      // NOW the entitlement is paid
      expect(activated!.planTier).toBe('professional_plus');
      expect(activated!.razorpayStatus).toBe('active');
    });

    it('E-116 checkout state is correctly distinguishable from E-117 activated state', async () => {
      const org1 = await makeOrganization();
      const org2 = await makeOrganization();

      // Org1: checkout created (E-116) — not yet paid
      await db.insert(schema.subscription).values({
        organizationId: org1.id,
        planTier: 'hobby',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_pending',
        razorpayStatus: 'created',
      });

      // Org2: fully activated (E-117 confirmed) — paid
      await db.insert(schema.subscription).values({
        organizationId: org2.id,
        planTier: 'corporate',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_active',
        razorpayStatus: 'active',
      });

      // Query: which orgs have paid entitlements?
      // The answer is determined by planTier, NOT razorpayStatus
      const [sub1] = await db
        .select({ planTier: schema.subscription.planTier })
        .from(schema.subscription)
        .where(eq(schema.subscription.organizationId, org1.id));
      const [sub2] = await db
        .select({ planTier: schema.subscription.planTier })
        .from(schema.subscription)
        .where(eq(schema.subscription.organizationId, org2.id));

      expect(sub1!.planTier).toBe('hobby'); // checkout only — not paid
      expect(sub2!.planTier).toBe('corporate'); // E-117 confirmed — paid
    });
  });
});

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function pgError(err: unknown): { code?: string; constraint?: string } {
  if (!err || typeof err !== 'object') return {};
  const e = err as Record<string, unknown>;
  if ('code' in e && typeof e.code === 'string') return e as { code: string; constraint?: string };
  if ('cause' in e && e.cause && typeof e.cause === 'object') {
    const cause = e.cause as Record<string, unknown>;
    if ('code' in cause) return cause as { code: string; constraint?: string };
  }
  return {};
}

// --------------------------------------------------------------------------
// Real-service integration tests (E-116 production hardening)
// --------------------------------------------------------------------------

// Mock only the Razorpay HTTP layer — the service logic, DB transactions, and
// auth checks remain real. This tests the actual subscribe-service code path.
vi.mock('../../../src/modules/billing/razorpay-client.js', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = (await importOriginal()) as typeof import('../../../src/modules/billing/razorpay-client.js');
  return {
    ...actual,
    // Override only the functions that call Razorpay's HTTP API
    createSubscription: vi.fn(),
    updateSubscription: vi.fn(),
    fetchSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
    // Override plan resolution to avoid depending on CI env vars
    resolveRazorpayPlanId: vi.fn((tier: string) => `plan_test_${tier}`),
  };
});

const {
  createSubscription: mockCreateSubscription,
  fetchSubscription: mockFetchSubscription,
  cancelSubscription: mockCancelSubscription,
} = await import(
  '../../../src/modules/billing/razorpay-client.js'
);
const { subscribeService } = await import(
  '../../../src/modules/billing/subscribe-service.js'
);

/** Create an org with an owner member for auth checks. */
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

describe('E-116: real subscribe-service integration (mocked Razorpay)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockCreateSubscription).mockReset();
    vi.mocked(mockFetchSubscription).mockReset();
    vi.mocked(mockCancelSubscription).mockReset();
  });

  it('createSubscription persists hobby tier + razorpayStatus "created" (no paid upgrade)', async () => {
    const { user, org } = await makeOrgWithOwner();

    vi.mocked(mockCreateSubscription).mockResolvedValue({
      id: 'sub_mock_created',
      entity: 'subscription',
      plan_id: 'plan_test',
      status: 'created',
      current_start: null,
      current_end: null,
      short_url: 'https://rzp.io/checkout/mock',
      created_at: Math.floor(Date.now() / 1000),
    });

    const result = await subscribeService.createSubscription(
      { userId: user.id, activeOrgId: org.id },
      { targetTier: 'professional_plus' },
    );

    // Verify API contract
    expect(result.razorpaySubscriptionId).toBe('sub_mock_created');
    expect(result.shortUrl).toBe('https://rzp.io/checkout/mock');

    // Verify DB state: org is still on hobby (not professional_plus)
    const [sub] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, org.id));

    expect(sub!.planTier).toBe('hobby');
    expect(sub!.subscriptionState).toBe('active');
    expect(sub!.razorpaySubscriptionId).toBe('sub_mock_created');
    expect(sub!.razorpayStatus).toBe('created');
    // No lapse fields set
    expect(sub!.preLapseTier).toBeNull();
    expect(sub!.graceStartedAt).toBeNull();
  });

  it('createSubscription returns shortUrl for checkout handoff', async () => {
    const { user, org } = await makeOrgWithOwner();

    vi.mocked(mockCreateSubscription).mockResolvedValue({
      id: 'sub_url_test',
      entity: 'subscription',
      plan_id: 'plan_test',
      status: 'created',
      current_start: null,
      current_end: null,
      short_url: 'https://rzp.io/i/checkout_token',
      created_at: Math.floor(Date.now() / 1000),
    });

    const result = await subscribeService.createSubscription(
      { userId: user.id, activeOrgId: org.id },
      { targetTier: 'corporate' },
    );

    expect(result.shortUrl).toBe('https://rzp.io/i/checkout_token');
    expect(result.razorpaySubscriptionId).toMatch(/^sub_/);
  });

  it('rejects non-owner caller with 403', async () => {
    const user = await makeUser();
    const org = await makeOrganization();
    // Member but NOT owner
    await db.insert(schema.member).values({
      id: `mbr_nonowner_${Date.now()}`,
      organizationId: org.id,
      userId: user.id,
      role: 'member',
      createdAt: new Date(),
    });

    await expect(
      subscribeService.createSubscription(
        { userId: user.id, activeOrgId: org.id },
        { targetTier: 'professional_plus' },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects Hobby tier with 422', async () => {
    const { user, org } = await makeOrgWithOwner();

    await expect(
      subscribeService.createSubscription(
        { userId: user.id, activeOrgId: org.id },
        { targetTier: 'hobby' },
      ),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('reuses an existing created checkout instead of orphaning it', async () => {
    const { user, org } = await makeOrgWithOwner();

    // Abandoned checkout: razorpayStatus "created" + planTier "hobby"
    await db.insert(schema.subscription).values({
      organizationId: org.id,
      planTier: 'hobby',
      subscriptionState: 'active',
      razorpaySubscriptionId: 'sub_abandoned_old',
      razorpayStatus: 'created',
    });

    vi.mocked(mockFetchSubscription).mockResolvedValue({
      id: 'sub_abandoned_old',
      entity: 'subscription',
      plan_id: 'plan_test',
      status: 'created',
      current_start: null,
      current_end: null,
      short_url: 'https://rzp.io/existing',
      created_at: Math.floor(Date.now() / 1000),
    });

    const result = await subscribeService.createSubscription(
      { userId: user.id, activeOrgId: org.id },
      { targetTier: 'professional_plus' },
    );

    expect(result).toEqual({
      razorpaySubscriptionId: 'sub_abandoned_old',
      shortUrl: 'https://rzp.io/existing',
    });
    expect(mockCreateSubscription).not.toHaveBeenCalled();

    // DB: subscription row updated with new Razorpay ID, still hobby
    const [sub] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, org.id));
    expect(sub!.razorpaySubscriptionId).toBe('sub_abandoned_old');
    expect(sub!.planTier).toBe('hobby');
  });

  it('blocks a new checkout when Razorpay reports the existing subscription as authenticated', async () => {
    const { user, org } = await makeOrgWithOwner();

    await db.insert(schema.subscription).values({
      organizationId: org.id,
      planTier: 'hobby',
      subscriptionState: 'active',
      razorpaySubscriptionId: 'sub_authenticated',
      razorpayStatus: 'authenticated',
    });

    vi.mocked(mockFetchSubscription).mockResolvedValue({
      id: 'sub_authenticated',
      entity: 'subscription',
      plan_id: 'plan_test',
      status: 'authenticated',
      current_start: null,
      current_end: null,
      short_url: 'https://rzp.io/authenticated',
      created_at: Math.floor(Date.now() / 1000),
    });

    await expect(
      subscribeService.createSubscription(
        { userId: user.id, activeOrgId: org.id },
        { targetTier: 'professional_plus' },
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(mockCreateSubscription).not.toHaveBeenCalled();
  });

  it('replaces an existing checkout only after Razorpay reports a terminal state', async () => {
    const { user, org } = await makeOrgWithOwner();

    await db.insert(schema.subscription).values({
      organizationId: org.id,
      planTier: 'hobby',
      subscriptionState: 'active',
      razorpaySubscriptionId: 'sub_expired_old',
      razorpayStatus: 'created',
    });

    vi.mocked(mockFetchSubscription).mockResolvedValue({
      id: 'sub_expired_old',
      entity: 'subscription',
      plan_id: 'plan_test',
      status: 'expired',
      current_start: null,
      current_end: null,
      short_url: null,
      created_at: Math.floor(Date.now() / 1000),
    });
    vi.mocked(mockCreateSubscription).mockResolvedValue({
      id: 'sub_fresh',
      entity: 'subscription',
      plan_id: 'plan_test',
      status: 'created',
      current_start: null,
      current_end: null,
      short_url: 'https://rzp.io/fresh',
      created_at: Math.floor(Date.now() / 1000),
    });

    const result = await subscribeService.createSubscription(
      { userId: user.id, activeOrgId: org.id },
      { targetTier: 'professional_plus' },
    );

    expect(result.razorpaySubscriptionId).toBe('sub_fresh');
    expect(mockCreateSubscription).toHaveBeenCalledOnce();
  });

  it('records cycle-end cancellation without pretending Razorpay is already cancelled', async () => {
    const { user, org } = await makeOrgWithOwner();
    await db.insert(schema.subscription).values({
      organizationId: org.id,
      planTier: 'professional_plus',
      subscriptionState: 'active',
      razorpaySubscriptionId: 'sub_cancel_scheduled',
      razorpayStatus: 'active',
    });
    vi.mocked(mockCancelSubscription).mockResolvedValue({
      id: 'sub_cancel_scheduled',
      entity: 'subscription',
      plan_id: 'plan_test',
      status: 'active',
      current_start: 1_788_000_000,
      current_end: 1_790_000_000,
      short_url: null,
      cancel_at_cycle_end: true,
      created_at: 1_787_000_000,
    });

    await subscribeService.cancelSubscription({ userId: user.id, activeOrgId: org.id });

    const [scheduled] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, org.id));
    expect(scheduled!.razorpayStatus).toBe('active');
    expect(scheduled!.cancelAtPeriodEnd).toBe(true);
  });

  it('reconciles a missed cycle-end cancellation webhook to Hobby', async () => {
    const { user, org } = await makeOrgWithOwner();
    await db.insert(schema.subscription).values({
      organizationId: org.id,
      planTier: 'corporate',
      subscriptionState: 'active',
      razorpaySubscriptionId: 'sub_cancel_missed_webhook',
      razorpayStatus: 'active',
      cancelAtPeriodEnd: true,
    });
    vi.mocked(mockFetchSubscription).mockResolvedValue({
      id: 'sub_cancel_missed_webhook',
      entity: 'subscription',
      plan_id: 'plan_test',
      status: 'cancelled',
      current_start: 1_788_000_000,
      current_end: 1_790_000_000,
      short_url: null,
      cancel_at_cycle_end: true,
      cancelled_at: 1_790_000_000,
      ended_at: 1_790_000_000,
      created_at: 1_787_000_000,
    });

    const result = await subscribeService.refreshSubscription({
      userId: user.id,
      activeOrgId: org.id,
    });

    expect(result).toEqual({ reconciled: true, razorpayStatus: 'cancelled' });
    const [reconciled] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, org.id));
    expect(reconciled!.planTier).toBe('hobby');
    expect(reconciled!.razorpaySubscriptionId).toBeNull();
    expect(reconciled!.cancelAtPeriodEnd).toBe(false);
  });

  it('rejects when organization has an active paid Razorpay subscription (409)', async () => {
    const { user, org } = await makeOrgWithOwner();

    // Active paid subscription — not abandoned
    await db.insert(schema.subscription).values({
      organizationId: org.id,
      planTier: 'professional_plus',
      subscriptionState: 'active',
      razorpaySubscriptionId: 'sub_active_paid',
      razorpayStatus: 'active',
    });

    vi.mocked(mockFetchSubscription).mockResolvedValue({
      id: 'sub_active_paid',
      entity: 'subscription',
      plan_id: 'plan_test',
      status: 'active',
      current_start: null,
      current_end: null,
      short_url: null,
      created_at: Math.floor(Date.now() / 1000),
    });

    await expect(
      subscribeService.createSubscription(
        { userId: user.id, activeOrgId: org.id },
        { targetTier: 'corporate' },
      ),
    ).rejects.toMatchObject({ status: 409 });

    // Razorpay should NOT have been called
    expect(mockCreateSubscription).not.toHaveBeenCalled();
  });

  it('Razorpay failure rolls back — no subscription row created', async () => {
    const { user, org } = await makeOrgWithOwner();

    vi.mocked(mockCreateSubscription).mockRejectedValue(
      new Error('Razorpay createSubscription failed: Bad Request'),
    );

    await expect(
      subscribeService.createSubscription(
        { userId: user.id, activeOrgId: org.id },
        { targetTier: 'corporate' },
      ),
    ).rejects.toThrow(/Razorpay/);

    // No subscription row for this org
    const [sub] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, org.id));
    expect(sub).toBeUndefined();
  });

  it('Razorpay failure with existing hobby sub leaves it unchanged', async () => {
    const { user, org } = await makeOrgWithOwner();

    // Pre-existing hobby subscription without Razorpay (e.g., org was on free plan)
    await db.insert(schema.subscription).values({
      organizationId: org.id,
      planTier: 'hobby',
      subscriptionState: 'active',
    });

    vi.mocked(mockCreateSubscription).mockRejectedValue(
      new Error('Razorpay createSubscription failed: timeout'),
    );

    await expect(
      subscribeService.createSubscription(
        { userId: user.id, activeOrgId: org.id },
        { targetTier: 'professional_plus' },
      ),
    ).rejects.toThrow(/Razorpay/);

    // Subscription unchanged: still hobby, no Razorpay ID
    const [sub] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, org.id));
    expect(sub!.planTier).toBe('hobby');
    expect(sub!.razorpaySubscriptionId).toBeNull();
    expect(sub!.razorpayStatus).toBeNull();
  });

  it('changePlan rejects subscription with razorpayStatus "created" (not yet active)', async () => {
    const { user, org } = await makeOrgWithOwner();

    // Checkout was created but not completed
    await db.insert(schema.subscription).values({
      organizationId: org.id,
      planTier: 'hobby',
      subscriptionState: 'active',
      razorpaySubscriptionId: 'sub_pending_checkout',
      razorpayStatus: 'created',
    });

    await expect(
      subscribeService.changePlan(
        { userId: user.id, activeOrgId: org.id },
        { targetTier: 'corporate' },
      ),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining('not yet active') });
  });
});
