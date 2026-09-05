import {
  and,
  asc,
  db,
  desc,
  eq,
  freezeMembersToLimitOnTx,
  inArray,
  lte,
  restoreMembersToLimitOnTx,
  schema,
  sql,
} from '@repo/db';
import { branchLimit, seatLimit, type PlanTier, type SubscriptionState } from '@repo/contracts';

/**
 * Worker-local data access for the E-239 plan-lapse lifecycle engine.
 *
 * Owns the periodic sweep queries and the time-based state transitions
 * (grace → locked, locked → downgraded) plus the member-seat freeze/restore that
 * a downgrade/reactivation triggers.
 *
 * Design guarantees:
 * - Every transition is a state-guarded UPDATE (`WHERE subscription_state = <from>`),
 *   so a re-run is a no-op and a concurrent reactivation that already flipped the
 *   row to `active` causes zero rows to match — a paying org can never be downgraded
 *   by a racing sweep (the state predicate is the compare-and-set).
 * - Transitions take a `FOR UPDATE` row lock so the sweep and the Razorpay webhook
 *   serialize on the same subscription row.
 * - Seat and branch freeze/restore mirror the API ordering. Newest active resources
 *   freeze first, and the lowest freeze rank restores first.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type LapseCandidate = {
  id: string;
  organizationId: string;
};

/**
 * Grace subscriptions whose grace window has elapsed.
 * Uses the partial index `subscription_grace_sweep_idx`.
 */
export async function findGraceExpired(
  now: Date,
  graceDays: number,
  limit: number,
): Promise<LapseCandidate[]> {
  const cutoff = new Date(now.getTime() - graceDays * DAY_MS);
  return db
    .select({ id: schema.subscription.id, organizationId: schema.subscription.organizationId })
    .from(schema.subscription)
    .where(
      and(
        eq(schema.subscription.subscriptionState, 'grace'),
        lte(schema.subscription.graceStartedAt, cutoff),
      ),
    )
    .orderBy(asc(schema.subscription.graceStartedAt), asc(schema.subscription.id))
    .limit(limit);
}

/**
 * Locked subscriptions whose locked window has elapsed.
 * Uses the partial index `subscription_locked_sweep_idx`.
 */
export async function findLockedExpired(
  now: Date,
  lockedDays: number,
  limit: number,
): Promise<LapseCandidate[]> {
  const cutoff = new Date(now.getTime() - lockedDays * DAY_MS);
  return db
    .select({ id: schema.subscription.id, organizationId: schema.subscription.organizationId })
    .from(schema.subscription)
    .where(
      and(
        eq(schema.subscription.subscriptionState, 'locked'),
        lte(schema.subscription.lockedAt, cutoff),
      ),
    )
    .orderBy(asc(schema.subscription.lockedAt), asc(schema.subscription.id))
    .limit(limit);
}

/**
 * grace → locked. Sets locked_at, preserves plan_tier and pre_lapse_tier
 * (CHECK requires plan_tier = pre_lapse_tier while locked).
 *
 * Returns true when the row transitioned (matched the guard), false when a
 * concurrent writer already changed the state.
 */
export async function transitionGraceToLocked(subscriptionId: string, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ state: schema.subscription.subscriptionState })
      .from(schema.subscription)
      .where(eq(schema.subscription.id, subscriptionId))
      .for('update')
      .limit(1);

    // Re-check under the lock: a reactivation webhook may have flipped it to active.
    if (!row || row.state !== 'grace') return false;

    await tx
      .update(schema.subscription)
      .set({ subscriptionState: 'locked', lockedAt: now })
      .where(
        and(
          eq(schema.subscription.id, subscriptionId),
          eq(schema.subscription.subscriptionState, 'grace'),
        ),
      );
    return true;
  });
}

/**
 * locked → downgraded. Sets downgraded_at, moves plan_tier to 'hobby' (CHECK
 * requires this while downgraded), preserves pre_lapse_tier for restoration.
 * Freezes over-limit seats and branches in the same transaction so entitlement
 * and freeze state cannot diverge.
 *
 * Returns true when the row transitioned, false when a concurrent writer won.
 */
export async function transitionLockedToDowngraded(
  subscriptionId: string,
  now: Date,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        state: schema.subscription.subscriptionState,
        organizationId: schema.subscription.organizationId,
      })
      .from(schema.subscription)
      .where(eq(schema.subscription.id, subscriptionId))
      .for('update')
      .limit(1);

    if (!row || row.state !== 'locked') return false;

    await tx
      .update(schema.subscription)
      .set({ subscriptionState: 'downgraded', downgradedAt: now, planTier: 'hobby' })
      .where(
        and(
          eq(schema.subscription.id, subscriptionId),
          eq(schema.subscription.subscriptionState, 'locked'),
        ),
      );

    // Downgraded tier is Hobby. Freeze each resource above its Hobby limit in
    // this transaction with the subscription state change.
    await freezeMembersToLimitOnTx(tx, {
      organizationId: row.organizationId,
      activeLimit: seatLimit('hobby', 'active'),
      now,
    });
    await freezeBranchesToLimitOnTx(tx, {
      organizationId: row.organizationId,
      activeLimit: branchLimit('hobby', 'active'),
      now,
    });
    return true;
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function freezeBranchesToLimitOnTx(
  tx: Tx,
  input: { organizationId: string; activeLimit: number; now: Date },
): Promise<void> {
  if (input.activeLimit < 0) return;

  const activeBranches = await tx
    .select({ id: schema.team.id })
    .from(schema.team)
    .where(
      and(eq(schema.team.organizationId, input.organizationId), eq(schema.team.frozen, false)),
    )
    .orderBy(desc(schema.team.createdAt), desc(schema.team.id))
    .for('update');
  const ids = activeBranches
    .slice(0, Math.max(0, activeBranches.length - input.activeLimit))
    .map(({ id }) => id);
  if (ids.length === 0) return;

  const [rankRow] = await tx
    .select({ rank: sql<number | null>`max(${schema.team.freezeRank})` })
    .from(schema.team)
    .where(eq(schema.team.organizationId, input.organizationId));
  const startingRank = (rankRow?.rank ?? 0) + 1;

  for (const [index, id] of ids.entries()) {
    await tx
      .update(schema.team)
      .set({ frozen: true, frozenAt: input.now, freezeRank: startingRank + index })
      .where(and(eq(schema.team.id, id), eq(schema.team.frozen, false)));
  }

  await tx
    .update(schema.session)
    .set({ activeTeamId: null })
    .where(inArray(schema.session.activeTeamId, ids));
}

/**
 * Restore up to `activeLimit` seats for an organization, lowest freeze_rank first.
 * Idempotent: converges to the correct active-seat count on every run.
 * Called on reactivation from locked/downgraded when the plan tier is restored.
 */
export async function restoreMembersToLimit(
  organizationId: string,
  tier: PlanTier,
  state: SubscriptionState,
): Promise<string[]> {
  const activeLimit = seatLimit(tier, state);
  return db.transaction((tx) => restoreMembersToLimitOnTx(tx, { organizationId, activeLimit }));
}
