import { describe, expect, it } from 'vitest';
import { and, db, eq, schema } from '@repo/db';
import { makeOrganization, makeSubscription, makeUser } from '@repo/db/testing';
import { orgsRepository } from '../../../src/modules/orgs/repository.js';
import { orgsService } from '../../../src/modules/orgs/service.js';

/**
 * E-239 seat freeze/restore ordering — real-DB integration.
 *
 * Proves the persisted freeze order survives new members being added after a
 * downgrade and any subsequent reconciliation: original frozen members keep
 * their original freeze_rank, and restore returns them in that order.
 */

let seq = 0;

async function addMember(
  organizationId: string,
  role: 'owner' | 'member',
  createdAt: Date,
): Promise<string> {
  const user = await makeUser({ phoneNumber: `+9197000${String(seq++).padStart(5, '0')}` });
  const id = `seatorder-${organizationId}-${seq}`;
  await db.insert(schema.member).values({ id, organizationId, userId: user.id, role, createdAt });
  return id;
}

async function rankOf(memberId: string): Promise<number | null> {
  const [row] = await db
    .select({ rank: schema.member.freezeRank, frozen: schema.member.frozen })
    .from(schema.member)
    .where(eq(schema.member.id, memberId));
  return row?.frozen ? (row.rank ?? null) : null;
}

const DAY = 24 * 60 * 60 * 1000;

describe('E-239 persisted freeze-order preservation', () => {
  it('keeps original freeze_ranks when new members are added and re-frozen; restores originals first', async () => {
    const now = new Date();
    const org = await makeOrganization();
    // Hobby plan → seat limit 1 (owner keeps the single active seat).
    await makeSubscription({ organizationId: org.id, planTier: 'hobby', subscriptionState: 'active' });

    await addMember(org.id, 'owner', new Date(now.getTime() - 30 * DAY));
    // 3 members present at downgrade — oldest to newest.
    const m1 = await addMember(org.id, 'member', new Date(now.getTime() - 20 * DAY));
    const m2 = await addMember(org.id, 'member', new Date(now.getTime() - 15 * DAY));
    const m3 = await addMember(org.id, 'member', new Date(now.getTime() - 10 * DAY));

    // First freeze: all 3 non-owner members exceed the hobby limit of 1.
    await orgsService.reconcileMemberSeats(org.id, now);

    const r1 = await rankOf(m1);
    const r2 = await rankOf(m2);
    const r3 = await rankOf(m3);
    // All frozen. Freeze walks active members newest-first (desc createdAt) and
    // assigns freezeRank = startingRank + index, so the NEWEST frozen member
    // gets the LOWEST rank: r3 < r2 < r1 (oldest carries the highest rank).
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r3).not.toBeNull();
    expect(r1!).toBeGreaterThan(r2!);
    expect(r2!).toBeGreaterThan(r3!);

    // Add 2 NEW members after the downgrade.
    const m4 = await addMember(org.id, 'member', new Date(now.getTime() - 2 * DAY));
    const m5 = await addMember(org.id, 'member', new Date(now.getTime() - 1 * DAY));

    // Re-reconcile at the same hobby limit: the 2 new active members get frozen
    // with NEW higher ranks; the original three must keep their ranks unchanged.
    await orgsService.reconcileMemberSeats(org.id, new Date(now.getTime() + 1000));

    expect(await rankOf(m1)).toBe(r1); // unchanged
    expect(await rankOf(m2)).toBe(r2); // unchanged
    expect(await rankOf(m3)).toBe(r3); // unchanged
    const r4 = await rankOf(m4);
    const r5 = await rankOf(m5);
    expect(r4).not.toBeNull();
    expect(r5).not.toBeNull();
    // New members ranked ABOVE every original (startingRank = prior max + 1), so
    // they are frozen after and restored after. Newest-first again: r5 < r4, and
    // both exceed the highest original rank (r1). Existing ranks never rewritten.
    expect(r4!).toBeGreaterThan(r5!);
    expect(r5!).toBeGreaterThan(r1!);

    // Restore to Corporate (unlimited): all restored, lowest freeze_rank first.
    // Persisted order → m3, m2, m1 (originals, in rank order) then m5, m4.
    const restored = await orgsRepository.restoreMembersToLimit({
      organizationId: org.id,
      activeLimit: -1,
    });
    // The original three are restored first, in their persisted rank order.
    expect(restored.slice(0, 3)).toEqual([m3, m2, m1]);
    // The two later-added members restore after the originals.
    expect(restored.slice(3)).toEqual([m5, m4]);
    // Everyone unfrozen now.
    const frozen = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(and(eq(schema.member.organizationId, org.id), eq(schema.member.frozen, true)));
    expect(frozen).toEqual([]);
  });
});
