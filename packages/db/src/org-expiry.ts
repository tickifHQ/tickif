import { and, eq, lt } from 'drizzle-orm';
import { db } from './client.js';
import * as schema from './schema/index.js';

/**
 * Shared organization-retention expiry queries (E-238 lifecycle).
 *
 * These live in `@repo/db` so both the API (`orgsService.sweepExpirations`, and
 * its on-access lazy paths) and the worker's scheduled billing-lifecycle sweep
 * (E-239) run the SAME logic — no duplication, no API↔worker package coupling.
 *
 * Both operations are idempotent: they only touch rows still `pending` and past
 * their `expiresAt`, so re-running a sweep is a no-op.
 */

/** Expire pending invitations past their expiry. Returns the affected ids. */
export async function expirePendingInvitations(now: Date): Promise<string[]> {
  const rows = await db
    .update(schema.invitation)
    .set({ status: 'expired' })
    .where(and(eq(schema.invitation.status, 'pending'), lt(schema.invitation.expiresAt, now)))
    .returning({ id: schema.invitation.id });
  return rows.map(({ id }) => id);
}

/**
 * Expire pending ownership-transfer requests past their expiry, writing the
 * matching audit events in the same transaction (the audit trail is part of the
 * transfer state machine and must not diverge from the status flip).
 */
export async function expirePendingOwnershipTransfers(now: Date): Promise<string[]> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(schema.ownershipTransferRequest)
      .set({ status: 'expired', resolvedAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.ownershipTransferRequest.status, 'pending'),
          lt(schema.ownershipTransferRequest.expiresAt, now),
        ),
      )
      .returning({
        id: schema.ownershipTransferRequest.id,
        initiatorUserId: schema.ownershipTransferRequest.initiatorUserId,
      });
    if (rows.length > 0) {
      await tx.insert(schema.ownershipTransferAuditEvent).values(
        rows.map((row) => ({
          transferId: row.id,
          status: 'expired' as const,
          actorUserId: row.initiatorUserId,
          createdAt: now,
        })),
      );
    }
    return rows.map(({ id }) => id);
  });
}

/**
 * Fold both org-retention expiries into one call. Used by the E-239 scheduled
 * sweep and by the API's on-demand `sweepExpirations`.
 */
export async function sweepOrgExpirations(now: Date): Promise<{
  invitations: number;
  transfers: number;
}> {
  const [invitations, transfers] = await Promise.all([
    expirePendingInvitations(now),
    expirePendingOwnershipTransfers(now),
  ]);
  return { invitations: invitations.length, transfers: transfers.length };
}
