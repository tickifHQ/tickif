import { describe, it, expect, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@repo/db';
import { makeSubscription, makeTeam, makeUser } from '@repo/db/testing';
import { RAZORPAY_EVENT } from '@repo/contracts';

// Mock @repo/config to provide Razorpay plan IDs for the plan_id reverse-lookup tests.
// In CI, these env vars are not set, so the config singleton has them as undefined.
vi.mock('@repo/config', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = (await importOriginal()) as typeof import('@repo/config');
  return {
    ...actual,
    config: {
      ...actual.config,
      RAZORPAY_KEY_ID: actual.config.RAZORPAY_KEY_ID || 'rzp_test_ci_mock',
      RAZORPAY_KEY_SECRET: actual.config.RAZORPAY_KEY_SECRET || 'ci_mock_secret',
      RAZORPAY_PLAN_ID_PROFESSIONAL_PLUS:
        actual.config.RAZORPAY_PLAN_ID_PROFESSIONAL_PLUS || 'plan_test_professional_plus',
      RAZORPAY_PLAN_ID_CORPORATE: actual.config.RAZORPAY_PLAN_ID_CORPORATE || 'plan_test_corporate',
    },
  };
});
import { processWebhookEvent } from '../../../src/modules/billing/webhook-service.js';
import { orgsService } from '../../../src/modules/orgs/service.js';

/**
 * E-117 Webhook integration tests.
 *
 * These tests exercise the real webhook-service against PostgreSQL,
 * verifying state transitions respect E-114 lifecycle CHECKs,
 * payment idempotency via UNIQUE constraint, and reactivation logic.
 */

// ─── Payload Builders ────────────────────────────────────────────────────────

function makeChargedPayload(overrides: {
  subscriptionId: string;
  paymentId?: string;
  paymentStatus?: string;
  amount?: number;
  currentEnd?: number;
  status?: string;
  planId?: string;
  notes?: Record<string, string>;
}) {
  return {
    event: RAZORPAY_EVENT.SUBSCRIPTION_CHARGED,
    payload: {
      subscription: {
        entity: {
          id: overrides.subscriptionId,
          status: overrides.status ?? 'active',
          current_end: overrides.currentEnd ?? Math.floor(Date.now() / 1000) + 30 * 86400,
          ...(overrides.planId ? { plan_id: overrides.planId } : {}),
          ...(overrides.notes ? { notes: overrides.notes } : {}),
        },
      },
      payment: {
        entity: {
          id:
            overrides.paymentId ?? `pay_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          status: overrides.paymentStatus ?? 'captured',
          amount: overrides.amount ?? 299900,
          currency: 'INR',
        },
      },
    },
  };
}

function makeSubscriptionPayload(
  event: string,
  subscriptionId: string,
  extra?: { status?: string; notes?: Record<string, string> },
) {
  return {
    event,
    payload: {
      subscription: {
        entity: {
          id: subscriptionId,
          status: extra?.status ?? 'active',
          notes: extra?.notes ?? {},
          current_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        },
      },
    },
  };
}

async function addOrganizationMembers(
  organizationId: string,
  prefix: string,
  options: { frozen?: boolean } = {},
) {
  const users = await Promise.all([
    makeUser({ email: `${prefix}-owner@example.com` }),
    makeUser({ email: `${prefix}-member-1@example.com` }),
    makeUser({ email: `${prefix}-member-2@example.com` }),
  ]);
  await db.insert(schema.member).values([
    {
      id: `${prefix}-owner`,
      organizationId,
      userId: users[0]!.id,
      role: 'owner',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    },
    {
      id: `${prefix}-member-1`,
      organizationId,
      userId: users[1]!.id,
      role: 'member',
      frozen: options.frozen ?? false,
      frozenAt: options.frozen ? new Date('2026-08-20T00:00:00.000Z') : null,
      freezeRank: options.frozen ? 1 : null,
      createdAt: new Date('2026-08-02T00:00:00.000Z'),
    },
    {
      id: `${prefix}-member-2`,
      organizationId,
      userId: users[2]!.id,
      role: 'member',
      frozen: options.frozen ?? false,
      frozenAt: options.frozen ? new Date('2026-08-20T00:00:00.000Z') : null,
      freezeRank: options.frozen ? 2 : null,
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
    },
  ]);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('E-117: webhook event processing', () => {
  describe('subscription.activated', () => {
    it('upgrades planTier from hobby to the tier in notes', async () => {
      const sub = await makeSubscription({
        planTier: 'hobby',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_activate_1',
        razorpayStatus: 'created',
      });

      const payload = makeSubscriptionPayload(
        RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED,
        'sub_activate_1',
        {
          status: 'active',
          notes: { tier: 'professional_plus', organizationId: sub.organizationId },
        },
      );

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED, payload);
      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated!.planTier).toBe('professional_plus');
      expect(updated!.razorpayStatus).toBe('active');
    });

    it('returns duplicate when already active with correct tier', async () => {
      await makeSubscription({
        planTier: 'corporate',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_activate_dup',
        razorpayStatus: 'active',
      });

      const payload = makeSubscriptionPayload(
        RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED,
        'sub_activate_dup',
        { status: 'active', notes: { tier: 'corporate' } },
      );

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED, payload);
      expect(result.outcome).toBe('duplicate');
    });

    it('clears lapse fields on activation from grace state', async () => {
      const sub = await makeSubscription({
        planTier: 'professional_plus',
        preLapseTier: 'professional_plus',
        subscriptionState: 'grace',
        razorpaySubscriptionId: 'sub_activate_grace',
      });

      const payload = makeSubscriptionPayload(
        RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED,
        'sub_activate_grace',
        { status: 'active', notes: { tier: 'professional_plus' } },
      );

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED, payload);
      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated!.subscriptionState).toBe('active');
      expect(updated!.graceStartedAt).toBeNull();
      expect(updated!.preLapseTier).toBeNull();
    });

    it('activates Corporate tier from notes', async () => {
      const sub = await makeSubscription({
        planTier: 'hobby',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_activate_corporate',
        razorpayStatus: 'created',
      });

      const payload = makeSubscriptionPayload(
        RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED,
        'sub_activate_corporate',
        { status: 'active', notes: { tier: 'corporate', organizationId: sub.organizationId } },
      );

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED, payload);
      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated!.planTier).toBe('corporate');
      expect(updated!.razorpayStatus).toBe('active');
    });

    it('restores frozen members when Corporate activates', async () => {
      const sub = await makeSubscription({
        planTier: 'hobby',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_activate_restore_members',
        razorpayStatus: 'created',
      });
      await addOrganizationMembers(sub.organizationId, 'activate-restore', { frozen: true });

      const result = await processWebhookEvent(
        RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED,
        makeSubscriptionPayload(
          RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED,
          'sub_activate_restore_members',
          { status: 'active', notes: { tier: 'corporate' } },
        ),
      );

      expect(result.outcome).toBe('processed');
      const members = await db
        .select({ frozen: schema.member.frozen })
        .from(schema.member)
        .where(eq(schema.member.organizationId, sub.organizationId));
      expect(members).toHaveLength(3);
      expect(members.every(({ frozen }) => !frozen)).toBe(true);
    });

    it('rejects activation when target tier cannot be determined', async () => {
      await makeSubscription({
        planTier: 'hobby',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_activate_no_tier',
        razorpayStatus: 'created',
      });

      // No notes.tier, no plan_id, no payment amount → cannot determine tier
      const payload = {
        event: RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED,
        payload: {
          subscription: {
            entity: {
              id: 'sub_activate_no_tier',
              status: 'active',
              notes: {}, // no tier field
            },
          },
        },
      };

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED, payload);
      expect(result.outcome).toBe('ignored');
      expect((result as { reason: string }).reason).toContain('Cannot determine target tier');
    });

    it('resolves tier from plan_id when notes are missing', async () => {
      const sub = await makeSubscription({
        planTier: 'hobby',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_activate_planid',
        razorpayStatus: 'created',
      });

      // notes missing tier, but plan_id matches our configured Corporate plan
      const payload = {
        event: RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED,
        payload: {
          subscription: {
            entity: {
              id: 'sub_activate_planid',
              status: 'active',
              plan_id: 'plan_test_corporate', // our configured Corporate plan ID (mocked)
              notes: { organizationId: sub.organizationId }, // no tier field
            },
          },
        },
      };

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED, payload);
      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated!.planTier).toBe('corporate');
    });

    it('rejects activation with unknown plan_id and no notes', async () => {
      await makeSubscription({
        planTier: 'hobby',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_activate_unknown_plan',
        razorpayStatus: 'created',
      });

      const payload = {
        event: RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED,
        payload: {
          subscription: {
            entity: {
              id: 'sub_activate_unknown_plan',
              status: 'active',
              plan_id: 'plan_UNKNOWN_NOT_OURS',
              notes: {},
            },
          },
        },
      };

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED, payload);
      expect(result.outcome).toBe('ignored');
      expect((result as { reason: string }).reason).toContain('Cannot determine target tier');
    });

    it('plan_id takes priority over notes.tier for tier resolution', async () => {
      const sub = await makeSubscription({
        planTier: 'hobby',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_activate_planid_priority',
        razorpayStatus: 'created',
      });

      // plan_id says corporate (authoritative — reflects current Razorpay plan);
      // notes say professional_plus (stale — set at creation, not updated by change-plan).
      // plan_id MUST win because change-plan PATCHes the plan_id but NOT the notes.
      const payload = {
        event: RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED,
        payload: {
          subscription: {
            entity: {
              id: 'sub_activate_planid_priority',
              status: 'active',
              plan_id: 'plan_test_corporate', // Corporate plan (authoritative)
              notes: { tier: 'professional_plus' }, // Stale notes from creation
            },
          },
        },
      };

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED, payload);
      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      // plan_id wins — tier is corporate, not professional_plus
      expect(updated!.planTier).toBe('corporate');
    });
  });

  describe('subscription.charged', () => {
    it('records payment and updates subscription period (normal renewal)', async () => {
      const sub = await makeSubscription({
        planTier: 'professional_plus',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_charged_1',
      });

      const payload = makeChargedPayload({
        subscriptionId: 'sub_charged_1',
        paymentId: 'pay_charge_1',
        amount: 299900,
      });

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_CHARGED, payload);
      expect(result.outcome).toBe('processed');

      // Verify payment recorded
      const [payment] = await db
        .select()
        .from(schema.paymentTransaction)
        .where(eq(schema.paymentTransaction.razorpayPaymentId, 'pay_charge_1'));
      expect(payment).toBeDefined();
      expect(payment!.amount).toBe(299900);
      expect(payment!.status).toBe('captured');
      expect(payment!.subscriptionId).toBe(sub.id);
      expect(payment!.payload).toBeDefined();

      // Verify subscription updated
      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated!.currentPeriodEnd).not.toBeNull();
      expect(updated!.planTier).toBe('professional_plus');
    });

    it('applies scheduled paid-to-paid plan change from plan_id on cycle-end charge', async () => {
      const sub = await makeSubscription({
        planTier: 'professional_plus',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_charged_plan_change',
      });

      const payload = makeChargedPayload({
        subscriptionId: 'sub_charged_plan_change',
        paymentId: 'pay_plan_change_corporate',
        amount: 799900,
        planId: 'plan_test_corporate',
        notes: { tier: 'professional_plus' },
      });

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_CHARGED, payload);
      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated!.planTier).toBe('corporate');
      expect(updated!.subscriptionState).toBe('active');
    });

    it('does not apply stale notes.tier when plan_id is absent on a same-plan renewal', async () => {
      const sub = await makeSubscription({
        planTier: 'corporate',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_charged_stale_notes',
      });

      const payload = makeChargedPayload({
        subscriptionId: 'sub_charged_stale_notes',
        paymentId: 'pay_stale_notes',
        amount: 799900,
        notes: { tier: 'professional_plus' },
      });

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_CHARGED, payload);
      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated!.planTier).toBe('corporate');
    });

    it('infers scheduled plan change from payment amount when plan_id is missing', async () => {
      const sub = await makeSubscription({
        planTier: 'professional_plus',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_charged_amount_tier',
      });

      const payload = makeChargedPayload({
        subscriptionId: 'sub_charged_amount_tier',
        paymentId: 'pay_amount_tier',
        amount: 799900,
      });

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_CHARGED, payload);
      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated!.planTier).toBe('corporate');
    });

    it('reactivates from grace — restores preLapseTier and clears lapse fields', async () => {
      const sub = await makeSubscription({
        planTier: 'corporate',
        preLapseTier: 'corporate',
        subscriptionState: 'grace',
        razorpaySubscriptionId: 'sub_grace_reactivate',
      });

      const payload = makeChargedPayload({
        subscriptionId: 'sub_grace_reactivate',
        paymentId: 'pay_reactivate_grace',
        amount: 799900,
        planId: 'plan_test_corporate',
      });

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_CHARGED, payload);
      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated!.subscriptionState).toBe('active');
      expect(updated!.planTier).toBe('corporate');
      expect(updated!.graceStartedAt).toBeNull();
      expect(updated!.preLapseTier).toBeNull();
    });

    it('reactivation does not apply a mismatched payment amount when plan_id is absent', async () => {
      const sub = await makeSubscription({
        planTier: 'corporate',
        preLapseTier: 'corporate',
        subscriptionState: 'grace',
        razorpaySubscriptionId: 'sub_grace_amount_mismatch',
      });

      const payload = makeChargedPayload({
        subscriptionId: 'sub_grace_amount_mismatch',
        paymentId: 'pay_reactivate_amount_mismatch',
        amount: 299900,
      });

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_CHARGED, payload);
      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated!.subscriptionState).toBe('active');
      expect(updated!.planTier).toBe('corporate');
    });

    it('reactivates from locked — restores preLapseTier and clears all lapse fields', async () => {
      const sub = await makeSubscription({
        planTier: 'corporate',
        preLapseTier: 'corporate',
        subscriptionState: 'locked',
        razorpaySubscriptionId: 'sub_locked_reactivate',
      });

      const payload = makeChargedPayload({
        subscriptionId: 'sub_locked_reactivate',
        paymentId: 'pay_reactivate_locked',
        amount: 799900,
        planId: 'plan_test_corporate',
      });

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_CHARGED, payload);
      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated!.subscriptionState).toBe('active');
      expect(updated!.planTier).toBe('corporate');
      expect(updated!.graceStartedAt).toBeNull();
      expect(updated!.lockedAt).toBeNull();
      expect(updated!.preLapseTier).toBeNull();
    });

    it('reactivates a downgraded organization and restores seats and branches', async () => {
      const sub = await makeSubscription({
        planTier: 'hobby',
        preLapseTier: 'corporate',
        subscriptionState: 'downgraded',
        downgradedAt: new Date('2026-08-20T00:00:00.000Z'),
        razorpaySubscriptionId: 'sub_downgraded_restore_resources',
      });
      await addOrganizationMembers(sub.organizationId, 'downgraded-restore', { frozen: true });
      await makeTeam({
        organizationId: sub.organizationId,
        frozen: true,
        frozenAt: new Date('2026-08-20T00:00:00.000Z'),
        freezeRank: 1,
      });

      const result = await processWebhookEvent(
        RAZORPAY_EVENT.SUBSCRIPTION_CHARGED,
        makeChargedPayload({
          subscriptionId: 'sub_downgraded_restore_resources',
          paymentId: 'pay_restore_downgraded_resources',
          amount: 799900,
          planId: 'plan_test_corporate',
        }),
      );

      expect(result.outcome).toBe('processed');
      const members = await db
        .select({ frozen: schema.member.frozen })
        .from(schema.member)
        .where(eq(schema.member.organizationId, sub.organizationId));
      const branches = await db
        .select({ frozen: schema.team.frozen })
        .from(schema.team)
        .where(eq(schema.team.organizationId, sub.organizationId));
      expect(members.every(({ frozen }) => !frozen)).toBe(true);
      expect(branches.every(({ frozen }) => !frozen)).toBe(true);
    });

    it('duplicate payment returns duplicate — no second row', async () => {
      await makeSubscription({
        planTier: 'professional_plus',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_dup_charge',
      });

      const payload = makeChargedPayload({
        subscriptionId: 'sub_dup_charge',
        paymentId: 'pay_dup_same',
        amount: 299900,
      });

      const first = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_CHARGED, payload);
      expect(first.outcome).toBe('processed');

      const second = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_CHARGED, payload);
      expect(second.outcome).toBe('duplicate');

      // Only one payment row
      const payments = await db
        .select()
        .from(schema.paymentTransaction)
        .where(eq(schema.paymentTransaction.razorpayPaymentId, 'pay_dup_same'));
      expect(payments).toHaveLength(1);
    });

    it('ignores charge for downgraded subscription', async () => {
      await makeSubscription({
        planTier: 'hobby',
        subscriptionState: 'downgraded',
        razorpaySubscriptionId: 'sub_downgraded_charge',
      });

      const payload = makeChargedPayload({
        subscriptionId: 'sub_downgraded_charge',
        paymentId: 'pay_downgraded_ignore',
      });

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_CHARGED, payload);
      expect(result.outcome).toBe('ignored');
    });

    it('atomically restores a downgraded replacement subscription and its frozen seats', async () => {
      const sub = await makeSubscription({
        planTier: 'hobby',
        preLapseTier: 'corporate',
        subscriptionState: 'downgraded',
        razorpaySubscriptionId: 'sub_downgraded_replacement_charge',
        razorpayStatus: 'created',
      });
      await addOrganizationMembers(sub.organizationId, 'downgraded-replacement', {
        frozen: true,
      });

      const result = await processWebhookEvent(
        RAZORPAY_EVENT.SUBSCRIPTION_CHARGED,
        makeChargedPayload({
          subscriptionId: 'sub_downgraded_replacement_charge',
          paymentId: 'pay_downgraded_replacement_charge',
          amount: 799900,
          planId: 'plan_test_corporate',
        }),
      );

      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated).toMatchObject({
        subscriptionState: 'active',
        planTier: 'corporate',
        preLapseTier: null,
        downgradedAt: null,
      });

      const members = await db
        .select({ frozen: schema.member.frozen })
        .from(schema.member)
        .where(eq(schema.member.organizationId, sub.organizationId));
      expect(members).toHaveLength(3);
      expect(members.every(({ frozen }) => !frozen)).toBe(true);
    });

    it('rolls back the tier and payment when atomic seat restoration fails, then retries', async () => {
      const sub = await makeSubscription({
        planTier: 'hobby',
        preLapseTier: 'corporate',
        subscriptionState: 'downgraded',
        razorpaySubscriptionId: 'sub_atomic_restore_rollback',
        razorpayStatus: 'created',
      });
      await addOrganizationMembers(sub.organizationId, 'atomic-restore-rollback', {
        frozen: true,
      });

      const payload = makeChargedPayload({
        subscriptionId: 'sub_atomic_restore_rollback',
        paymentId: 'pay_atomic_restore_rollback',
        amount: 799900,
        planId: 'plan_test_corporate',
      });
      const reconcileSpy = vi
        .spyOn(orgsService, 'reconcileMemberSeats')
        .mockRejectedValueOnce(new Error('injected seat reconciliation failure'));

      await expect(
        processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_CHARGED, payload),
      ).rejects.toThrow('injected seat reconciliation failure');

      const [rolledBack] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(rolledBack).toMatchObject({
        subscriptionState: 'downgraded',
        planTier: 'hobby',
        preLapseTier: 'corporate',
      });
      expect(rolledBack!.downgradedAt).not.toBeNull();

      const rolledBackPayments = await db
        .select()
        .from(schema.paymentTransaction)
        .where(eq(schema.paymentTransaction.razorpayPaymentId, 'pay_atomic_restore_rollback'));
      expect(rolledBackPayments).toHaveLength(0);

      const retryResult = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_CHARGED, payload);
      expect(retryResult.outcome).toBe('processed');
      expect(reconcileSpy).toHaveBeenCalledTimes(2);
      reconcileSpy.mockRestore();

      const [retried] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(retried).toMatchObject({
        subscriptionState: 'active',
        planTier: 'corporate',
        preLapseTier: null,
        downgradedAt: null,
      });

      const retriedPayments = await db
        .select()
        .from(schema.paymentTransaction)
        .where(eq(schema.paymentTransaction.razorpayPaymentId, 'pay_atomic_restore_rollback'));
      expect(retriedPayments).toHaveLength(1);
    });

    it('persists raw payload in payment_transaction', async () => {
      await makeSubscription({
        planTier: 'professional_plus',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_payload_test',
      });

      const payload = makeChargedPayload({
        subscriptionId: 'sub_payload_test',
        paymentId: 'pay_payload_1',
        amount: 299900,
      });

      await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_CHARGED, payload);

      const [payment] = await db
        .select()
        .from(schema.paymentTransaction)
        .where(eq(schema.paymentTransaction.razorpayPaymentId, 'pay_payload_1'));
      expect(payment!.payload).toMatchObject({
        event: RAZORPAY_EVENT.SUBSCRIPTION_CHARGED,
        payload: expect.objectContaining({
          payment: expect.objectContaining({
            entity: expect.objectContaining({ id: 'pay_payload_1' }),
          }),
        }),
      });
    });
  });

  describe('payment.failed', () => {
    it('transitions active → payment_failed', async () => {
      const sub = await makeSubscription({
        planTier: 'professional_plus',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_fail_1',
      });

      const payload = makeSubscriptionPayload(RAZORPAY_EVENT.PAYMENT_FAILED, 'sub_fail_1', {
        status: 'halted',
      });

      const result = await processWebhookEvent(RAZORPAY_EVENT.PAYMENT_FAILED, payload);
      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated!.subscriptionState).toBe('payment_failed');
    });

    it('rejects payment.failed from non-active state', async () => {
      await makeSubscription({
        planTier: 'corporate',
        preLapseTier: 'corporate',
        subscriptionState: 'grace',
        razorpaySubscriptionId: 'sub_fail_invalid',
      });

      const payload = makeSubscriptionPayload(RAZORPAY_EVENT.PAYMENT_FAILED, 'sub_fail_invalid');

      const result = await processWebhookEvent(RAZORPAY_EVENT.PAYMENT_FAILED, payload);
      expect(result.outcome).toBe('invalid_transition');
    });
  });

  describe('subscription.halted', () => {
    it('transitions payment_failed → grace with timestamps', async () => {
      const sub = await makeSubscription({
        planTier: 'corporate',
        subscriptionState: 'payment_failed',
        razorpaySubscriptionId: 'sub_halt_1',
      });

      const payload = makeSubscriptionPayload(RAZORPAY_EVENT.SUBSCRIPTION_HALTED, 'sub_halt_1', {
        status: 'halted',
      });

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_HALTED, payload);
      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated!.subscriptionState).toBe('grace');
      expect(updated!.graceStartedAt).not.toBeNull();
      expect(updated!.preLapseTier).toBe('corporate');
    });

    it('rejects halted from active state', async () => {
      await makeSubscription({
        planTier: 'professional_plus',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_halt_invalid',
      });

      const payload = makeSubscriptionPayload(
        RAZORPAY_EVENT.SUBSCRIPTION_HALTED,
        'sub_halt_invalid',
      );

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_HALTED, payload);
      expect(result.outcome).toBe('invalid_transition');
    });
  });

  describe('subscription.cancelled', () => {
    it('freezes excess seats when Corporate downgrades to Hobby', async () => {
      const sub = await makeSubscription({
        planTier: 'corporate',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_cancel_freeze_members',
      });
      await addOrganizationMembers(sub.organizationId, 'cancel-freeze');

      const result = await processWebhookEvent(
        RAZORPAY_EVENT.SUBSCRIPTION_CANCELLED,
        makeSubscriptionPayload(
          RAZORPAY_EVENT.SUBSCRIPTION_CANCELLED,
          'sub_cancel_freeze_members',
          { status: 'cancelled' },
        ),
      );

      expect(result.outcome).toBe('processed');
      const members = await db
        .select({ role: schema.member.role, frozen: schema.member.frozen })
        .from(schema.member)
        .where(eq(schema.member.organizationId, sub.organizationId));
      expect(members.filter(({ frozen }) => frozen)).toHaveLength(2);
      expect(members.find(({ role }) => role === 'owner')?.frozen).toBe(false);
    });

    it('from active → sets hobby + clears fields', async () => {
      const sub = await makeSubscription({
        planTier: 'corporate',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_cancel_active',
      });

      const payload = makeSubscriptionPayload(
        RAZORPAY_EVENT.SUBSCRIPTION_CANCELLED,
        'sub_cancel_active',
        { status: 'cancelled' },
      );

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_CANCELLED, payload);
      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated!.planTier).toBe('hobby');
      expect(updated!.subscriptionState).toBe('active');
      expect(updated!.razorpaySubscriptionId).toBeNull();
      expect(updated!.razorpayStatus).toBeNull();
    });

    it('from grace → clears lapse fields', async () => {
      const sub = await makeSubscription({
        planTier: 'professional_plus',
        subscriptionState: 'grace',
        razorpaySubscriptionId: 'sub_cancel_grace',
      });

      const payload = makeSubscriptionPayload(
        RAZORPAY_EVENT.SUBSCRIPTION_CANCELLED,
        'sub_cancel_grace',
        { status: 'cancelled' },
      );

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_CANCELLED, payload);
      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated!.planTier).toBe('hobby');
      expect(updated!.subscriptionState).toBe('active');
      expect(updated!.graceStartedAt).toBeNull();
      expect(updated!.preLapseTier).toBeNull();
    });

    it('from locked → clears all lapse fields', async () => {
      const sub = await makeSubscription({
        planTier: 'corporate',
        preLapseTier: 'corporate',
        subscriptionState: 'locked',
        razorpaySubscriptionId: 'sub_cancel_locked',
      });

      const payload = makeSubscriptionPayload(
        RAZORPAY_EVENT.SUBSCRIPTION_CANCELLED,
        'sub_cancel_locked',
        { status: 'cancelled' },
      );

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_CANCELLED, payload);
      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated!.planTier).toBe('hobby');
      expect(updated!.graceStartedAt).toBeNull();
      expect(updated!.lockedAt).toBeNull();
      expect(updated!.preLapseTier).toBeNull();
    });

    it('ignores cancellation for downgraded subscription', async () => {
      await makeSubscription({
        planTier: 'hobby',
        subscriptionState: 'downgraded',
        razorpaySubscriptionId: 'sub_cancel_downgraded',
      });

      const payload = makeSubscriptionPayload(
        RAZORPAY_EVENT.SUBSCRIPTION_CANCELLED,
        'sub_cancel_downgraded',
        { status: 'cancelled' },
      );

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_CANCELLED, payload);
      expect(result.outcome).toBe('ignored');
    });
  });

  describe('subscription.pending', () => {
    it('updates razorpayStatus only — no state change', async () => {
      const sub = await makeSubscription({
        planTier: 'professional_plus',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_pending_1',
      });

      const payload = makeSubscriptionPayload(
        RAZORPAY_EVENT.SUBSCRIPTION_PENDING,
        'sub_pending_1',
        { status: 'pending' },
      );

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_PENDING, payload);
      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated!.subscriptionState).toBe('active');
      expect(updated!.razorpayStatus).toBe('pending');
    });
  });

  describe('unknown/missing subscription', () => {
    it('ignores events for non-existent subscriptions', async () => {
      const payload = makeSubscriptionPayload(
        RAZORPAY_EVENT.SUBSCRIPTION_CHARGED,
        'sub_does_not_exist',
      );
      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_CHARGED, payload);
      expect(result.outcome).toBe('ignored');
    });
  });

  describe('out-of-order events', () => {
    it('stale halted after reactivation is rejected', async () => {
      // Org was in grace, charged reactivated them back to active
      await makeSubscription({
        planTier: 'corporate',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_stale_halted',
      });

      // Stale halted arrives — should fail (only valid from payment_failed)
      const payload = makeSubscriptionPayload(
        RAZORPAY_EVENT.SUBSCRIPTION_HALTED,
        'sub_stale_halted',
      );

      const result = await processWebhookEvent(RAZORPAY_EVENT.SUBSCRIPTION_HALTED, payload);
      expect(result.outcome).toBe('invalid_transition');
    });

    it('stale payment.failed after reactivation is valid (new failure)', async () => {
      // After reactivation, subscription is active again. A new payment.failed
      // is valid — it means the NEXT billing cycle failed.
      const sub = await makeSubscription({
        planTier: 'professional_plus',
        subscriptionState: 'active',
        razorpaySubscriptionId: 'sub_new_fail_after_reactivation',
      });

      const payload = makeSubscriptionPayload(
        RAZORPAY_EVENT.PAYMENT_FAILED,
        'sub_new_fail_after_reactivation',
      );

      const result = await processWebhookEvent(RAZORPAY_EVENT.PAYMENT_FAILED, payload);
      expect(result.outcome).toBe('processed');

      const [updated] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(updated!.subscriptionState).toBe('payment_failed');
    });
  });
});
