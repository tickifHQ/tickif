import { and, asc, desc, eq, inArray, max, sql } from 'drizzle-orm';
import type { db } from './client.js';
import * as schema from './schema/index.js';

export type ActiveMemberFreezeCandidate = {
  id: string;
  role: string;
  createdAt: Date;
};

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type FreezeMembersToLimitInput = {
  organizationId: string;
  activeLimit: number;
  now: Date;
};

export type RestoreMembersToLimitInput = {
  organizationId: string;
  activeLimit: number;
};

/**
 * Select newest active seats for freezing while preserving exactly the oldest
 * owner. Callers must provide candidates ordered newest-first.
 */
export function selectMemberIdsToFreeze(
  activeMembersNewestFirst: readonly ActiveMemberFreezeCandidate[],
  activeLimit: number,
): string[] {
  if (activeLimit < 0) return [];
  const freezeCount = Math.max(0, activeMembersNewestFirst.length - activeLimit);
  const preservedOwnerId = [...activeMembersNewestFirst]
    .reverse()
    .find(({ role }) => role === 'owner')?.id;
  return activeMembersNewestFirst
    .filter(({ id }) => id !== preservedOwnerId)
    .slice(0, freezeCount)
    .map(({ id }) => id);
}

/** Freeze newest over-limit members in an existing transaction. */
export async function freezeMembersToLimitOnTx(
  tx: DbTransaction,
  input: FreezeMembersToLimitInput,
): Promise<string[]> {
  const activeMembers = await tx
    .select({
      id: schema.member.id,
      role: schema.member.role,
      createdAt: schema.member.createdAt,
    })
    .from(schema.member)
    .where(
      and(eq(schema.member.organizationId, input.organizationId), eq(schema.member.frozen, false)),
    )
    .orderBy(desc(schema.member.createdAt), desc(schema.member.id))
    .for('update');
  const ids = selectMemberIdsToFreeze(activeMembers, input.activeLimit);
  if (ids.length === 0) return [];

  const [rankRow] = await tx
    .select({ rank: max(schema.member.freezeRank) })
    .from(schema.member)
    .where(eq(schema.member.organizationId, input.organizationId));
  const startingRank = (rankRow?.rank ?? 0) + 1;
  for (const [index, id] of ids.entries()) {
    await tx
      .update(schema.member)
      .set({ frozen: true, frozenAt: input.now, freezeRank: startingRank + index })
      .where(and(eq(schema.member.id, id), eq(schema.member.frozen, false)));
  }
  return ids;
}

/** Restore frozen members in persisted freeze order in an existing transaction. */
export async function restoreMembersToLimitOnTx(
  tx: DbTransaction,
  input: RestoreMembersToLimitInput,
): Promise<string[]> {
  const [activeRow] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.member)
    .where(
      and(eq(schema.member.organizationId, input.organizationId), eq(schema.member.frozen, false)),
    );
  const capacity =
    input.activeLimit < 0
      ? Number.MAX_SAFE_INTEGER
      : Math.max(0, input.activeLimit - (activeRow?.count ?? 0));
  if (capacity === 0) return [];

  const frozenMembers = await tx
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(
      and(eq(schema.member.organizationId, input.organizationId), eq(schema.member.frozen, true)),
    )
    .orderBy(asc(schema.member.freezeRank), asc(schema.member.id))
    .limit(capacity)
    .for('update');
  const ids = frozenMembers.map(({ id }) => id);
  if (ids.length === 0) return [];

  await tx
    .update(schema.member)
    .set({ frozen: false, frozenAt: null, freezeRank: null })
    .where(inArray(schema.member.id, ids));
  return ids;
}
