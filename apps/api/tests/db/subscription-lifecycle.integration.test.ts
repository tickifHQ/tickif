import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@repo/db';
import { makeOrganization, makeSubscription, makePaymentTransaction } from '@repo/db/testing';

/**
 * E-114 Subscription lifecycle CHECK constraint integration tests.
 *
 * These tests exercise actual PostgreSQL constraint enforcement —
 * not just schema metadata. Invalid states must be rejected with 23514
 * and the expected constraint name.
 */

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/**
 * Extract the PostgreSQL error from a Drizzle error.
 * Drizzle wraps PG errors — the constraint/code live on the cause or nested error.
 */
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

/** Assert a DB operation fails with a specific constraint violation (23514). */
async function expectConstraintViolation(
  operation: Promise<unknown>,
  expectedConstraint: string,
): Promise<void> {
  try {
    await operation;
    expect.fail(`Expected constraint violation (${expectedConstraint}) but operation succeeded`);
  } catch (err) {
    const pg = pgError(err);
    expect(
      pg.code,
      `Expected PG code 23514 (check_violation) but got: ${JSON.stringify(pg)}`,
    ).toBe('23514');
    expect(
      pg.constraint,
      `Expected constraint '${expectedConstraint}' but got: ${JSON.stringify(pg)}`,
    ).toBe(expectedConstraint);
  }
}

/** Assert a DB operation fails with a specific PG error code. */
async function expectPgError(
  operation: Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await operation;
    expect.fail(`Expected PG error (${expectedCode}) but operation succeeded`);
  } catch (err) {
    const pg = pgError(err);
    expect(
      pg.code,
      `Expected PG code '${expectedCode}' but got: ${JSON.stringify(pg)}`,
    ).toBe(expectedCode);
  }
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('subscription lifecycle constraints', () => {
  describe('valid states', () => {
    it('accepts active with no lapse fields', async () => {
      const row = await makeSubscription({ subscriptionState: 'active', planTier: 'corporate' });
      expect(row.subscriptionState).toBe('active');
      expect(row.graceStartedAt).toBeNull();
      expect(row.lockedAt).toBeNull();
      expect(row.downgradedAt).toBeNull();
      expect(row.preLapseTier).toBeNull();
    });

    it('accepts payment_failed with no lapse fields', async () => {
      const row = await makeSubscription({
        subscriptionState: 'payment_failed',
        planTier: 'professional_plus',
      });
      expect(row.subscriptionState).toBe('payment_failed');
      expect(row.graceStartedAt).toBeNull();
      expect(row.lockedAt).toBeNull();
      expect(row.downgradedAt).toBeNull();
      expect(row.preLapseTier).toBeNull();
    });

    it('accepts grace with planTier = preLapseTier (corporate)', async () => {
      const row = await makeSubscription({
        subscriptionState: 'grace',
        planTier: 'corporate',
        preLapseTier: 'corporate',
      });
      expect(row.subscriptionState).toBe('grace');
      expect(row.graceStartedAt).not.toBeNull();
      expect(row.planTier).toBe('corporate');
      expect(row.preLapseTier).toBe('corporate');
    });

    it('accepts locked with planTier = preLapseTier (professional_plus)', async () => {
      const row = await makeSubscription({
        subscriptionState: 'locked',
        planTier: 'professional_plus',
        preLapseTier: 'professional_plus',
      });
      expect(row.subscriptionState).toBe('locked');
      expect(row.graceStartedAt).not.toBeNull();
      expect(row.lockedAt).not.toBeNull();
      expect(row.planTier).toBe('professional_plus');
      expect(row.preLapseTier).toBe('professional_plus');
    });

    it('accepts downgraded with planTier = hobby and preLapseTier = corporate', async () => {
      const row = await makeSubscription({
        subscriptionState: 'downgraded',
        planTier: 'hobby',
        preLapseTier: 'corporate',
      });
      expect(row.subscriptionState).toBe('downgraded');
      expect(row.graceStartedAt).not.toBeNull();
      expect(row.lockedAt).not.toBeNull();
      expect(row.downgradedAt).not.toBeNull();
      expect(row.planTier).toBe('hobby');
      expect(row.preLapseTier).toBe('corporate');
    });

    it('accepts downgraded with preLapseTier = professional_plus', async () => {
      const row = await makeSubscription({
        subscriptionState: 'downgraded',
        planTier: 'hobby',
        preLapseTier: 'professional_plus',
      });
      expect(row.planTier).toBe('hobby');
      expect(row.preLapseTier).toBe('professional_plus');
    });
  });

  describe('lifecycle CHECK violations (23514)', () => {
    it('rejects active with pre_lapse_tier set', async () => {
      const org = await makeOrganization();
      await expectConstraintViolation(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'corporate',
          subscriptionState: 'active',
          preLapseTier: 'professional_plus',
        }),
        'subscription_lifecycle_check',
      );
    });

    it('rejects payment_failed with pre_lapse_tier set', async () => {
      const org = await makeOrganization();
      await expectConstraintViolation(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'corporate',
          subscriptionState: 'payment_failed',
          preLapseTier: 'corporate',
        }),
        'subscription_lifecycle_check',
      );
    });

    it('rejects grace without grace_started_at', async () => {
      const org = await makeOrganization();
      await expectConstraintViolation(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'corporate',
          subscriptionState: 'grace',
          preLapseTier: 'corporate',
        }),
        'subscription_lifecycle_check',
      );
    });

    it('rejects grace without pre_lapse_tier', async () => {
      const org = await makeOrganization();
      await expectConstraintViolation(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'corporate',
          subscriptionState: 'grace',
          graceStartedAt: new Date(),
        }),
        'subscription_lifecycle_check',
      );
    });

    it('rejects grace with planTier != preLapseTier', async () => {
      const org = await makeOrganization();
      await expectConstraintViolation(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'professional_plus',
          subscriptionState: 'grace',
          graceStartedAt: new Date(),
          preLapseTier: 'corporate',
        }),
        'subscription_lifecycle_check',
      );
    });

    it('rejects grace with preLapseTier = hobby', async () => {
      const org = await makeOrganization();
      await expectConstraintViolation(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'hobby',
          subscriptionState: 'grace',
          graceStartedAt: new Date(),
          preLapseTier: 'hobby',
        }),
        'subscription_lifecycle_check',
      );
    });

    it('rejects locked without locked_at', async () => {
      const org = await makeOrganization();
      await expectConstraintViolation(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'corporate',
          subscriptionState: 'locked',
          graceStartedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          preLapseTier: 'corporate',
        }),
        'subscription_lifecycle_check',
      );
    });

    it('rejects locked without grace_started_at', async () => {
      const org = await makeOrganization();
      await expectConstraintViolation(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'corporate',
          subscriptionState: 'locked',
          lockedAt: new Date(),
          preLapseTier: 'corporate',
        }),
        'subscription_lifecycle_check',
      );
    });

    it('rejects downgraded without locked_at', async () => {
      const org = await makeOrganization();
      await expectConstraintViolation(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'hobby',
          subscriptionState: 'downgraded',
          graceStartedAt: new Date(Date.now() - 37 * 24 * 60 * 60 * 1000),
          downgradedAt: new Date(),
          preLapseTier: 'corporate',
        }),
        'subscription_lifecycle_check',
      );
    });

    it('rejects downgraded without pre_lapse_tier', async () => {
      const org = await makeOrganization();
      await expectConstraintViolation(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'hobby',
          subscriptionState: 'downgraded',
          graceStartedAt: new Date(Date.now() - 37 * 24 * 60 * 60 * 1000),
          lockedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          downgradedAt: new Date(),
        }),
        'subscription_lifecycle_check',
      );
    });

    it('rejects downgraded with corporate planTier (must be hobby)', async () => {
      const org = await makeOrganization();
      await expectConstraintViolation(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'corporate',
          subscriptionState: 'downgraded',
          graceStartedAt: new Date(Date.now() - 37 * 24 * 60 * 60 * 1000),
          lockedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          downgradedAt: new Date(),
          preLapseTier: 'corporate',
        }),
        'subscription_lifecycle_check',
      );
    });

    it('rejects downgraded with preLapseTier = hobby', async () => {
      const org = await makeOrganization();
      await expectConstraintViolation(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'hobby',
          subscriptionState: 'downgraded',
          graceStartedAt: new Date(Date.now() - 37 * 24 * 60 * 60 * 1000),
          lockedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          downgradedAt: new Date(),
          preLapseTier: 'hobby',
        }),
        'subscription_lifecycle_check',
      );
    });

    it('rejects active with locked_at set', async () => {
      const org = await makeOrganization();
      await expectConstraintViolation(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'corporate',
          subscriptionState: 'active',
          lockedAt: new Date(),
        }),
        'subscription_lifecycle_check',
      );
    });
  });

  describe('timestamp ordering', () => {
    it('rejects locked_at before grace_started_at', async () => {
      const org = await makeOrganization();
      const now = new Date();
      await expectConstraintViolation(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'corporate',
          subscriptionState: 'locked',
          graceStartedAt: now,
          lockedAt: new Date(now.getTime() - 1000),
          preLapseTier: 'corporate',
        }),
        'subscription_timestamp_order_check',
      );
    });

    it('rejects downgraded_at before locked_at', async () => {
      const org = await makeOrganization();
      const now = new Date();
      await expectConstraintViolation(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'hobby',
          subscriptionState: 'downgraded',
          graceStartedAt: new Date(now.getTime() - 60_000),
          lockedAt: now,
          downgradedAt: new Date(now.getTime() - 500),
          preLapseTier: 'corporate',
        }),
        'subscription_timestamp_order_check',
      );
    });
  });

  describe('unique constraints', () => {
    it('rejects duplicate organization subscription', async () => {
      const org = await makeOrganization();
      await makeSubscription({ organizationId: org.id });
      // 23505 = unique_violation
      await expectPgError(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'hobby',
          subscriptionState: 'active',
        }),
        '23505',
      );
    });

    it('rejects duplicate razorpay_subscription_id', async () => {
      await makeSubscription({ razorpaySubscriptionId: 'sub_UNIQUE_TEST' });
      await expectPgError(
        makeSubscription({ razorpaySubscriptionId: 'sub_UNIQUE_TEST' }),
        '23505',
      );
    });

    it('allows null razorpay_subscription_id for Hobby orgs', async () => {
      const row1 = await makeSubscription({ planTier: 'hobby' });
      const row2 = await makeSubscription({ planTier: 'hobby' });
      expect(row1.razorpaySubscriptionId).toBeNull();
      expect(row2.razorpaySubscriptionId).toBeNull();
    });
  });

  describe('payment transaction', () => {
    it('accepts zero-amount records (trial/discount cycles)', async () => {
      const sub = await makeSubscription();
      const row = await makePaymentTransaction({
        subscriptionId: sub.id,
        amount: 0,
        status: 'captured',
      });
      expect(row.amount).toBe(0);
    });

    it('rejects negative amounts', async () => {
      const sub = await makeSubscription();
      await expectConstraintViolation(
        db.insert(schema.paymentTransaction).values({
          subscriptionId: sub.id,
          razorpayPaymentId: `pay_negative_${Date.now()}`,
          amount: -100,
          status: 'failed',
          payload: { event: 'payment.failed', test: true },
        }),
        'payment_transaction_amount_nonnegative',
      );
    });

    it('enforces unique razorpay_payment_id', async () => {
      const sub = await makeSubscription();
      await makePaymentTransaction({ subscriptionId: sub.id, razorpayPaymentId: 'pay_DUP' });
      await expectPgError(
        makePaymentTransaction({ subscriptionId: sub.id, razorpayPaymentId: 'pay_DUP' }),
        '23505',
      );
    });

    it('persists payload as non-null JSONB', async () => {
      const sub = await makeSubscription();
      const row = await makePaymentTransaction({
        subscriptionId: sub.id,
        payload: { event: 'payment.captured', amount: 299900 },
      });
      expect(row.payload).toMatchObject({ event: 'payment.captured', amount: 299900 });
    });

    it('cascades deletion when subscription is deleted (via org cascade)', async () => {
      const org = await makeOrganization();
      const sub = await makeSubscription({ organizationId: org.id });
      await makePaymentTransaction({ subscriptionId: sub.id });

      await db.delete(schema.organization).where(eq(schema.organization.id, org.id));

      const subs = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.organizationId, org.id));
      expect(subs).toHaveLength(0);
    });
  });

  describe('UPDATE lifecycle walk', () => {
    it('walks active → payment_failed → grace → locked → downgraded via UPDATEs', async () => {
      const now = new Date();

      // Start: active + corporate
      const sub = await makeSubscription({
        subscriptionState: 'active',
        planTier: 'corporate',
      });
      expect(sub.subscriptionState).toBe('active');

      // active → payment_failed (no field changes required)
      const [pf] = await db
        .update(schema.subscription)
        .set({ subscriptionState: 'payment_failed' })
        .where(eq(schema.subscription.id, sub.id))
        .returning();
      expect(pf!.subscriptionState).toBe('payment_failed');

      // payment_failed → grace (set grace_started_at + pre_lapse_tier, plan_tier stays)
      const graceStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const [grace] = await db
        .update(schema.subscription)
        .set({
          subscriptionState: 'grace',
          graceStartedAt: graceStart,
          preLapseTier: 'corporate',
        })
        .where(eq(schema.subscription.id, sub.id))
        .returning();
      expect(grace!.subscriptionState).toBe('grace');
      expect(grace!.preLapseTier).toBe('corporate');
      expect(grace!.planTier).toBe('corporate');

      // grace → locked (set locked_at — must be >= graceStart)
      const lockTime = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      const [locked] = await db
        .update(schema.subscription)
        .set({
          subscriptionState: 'locked',
          lockedAt: lockTime,
        })
        .where(eq(schema.subscription.id, sub.id))
        .returning();
      expect(locked!.subscriptionState).toBe('locked');
      expect(locked!.lockedAt).not.toBeNull();

      // locked → downgraded (set downgraded_at + plan_tier to hobby)
      const [downgraded] = await db
        .update(schema.subscription)
        .set({
          subscriptionState: 'downgraded',
          downgradedAt: now,
          planTier: 'hobby',
        })
        .where(eq(schema.subscription.id, sub.id))
        .returning();
      expect(downgraded!.subscriptionState).toBe('downgraded');
      expect(downgraded!.planTier).toBe('hobby');
      expect(downgraded!.preLapseTier).toBe('corporate');
    });

    it('recovers from grace → active and can re-enter payment_failed without deadlock', async () => {
      // This tests the second-lapse regression: after recovery from grace, the
      // lapse fields must be cleared so a new lapse cycle can start cleanly.

      // Start: active + professional_plus → payment_failed → grace
      const sub = await makeSubscription({
        subscriptionState: 'grace',
        planTier: 'professional_plus',
        preLapseTier: 'professional_plus',
      });
      expect(sub.subscriptionState).toBe('grace');

      // grace → active (recovery: clear ALL lapse fields)
      const [recovered] = await db
        .update(schema.subscription)
        .set({
          subscriptionState: 'active',
          graceStartedAt: null,
          lockedAt: null,
          downgradedAt: null,
          preLapseTier: null,
        })
        .where(eq(schema.subscription.id, sub.id))
        .returning();
      expect(recovered!.subscriptionState).toBe('active');
      expect(recovered!.graceStartedAt).toBeNull();
      expect(recovered!.preLapseTier).toBeNull();

      // Re-enter payment_failed (second lapse — no deadlock)
      const [pf2] = await db
        .update(schema.subscription)
        .set({ subscriptionState: 'payment_failed' })
        .where(eq(schema.subscription.id, sub.id))
        .returning();
      expect(pf2!.subscriptionState).toBe('payment_failed');

      // Re-enter grace (second grace period)
      const [grace2] = await db
        .update(schema.subscription)
        .set({
          subscriptionState: 'grace',
          graceStartedAt: new Date(),
          preLapseTier: 'professional_plus',
        })
        .where(eq(schema.subscription.id, sub.id))
        .returning();
      expect(grace2!.subscriptionState).toBe('grace');
      expect(grace2!.preLapseTier).toBe('professional_plus');
    });

    it('recovers from locked → active and clears all lapse fields', async () => {
      const sub = await makeSubscription({
        subscriptionState: 'locked',
        planTier: 'corporate',
        preLapseTier: 'corporate',
      });

      const [recovered] = await db
        .update(schema.subscription)
        .set({
          subscriptionState: 'active',
          graceStartedAt: null,
          lockedAt: null,
          downgradedAt: null,
          preLapseTier: null,
        })
        .where(eq(schema.subscription.id, sub.id))
        .returning();
      expect(recovered!.subscriptionState).toBe('active');
      expect(recovered!.graceStartedAt).toBeNull();
      expect(recovered!.lockedAt).toBeNull();
      expect(recovered!.preLapseTier).toBeNull();
    });

    it('recovers from downgraded → active with tier restoration', async () => {
      const sub = await makeSubscription({
        subscriptionState: 'downgraded',
        planTier: 'hobby',
        preLapseTier: 'corporate',
      });

      // Reactivation: restore plan_tier from pre_lapse_tier, clear lapse fields
      const [recovered] = await db
        .update(schema.subscription)
        .set({
          subscriptionState: 'active',
          planTier: 'corporate', // restored from pre_lapse_tier
          graceStartedAt: null,
          lockedAt: null,
          downgradedAt: null,
          preLapseTier: null,
        })
        .where(eq(schema.subscription.id, sub.id))
        .returning();
      expect(recovered!.subscriptionState).toBe('active');
      expect(recovered!.planTier).toBe('corporate');
      expect(recovered!.preLapseTier).toBeNull();
    });

    it('rejects UPDATE that creates invalid state (grace without clearing locked_at)', async () => {
      // Start active, then try to set grace with leftover locked_at — must fail
      const sub = await makeSubscription({
        subscriptionState: 'active',
        planTier: 'corporate',
      });

      await expectConstraintViolation(
        db
          .update(schema.subscription)
          .set({
            subscriptionState: 'grace',
            graceStartedAt: new Date(),
            preLapseTier: 'corporate',
            lockedAt: new Date(), // invalid: grace must have lockedAt IS NULL
          })
          .where(eq(schema.subscription.id, sub.id)),
        'subscription_lifecycle_check',
      );
    });
  });
});
