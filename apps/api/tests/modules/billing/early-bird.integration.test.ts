import { describe, expect, it } from 'vitest';
import { claimEarlyBird, earlyBirdStatus, expireEarlyBird } from '@repo/billing';
import { db, schema, eq, effectivePlanTier } from '@repo/db';
import { makeOrganization, makeSubscription, makeTeam, makeUser } from '@repo/db/testing';
import { EARLY_BIRD_DEADLINE } from '@repo/contracts';

const start = new Date('2026-10-31T10:00:00.000Z');

describe('no-card early-bird trials', () => {
  it.each(['requested', 'processing', 'reconciliation_pending'] as const)(
    'blocks a trial while a paid checkout is %s, even without a persisted provider ID',
    async (status) => {
      const org = await makeOrganization();
      const operationId = '77777777-7777-4777-8777-777777777777';
      await db.insert(schema.billingOperation).values({
        operationId,
        organizationId: org.id,
        targetTier: 'professional_plus',
        kind: 'subscribe',
        stateRevision: 'checkout-before-provider-response',
        status,
      });

      expect(await earlyBirdStatus(org.id, start)).toEqual({ eligible: false, trial: null });
      expect(await claimEarlyBird(org.id, 'corporate', start)).toBeNull();
      expect(await db.select().from(schema.subscription)).toHaveLength(0);

      // A definitive rejection makes a fresh organization eligible again.
      await db
        .update(schema.billingOperation)
        .set({ status: 'failed' })
        .where(eq(schema.billingOperation.operationId, operationId));
      expect(await earlyBirdStatus(org.id, start)).toEqual({ eligible: true, trial: null });
      expect(await claimEarlyBird(org.id, 'corporate', start)).toMatchObject({ tier: 'corporate' });
    },
  );

  it('grants the selected tier exactly once under concurrent requests, without a provider subscription', async () => {
    const org = await makeOrganization();
    const results = await Promise.all([
      claimEarlyBird(org.id, 'corporate', start),
      claimEarlyBird(org.id, 'corporate', start),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0]?.endsAt).toBe('2027-01-31T10:00:00.000Z');
    const [row] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, org.id));
    expect(row).toMatchObject({
      planTier: 'corporate',
      subscriptionState: 'active',
      razorpaySubscriptionId: null,
      earlyBirdTier: 'corporate',
    });
    expect(await claimEarlyBird(org.id, 'professional_plus', start)).toBeNull();
    expect(await claimEarlyBird(org.id, 'corporate', new Date('2026-11-15'))).toEqual(results[0]);
  });

  it('rejects claims at the deadline and for existing provider customers', async () => {
    const fresh = await makeOrganization();
    expect(
      await claimEarlyBird(fresh.id, 'professional_plus', new Date(EARLY_BIRD_DEADLINE)),
    ).toBeNull();
    const paid = await makeSubscription({
      planTier: 'professional_plus',
      razorpaySubscriptionId: 'sub_existing',
    });
    expect(await claimEarlyBird(paid.organizationId, 'corporate', start)).toBeNull();
    const former = await makeSubscription({ planTier: 'hobby', razorpayStatus: 'cancelled' });
    expect(await claimEarlyBird(former.organizationId, 'corporate', start)).toBeNull();
  });

  it('expires to Hobby and freezes excess resources without deleting them or allowing a second trial', async () => {
    const org = await makeOrganization();
    await claimEarlyBird(org.id, 'corporate', new Date('2026-01-01'));
    const owner = await makeUser();
    const member = await makeUser();
    await db.insert(schema.member).values([
      {
        id: 'trial-owner',
        organizationId: org.id,
        userId: owner.id,
        role: 'owner',
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 'trial-member',
        organizationId: org.id,
        userId: member.id,
        role: 'member',
        createdAt: new Date('2026-01-02'),
      },
    ]);
    await makeTeam({ organizationId: org.id, name: 'Main' });
    await makeTeam({ organizationId: org.id, name: 'Second' });
    const [effective] = await db
      .select({ tier: effectivePlanTier() })
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, org.id));
    expect(effective?.tier).toBe('hobby');
    expect(await expireEarlyBird(org.id, new Date('2026-04-01'))).toBe(true);
    expect(await expireEarlyBird(org.id, new Date('2026-04-01'))).toBe(false);
    expect(await claimEarlyBird(org.id, 'corporate', start)).toBeNull();
    const members = await db
      .select()
      .from(schema.member)
      .where(eq(schema.member.organizationId, org.id));
    expect(members).toHaveLength(2);
    expect(members.filter((member) => member.frozen)).toHaveLength(1);
    const branches = await db
      .select()
      .from(schema.team)
      .where(eq(schema.team.organizationId, org.id));
    expect(branches).toHaveLength(2);
    expect(branches.filter((branch) => branch.frozen)).toHaveLength(1);
    expect(await earlyBirdStatus(org.id, start)).toEqual({ eligible: false, trial: null });
  });

  it('never downgrades a paid activation that won the subscription lock', async () => {
    const org = await makeOrganization();
    await claimEarlyBird(org.id, 'professional_plus', start);
    await db
      .update(schema.subscription)
      .set({ razorpaySubscriptionId: 'sub_paid', razorpayStatus: 'active' })
      .where(eq(schema.subscription.organizationId, org.id));
    expect(await expireEarlyBird(org.id, new Date('2027-02-01'))).toBe(false);
    const [row] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, org.id));
    expect(row?.planTier).toBe('professional_plus');
  });
});
