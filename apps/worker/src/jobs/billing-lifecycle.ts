import { config } from '@repo/config';
import { sweepOrgExpirations } from '@repo/db';
import {
  findGraceExpired,
  findLockedExpired,
  transitionGraceToLocked,
  transitionLockedToDowngraded,
} from '../billing-lifecycle/repository.js';
import { invalidateEntitlementCache } from '../billing-lifecycle/cache.js';
import { processOrganizationRetentionSweep } from './organization-retention.js';

/** Cap the fan-out of one sweep tick so a backlog can't run unbounded. */
const SWEEP_BATCH_SIZE = 200;

export type BillingLifecycleSweepResult = {
  lockedFromGrace: number;
  downgradedFromLocked: number;
  invitationsExpired: number;
  transfersExpired: number;
  graceFailures: number;
  downgradeFailures: number;
  orgExpiryFailures: number;
  organizationsArchived: number;
  organizationsPurged: number;
  organizationRetentionFailures: number;
};

/**
 * E-239 plan-lapse lifecycle sweep.
 *
 * Advances subscriptions through the time-based lapse stages using
 * config-driven windows, and folds org-retention (invitation expiry) into the
 * same tick without coupling the two state machines.
 *
 * Idempotent + concurrency-safe:
 * - Each transition is state-guarded under a row lock, so re-running the sweep
 *   or racing a Razorpay reactivation/charge webhook can never downgrade a
 *   subscription that has already returned to `active`. A successful charge
 *   always wins.
 * - Per-row isolation: one failing subscription does not starve the rest of the
 *   batch. Failures are counted and left for the next tick.
 */
export async function processBillingLifecycleSweep(
  now: Date = new Date(),
): Promise<BillingLifecycleSweepResult> {
  const graceDays = config.BILLING_GRACE_PERIOD_DAYS;
  const lockedDays = config.BILLING_LOCKED_PERIOD_DAYS;

  let lockedFromGrace = 0;
  let downgradedFromLocked = 0;
  let graceFailures = 0;
  let downgradeFailures = 0;
  let orgExpiryFailures = 0;

  // grace → locked
  const graceExpired = await findGraceExpired(now, graceDays, SWEEP_BATCH_SIZE);
  for (const candidate of graceExpired) {
    try {
      if (await transitionGraceToLocked(candidate.id, now)) {
        lockedFromGrace += 1;
        // Locked suspends paid entitlements — invalidate the display cache so the
        // Plan & Billing page reflects the new state before the 5-min TTL.
        await invalidateEntitlementCache(candidate.organizationId);
      }
    } catch (error) {
      graceFailures += 1;
      console.error(`[worker] grace→locked failed for subscription ${candidate.id}:`, error);
    }
  }

  // locked → downgraded (freezes over-limit seats in the same transaction)
  const lockedExpired = await findLockedExpired(now, lockedDays, SWEEP_BATCH_SIZE);
  for (const candidate of lockedExpired) {
    try {
      if (await transitionLockedToDowngraded(candidate.id, now)) {
        downgradedFromLocked += 1;
        await invalidateEntitlementCache(candidate.organizationId);
      }
    } catch (error) {
      downgradeFailures += 1;
      console.error(`[worker] locked→downgraded failed for subscription ${candidate.id}:`, error);
    }
  }

  // Org retention: expire stale pending invitations + ownership transfers.
  // Uses the SAME shared @repo/db logic as the API's orgsService.sweepExpirations
  // (audit events included) — no duplication, no API↔worker coupling.
  // Independent of the billing state machine.
  let invitationsExpired = 0;
  let transfersExpired = 0;
  try {
    const expired = await sweepOrgExpirations(now);
    invitationsExpired = expired.invitations;
    transfersExpired = expired.transfers;
  } catch (error) {
    orgExpiryFailures += 1;
    console.error('[worker] org-expiration sweep failed:', error);
  }

  let retention = { archived: 0, purged: 0, failed: 0 };
  try {
    retention = await processOrganizationRetentionSweep(now);
  } catch (error) {
    retention.failed += 1;
    console.error('[worker] organization-retention sweep failed:', error);
  }

  return {
    lockedFromGrace,
    downgradedFromLocked,
    invitationsExpired,
    transfersExpired,
    graceFailures,
    downgradeFailures,
    orgExpiryFailures,
    organizationsArchived: retention.archived,
    organizationsPurged: retention.purged,
    organizationRetentionFailures: retention.failed,
  };
}
