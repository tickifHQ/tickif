import { describe, expect, it } from 'vitest';
import { and, db, eq, schema, selectMemberIdsToFreeze } from '@repo/db';
import { config } from '@repo/config';
import { makeOrganization, makeSubscription, makeTeam, makeUser } from '@repo/db/testing';
import {
  findGraceExpired,
  findLockedExpired,
  transitionGraceToLocked,
  transitionLockedToDowngraded,
  restoreMembersToLimit,
} from '../../src/billing-lifecycle/repository.js';
import { processBillingLifecycleSweep } from '../../src/jobs/billing-lifecycle.js';

/**
 * E-239 plan-lapse lifecycle engine — integration tests (seats-first).
 *
 * Covers grace→locked and locked→downgraded time-based transitions, idempotent
 * repeated sweeps, charge-wins concurrency, seat freeze/restore with persisted
 * ordering, and config-driven windows. Uses relative offsets against the
 * configured windows and injected `now` clocks — no real time dependence.
 *
 * Branch freeze/restore is intentionally NOT tested here (owned by E-244).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_DAYS = config.BILLING_GRACE_PERIOD_DAYS;
const LOCKED_DAYS = config.BILLING_LOCKED_PERIOD_DAYS;

let memberSeq = 0;

/** Insert a member row directly (no makeMember helper exists). */
async function addMember(
  organizationId: string,
  role: 'owner' | 'member',
  createdAt: Date,
): Promise<string> {
  const user = await makeUser({ phoneNumber: `+9198000${String(memberSeq++).padStart(5, '0')}` });
  const id = `e239-mbr-${organizationId}-${memberSeq}`;
  await db.insert(schema.member).values({
    id,
    organizationId,
    userId: user.id,
    role,
    createdAt,
  });
  return id;
}

/** A grace subscription whose grace window started `daysAgo` days before `now`. */
async function makeGraceSubscription(now: Date, daysAgo: number) {
  const org = await makeOrganization();
  const sub = await makeSubscription({
    organizationId: org.id,
    planTier: 'professional_plus',
    subscriptionState: 'grace',
    graceStartedAt: new Date(now.getTime() - daysAgo * DAY_MS),
    preLapseTier: 'professional_plus',
    razorpayStatus: 'halted',
  });
  return { org, sub };
}

/** A locked subscription whose locked window started `daysAgo` days before `now`. */
async function makeLockedSubscription(now: Date, daysAgo: number) {
  const org = await makeOrganization();
  const sub = await makeSubscription({
    organizationId: org.id,
    planTier: 'professional_plus',
    subscriptionState: 'locked',
    graceStartedAt: new Date(now.getTime() - (daysAgo + GRACE_DAYS) * DAY_MS),
    lockedAt: new Date(now.getTime() - daysAgo * DAY_MS),
    preLapseTier: 'professional_plus',
    razorpayStatus: 'halted',
  });
  return { org, sub };
}

async function readState(id: string) {
  const [row] = await db
    .select({
      state: schema.subscription.subscriptionState,
      tier: schema.subscription.planTier,
      lockedAt: schema.subscription.lockedAt,
      downgradedAt: schema.subscription.downgradedAt,
      preLapseTier: schema.subscription.preLapseTier,
    })
    .from(schema.subscription)
    .where(eq(schema.subscription.id, id));
  return row!;
}

async function countFrozen(organizationId: string): Promise<number> {
  const rows = await db
    .select({ frozen: schema.member.frozen })
    .from(schema.member)
    .where(eq(schema.member.organizationId, organizationId));
  return rows.filter((r) => r.frozen).length;
}

async function frozenBranches(organizationId: string) {
  return db
    .select({ id: schema.team.id, frozen: schema.team.frozen, freezeRank: schema.team.freezeRank })
    .from(schema.team)
    .where(eq(schema.team.organizationId, organizationId));
}

describe('E-239 grace → locked transition', () => {
  it('transitions a grace subscription past its window to locked', async () => {
    const now = new Date();
    const { sub } = await makeGraceSubscription(now, GRACE_DAYS + 1);

    const due = await findGraceExpired(now, GRACE_DAYS, 100);
    expect(due.some((c) => c.id === sub.id)).toBe(true);

    expect(await transitionGraceToLocked(sub.id, now)).toBe(true);

    const after = await readState(sub.id);
    expect(after.state).toBe('locked');
    expect(after.lockedAt).not.toBeNull();
    expect(after.tier).toBe('professional_plus'); // tier preserved while locked
    expect(after.preLapseTier).toBe('professional_plus');
  });

  it('does not transition a grace subscription still inside its window', async () => {
    const now = new Date();
    const { sub } = await makeGraceSubscription(now, GRACE_DAYS - 1);

    const due = await findGraceExpired(now, GRACE_DAYS, 100);
    expect(due.some((c) => c.id === sub.id)).toBe(false);
  });

  it('starts sweep eligibility at the displayed deadline', async () => {
    const now = new Date('2026-09-08T00:00:00.000Z');
    const atDeadline = await makeGraceSubscription(now, GRACE_DAYS);
    const pastDeadline = await makeGraceSubscription(now, GRACE_DAYS);
    await db
      .update(schema.subscription)
      .set({ graceStartedAt: new Date(now.getTime() - GRACE_DAYS * DAY_MS - 1) })
      .where(eq(schema.subscription.id, pastDeadline.sub.id));

    const due = await findGraceExpired(now, GRACE_DAYS, 100);

    expect(due.some(({ id }) => id === atDeadline.sub.id)).toBe(true);
    expect(due.some(({ id }) => id === pastDeadline.sub.id)).toBe(true);
  });
});

describe('E-239 locked → downgraded transition', () => {
  it('transitions a locked subscription past its window to downgraded (hobby)', async () => {
    const now = new Date();
    const { sub } = await makeLockedSubscription(now, LOCKED_DAYS + 1);

    const due = await findLockedExpired(now, LOCKED_DAYS, 100);
    expect(due.some((c) => c.id === sub.id)).toBe(true);

    expect(await transitionLockedToDowngraded(sub.id, now)).toBe(true);

    const after = await readState(sub.id);
    expect(after.state).toBe('downgraded');
    expect(after.tier).toBe('hobby'); // tier dropped to hobby
    expect(after.downgradedAt).not.toBeNull();
    expect(after.preLapseTier).toBe('professional_plus'); // preserved for restore
  });

  it('does not transition a locked subscription still inside its window', async () => {
    const now = new Date();
    const { sub } = await makeLockedSubscription(now, LOCKED_DAYS - 1);

    const due = await findLockedExpired(now, LOCKED_DAYS, 100);
    expect(due.some((c) => c.id === sub.id)).toBe(false);
  });
});

describe('E-239 idempotency', () => {
  it('re-running the grace→locked transition is a no-op (state-guarded)', async () => {
    const now = new Date();
    const { sub } = await makeGraceSubscription(now, GRACE_DAYS + 1);

    expect(await transitionGraceToLocked(sub.id, now)).toBe(true);
    // Second call: already locked → guard matches nothing → false.
    expect(await transitionGraceToLocked(sub.id, now)).toBe(false);

    const after = await readState(sub.id);
    expect(after.state).toBe('locked');
  });

  it('repeated sweeps do not double-process the same subscription', async () => {
    const now = new Date();
    const { sub } = await makeGraceSubscription(now, GRACE_DAYS + 1);

    const first = await processBillingLifecycleSweep(now);
    expect(first.lockedFromGrace).toBeGreaterThanOrEqual(1);

    const second = await processBillingLifecycleSweep(now);
    // Already locked — not counted again as grace→locked.
    const stillGrace = await findGraceExpired(now, GRACE_DAYS, 100);
    expect(stillGrace.some((c) => c.id === sub.id)).toBe(false);
    expect(second.lockedFromGrace).toBe(0);
  });
});

describe('E-239 charge-wins concurrency', () => {
  it('a reactivation committed while a sweep is waiting on the row lock wins the race', async () => {
    const now = new Date();
    const { sub } = await makeLockedSubscription(now, LOCKED_DAYS + 1);

    let sweepTransition!: Promise<boolean>;
    let sweepSettled = false;

    await db.transaction(async (reactivationTx) => {
      // Hold the same row lock that the charge/reactivation transaction uses.
      await reactivationTx
        .select({ id: schema.subscription.id })
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id))
        .for('update');

      // Start the sweep before committing the reactivation. Its transaction must
      // wait on the row lock, making this a real overlap rather than a sequential
      // state-guard check.
      sweepTransition = transitionLockedToDowngraded(sub.id, now);
      void sweepTransition.then(
        () => {
          sweepSettled = true;
        },
        () => {
          sweepSettled = true;
        },
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(sweepSettled).toBe(false);

      await reactivationTx
        .update(schema.subscription)
        .set({
          subscriptionState: 'active',
          planTier: 'professional_plus',
          graceStartedAt: null,
          lockedAt: null,
          downgradedAt: null,
          preLapseTier: null,
          razorpayStatus: 'active',
        })
        .where(eq(schema.subscription.id, sub.id));
    });

    // Once the reactivation commits and releases the lock, the sweep observes
    // `active`, fails its guarded update, and cannot downgrade the subscription.
    expect(await sweepTransition).toBe(false);

    const after = await readState(sub.id);
    expect(after.state).toBe('active');
    expect(after.tier).toBe('professional_plus');
  });
});

describe('E-239 seat freeze on downgrade', () => {
  it('freezes over-limit non-owner seats newest-first when downgrading', async () => {
    const now = new Date();
    const { org, sub } = await makeLockedSubscription(now, LOCKED_DAYS + 1);

    // Owner + 2 members. Hobby seat limit is 1 → 2 non-owner members freeze.
    await addMember(org.id, 'owner', new Date(now.getTime() - 10 * DAY_MS));
    await addMember(org.id, 'member', new Date(now.getTime() - 5 * DAY_MS)); // older
    await addMember(org.id, 'member', new Date(now.getTime() - 2 * DAY_MS)); // newest

    expect(await transitionLockedToDowngraded(sub.id, now)).toBe(true);

    // 2 members frozen, owner never frozen.
    expect(await countFrozen(org.id)).toBe(2);
    const owner = await db
      .select({ frozen: schema.member.frozen })
      .from(schema.member)
      .where(and(eq(schema.member.organizationId, org.id), eq(schema.member.role, 'owner')));
    expect(owner[0]?.frozen).toBe(false);
  });

  it('preserves only the oldest owner when selecting legacy multi-owner candidates', () => {
    const candidates = [
      { id: 'new-owner', role: 'owner', createdAt: new Date('2026-08-04') },
      { id: 'new-member', role: 'member', createdAt: new Date('2026-08-03') },
      { id: 'old-owner', role: 'owner', createdAt: new Date('2026-08-01') },
    ];

    expect(selectMemberIdsToFreeze(candidates, 1)).toEqual(['new-owner', 'new-member']);
    expect(selectMemberIdsToFreeze(candidates, -1)).toEqual([]);
  });

  it('freezes excess branches newest-first with stable ranks in the downgrade transaction', async () => {
    const now = new Date();
    const { org, sub } = await makeLockedSubscription(now, LOCKED_DAYS + 1);
    const oldest = await makeTeam({
      organizationId: org.id,
      name: 'Oldest Branch',
      createdAt: new Date(now.getTime() - 10 * DAY_MS),
    });
    const middle = await makeTeam({
      organizationId: org.id,
      name: 'Middle Branch',
      createdAt: new Date(now.getTime() - 5 * DAY_MS),
    });
    const newest = await makeTeam({
      organizationId: org.id,
      name: 'Newest Branch',
      createdAt: new Date(now.getTime() - 2 * DAY_MS),
    });

    expect(await transitionLockedToDowngraded(sub.id, now)).toBe(true);

    const branches = await frozenBranches(org.id);
    expect(branches.find(({ id }) => id === oldest.id)).toMatchObject({
      frozen: false,
      freezeRank: null,
    });
    expect(branches.find(({ id }) => id === newest.id)).toMatchObject({
      frozen: true,
      freezeRank: 1,
    });
    expect(branches.find(({ id }) => id === middle.id)).toMatchObject({
      frozen: true,
      freezeRank: 2,
    });

    expect(await transitionLockedToDowngraded(sub.id, now)).toBe(false);
    expect(await frozenBranches(org.id)).toEqual(expect.arrayContaining(branches));
  });
});

describe('E-239 seat restore on reactivation', () => {
  it('restores frozen seats lowest freeze_rank first when the tier is restored', async () => {
    const now = new Date();
    const { org, sub } = await makeLockedSubscription(now, LOCKED_DAYS + 1);
    await addMember(org.id, 'owner', new Date(now.getTime() - 10 * DAY_MS));
    await addMember(org.id, 'member', new Date(now.getTime() - 5 * DAY_MS));
    await addMember(org.id, 'member', new Date(now.getTime() - 2 * DAY_MS));

    await transitionLockedToDowngraded(sub.id, now);
    expect(await countFrozen(org.id)).toBe(2);

    // Reactivation to corporate (unlimited seats) restores all frozen members.
    const restored = await restoreMembersToLimit(org.id, 'corporate', 'active');
    expect(restored.length).toBe(2);
    expect(await countFrozen(org.id)).toBe(0);
  });

  it('restore is idempotent — a second call restores nothing more', async () => {
    const now = new Date();
    const { org, sub } = await makeLockedSubscription(now, LOCKED_DAYS + 1);
    await addMember(org.id, 'owner', new Date(now.getTime() - 10 * DAY_MS));
    await addMember(org.id, 'member', new Date(now.getTime() - 2 * DAY_MS));

    await transitionLockedToDowngraded(sub.id, now);
    await restoreMembersToLimit(org.id, 'corporate', 'active');
    const second = await restoreMembersToLimit(org.id, 'corporate', 'active');
    expect(second.length).toBe(0);
  });
});

describe('E-239 config-driven windows', () => {
  it('uses the configured grace window as the transition threshold', async () => {
    const now = new Date();
    // Exactly at the window boundary minus a hair — not yet due.
    const notDue = await makeGraceSubscription(now, GRACE_DAYS - 0.5);
    // The exact deadline is due, so no extra sweep interval is added.
    const due = await makeGraceSubscription(now, GRACE_DAYS);

    const expired = await findGraceExpired(now, GRACE_DAYS, 100);
    const ids = expired.map((c) => c.id);
    expect(ids).toContain(due.sub.id);
    expect(ids).not.toContain(notDue.sub.id);
  });

  it('includes a locked subscription at the exact downgrade deadline', async () => {
    const now = new Date();
    const notDue = await makeLockedSubscription(now, LOCKED_DAYS - 0.5);
    const due = await makeLockedSubscription(now, LOCKED_DAYS);

    const expired = await findLockedExpired(now, LOCKED_DAYS, 100);
    const ids = expired.map((candidate) => candidate.id);
    expect(ids).toContain(due.sub.id);
    expect(ids).not.toContain(notDue.sub.id);
  });
});

describe('E-239 full sweep tick', () => {
  it('advances grace→locked and locked→downgraded in one tick', async () => {
    const now = new Date();
    const grace = await makeGraceSubscription(now, GRACE_DAYS + 1);
    const locked = await makeLockedSubscription(now, LOCKED_DAYS + 1);

    const result = await processBillingLifecycleSweep(now);
    expect(result.lockedFromGrace).toBeGreaterThanOrEqual(1);
    expect(result.downgradedFromLocked).toBeGreaterThanOrEqual(1);

    expect((await readState(grace.sub.id)).state).toBe('locked');
    expect((await readState(locked.sub.id)).state).toBe('downgraded');
  });
});

describe('E-239 folded org-retention expiry', () => {
  it('expires stale pending invitations in the same sweep tick', async () => {
    const now = new Date();
    const org = await makeOrganization();
    const inviter = await makeUser({
      phoneNumber: `+9198000${String(memberSeq++).padStart(5, '0')}`,
    });
    await db.insert(schema.invitation).values({
      id: `e239-inv-${org.id}`,
      organizationId: org.id,
      email: 'stale@example.com',
      role: 'member',
      status: 'pending',
      expiresAt: new Date(now.getTime() - 1 * DAY_MS), // already past expiry
      inviterId: inviter.id,
    });

    const result = await processBillingLifecycleSweep(now);
    expect(result.invitationsExpired).toBeGreaterThanOrEqual(1);

    const [invite] = await db
      .select({ status: schema.invitation.status })
      .from(schema.invitation)
      .where(eq(schema.invitation.id, `e239-inv-${org.id}`));
    expect(invite?.status).toBe('expired');
  });
});
