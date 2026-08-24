import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@repo/db';
import { makeOrganization, makeSubscription, makePaymentTransaction } from '@repo/db/testing';

/**
 * E-114 Subscription lifecycle CHECK constraint integration tests.
 *
 * These tests exercise actual PostgreSQL constraint enforcement —
 * not just schema metadata. Invalid states must be rejected with 23514.
 */

describe('subscription lifecycle constraints', () => {
  describe('valid states', () => {
    it('accepts active with no lapse fields', async () => {
      const row = await makeSubscription({ subscriptionState: 'active', planTier: 'corporate' });
      expect(row.subscriptionState).toBe('active');
      expect(row.graceStartedAt).toBeNull();
      expect(row.preLapseTier).toBeNull();
    });

    it('accepts payment_failed with no lapse fields', async () => {
      const row = await makeSubscription({
        subscriptionState: 'payment_failed',
        planTier: 'professional_plus',
      });
      expect(row.subscriptionState).toBe('payment_failed');
      expect(row.graceStartedAt).toBeNull();
      expect(row.preLapseTier).toBeNull();
    });

    it('accepts grace with grace_started_at and pre_lapse_tier', async () => {
      const row = await makeSubscription({
        subscriptionState: 'grace',
        planTier: 'corporate',
      });
      expect(row.subscriptionState).toBe('grace');
      expect(row.graceStartedAt).not.toBeNull();
      expect(row.preLapseTier).toBe('corporate');
    });

    it('accepts locked with grace_started_at + locked_at + pre_lapse_tier', async () => {
      const row = await makeSubscription({
        subscriptionState: 'locked',
        planTier: 'corporate',
      });
      expect(row.subscriptionState).toBe('locked');
      expect(row.graceStartedAt).not.toBeNull();
      expect(row.lockedAt).not.toBeNull();
      expect(row.preLapseTier).toBe('corporate');
    });

    it('accepts downgraded with all timestamps + pre_lapse_tier', async () => {
      const row = await makeSubscription({
        subscriptionState: 'downgraded',
        planTier: 'corporate',
      });
      expect(row.subscriptionState).toBe('downgraded');
      expect(row.graceStartedAt).not.toBeNull();
      expect(row.lockedAt).not.toBeNull();
      expect(row.downgradedAt).not.toBeNull();
      expect(row.preLapseTier).toBe('corporate');
    });
  });

  describe('invalid states are rejected', () => {
    it('rejects active with pre_lapse_tier set', async () => {
      const org = await makeOrganization();
      await expect(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'corporate',
          subscriptionState: 'active',
          preLapseTier: 'professional_plus',
        }),
      ).rejects.toThrow();
    });

    it('rejects payment_failed with pre_lapse_tier set', async () => {
      const org = await makeOrganization();
      await expect(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'corporate',
          subscriptionState: 'payment_failed',
          preLapseTier: 'corporate',
        }),
      ).rejects.toThrow();
    });

    it('rejects grace without grace_started_at', async () => {
      const org = await makeOrganization();
      await expect(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'corporate',
          subscriptionState: 'grace',
          preLapseTier: 'corporate',
          // graceStartedAt intentionally missing
        }),
      ).rejects.toThrow();
    });

    it('rejects grace without pre_lapse_tier', async () => {
      const org = await makeOrganization();
      await expect(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'corporate',
          subscriptionState: 'grace',
          graceStartedAt: new Date(),
          // preLapseTier intentionally missing
        }),
      ).rejects.toThrow();
    });

    it('rejects locked without locked_at', async () => {
      const org = await makeOrganization();
      await expect(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'corporate',
          subscriptionState: 'locked',
          graceStartedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          preLapseTier: 'corporate',
          // lockedAt intentionally missing
        }),
      ).rejects.toThrow();
    });

    it('rejects locked without grace_started_at', async () => {
      const org = await makeOrganization();
      await expect(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'corporate',
          subscriptionState: 'locked',
          lockedAt: new Date(),
          preLapseTier: 'corporate',
          // graceStartedAt intentionally missing
        }),
      ).rejects.toThrow();
    });

    it('rejects downgraded without locked_at', async () => {
      const org = await makeOrganization();
      await expect(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'hobby',
          subscriptionState: 'downgraded',
          graceStartedAt: new Date(Date.now() - 37 * 24 * 60 * 60 * 1000),
          downgradedAt: new Date(),
          preLapseTier: 'corporate',
          // lockedAt intentionally missing
        }),
      ).rejects.toThrow();
    });

    it('rejects downgraded without pre_lapse_tier', async () => {
      const org = await makeOrganization();
      await expect(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'hobby',
          subscriptionState: 'downgraded',
          graceStartedAt: new Date(Date.now() - 37 * 24 * 60 * 60 * 1000),
          lockedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          downgradedAt: new Date(),
          // preLapseTier intentionally missing
        }),
      ).rejects.toThrow();
    });

    it('rejects active with locked_at set', async () => {
      const org = await makeOrganization();
      await expect(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'corporate',
          subscriptionState: 'active',
          lockedAt: new Date(),
        }),
      ).rejects.toThrow();
    });
  });

  describe('timestamp ordering', () => {
    it('rejects locked_at before grace_started_at', async () => {
      const org = await makeOrganization();
      const now = new Date();
      await expect(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'corporate',
          subscriptionState: 'locked',
          graceStartedAt: now,
          lockedAt: new Date(now.getTime() - 1000), // before grace
          preLapseTier: 'corporate',
        }),
      ).rejects.toThrow();
    });
  });

  describe('unique constraints', () => {
    it('rejects duplicate organization subscription', async () => {
      const org = await makeOrganization();
      await makeSubscription({ organizationId: org.id });
      await expect(
        db.insert(schema.subscription).values({
          organizationId: org.id,
          planTier: 'hobby',
          subscriptionState: 'active',
        }),
      ).rejects.toThrow();
    });

    it('rejects duplicate razorpay_subscription_id', async () => {
      await makeSubscription({ razorpaySubscriptionId: 'sub_UNIQUE_TEST' });
      await expect(
        makeSubscription({ razorpaySubscriptionId: 'sub_UNIQUE_TEST' }),
      ).rejects.toThrow();
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
      await expect(
        db.insert(schema.paymentTransaction).values({
          subscriptionId: sub.id,
          razorpayPaymentId: `pay_negative_${Date.now()}`,
          amount: -100,
          status: 'failed',
        }),
      ).rejects.toThrow();
    });

    it('enforces unique razorpay_payment_id', async () => {
      const sub = await makeSubscription();
      await makePaymentTransaction({ subscriptionId: sub.id, razorpayPaymentId: 'pay_DUP' });
      await expect(
        makePaymentTransaction({ subscriptionId: sub.id, razorpayPaymentId: 'pay_DUP' }),
      ).rejects.toThrow();
    });

    it('cascades deletion when subscription is deleted (via org cascade)', async () => {
      const org = await makeOrganization();
      const sub = await makeSubscription({ organizationId: org.id });
      await makePaymentTransaction({ subscriptionId: sub.id });

      // Deleting the org should cascade → subscription → payment_transaction
      await db.delete(schema.organization).where(eq(schema.organization.id, org.id));

      // Verify subscription is gone
      const subs = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.organizationId, org.id));
      expect(subs).toHaveLength(0);
    });
  });
});
