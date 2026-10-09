import { config } from '@repo/config';
import { logger } from '../observability/logger.js';
import { sweepOrgExpirations } from '@repo/db';
import {
  findGraceExpired,
  findLockedExpired,
  transitionGraceToLocked,
  transitionLockedToDowngraded,
} from '../billing-lifecycle/repository.js';
import { invalidateEntitlementCache } from '../billing-lifecycle/cache.js';
import { processOrganizationRetentionSweep } from './organization-retention.js';
import { processBillingRecoverySweep } from '../billing-lifecycle/recovery.js';
import {
  replacementRepository,
  reconcileReplacement,
  refundAbandonedReplacement,
  earlyBirdRepository,
  expireEarlyBird,
} from '@repo/billing';

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
  recoveryReconciled: number;
  recoveryFailures: number;
  replacementFailures: number;
  refundFailures: number;
  earlyBirdExpired: number;
  earlyBirdFailures: number;
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
  let replacementFailures = 0;
  let refundFailures = 0;
  let earlyBirdExpired = 0;
  let earlyBirdFailures = 0;

  try {
    for (const candidate of await earlyBirdRepository.expired(now)) {
      try {
        if (await expireEarlyBird(candidate.organizationId, now)) {
          earlyBirdExpired += 1;
          await invalidateEntitlementCache(candidate.organizationId);
        }
      } catch (error) {
        earlyBirdFailures += 1;
        logger.error(
          { event: 'billing.early_bird_expiry_failed', err: error },
          'Early-bird expiry failed',
        );
      }
    }
  } catch (error) {
    earlyBirdFailures += 1;
    logger.error(
      { event: 'billing.early_bird_sweep_failed', err: error },
      'Early-bird sweep failed',
    );
  }

  for (const candidate of await replacementRepository.candidates()) {
    try {
      await reconcileReplacement(candidate.organizationId, now);
    } catch {
      replacementFailures += 1;
      logger.error(
        { event: 'billing.replacement_reconciliation_failed' },
        'Replacement billing reconciliation failed',
      );
    } finally {
      // Rotate pending and failing rows too, so one batch cannot starve later schedules.
      await replacementRepository.update(candidate.id, {});
      // The local effective date may have committed before a provider read failed.
      await invalidateEntitlementCache(candidate.organizationId);
    }
  }
  for (const candidate of await replacementRepository.abandonedOrders()) {
    try {
      await refundAbandonedReplacement(candidate);
    } catch {
      refundFailures += 1;
      logger.error(
        { event: 'billing.abandoned_payment_reconciliation_failed' },
        'Abandoned plan-change payment reconciliation failed',
      );
    } finally {
      await replacementRepository.update(candidate.id, {});
    }
  }

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
      logger.error(
        { event: 'billing.grace_to_locked_failed', subscription_id: candidate.id, err: error },
        'Billing grace to locked transition failed',
      );
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
      logger.error(
        { event: 'billing.locked_to_downgraded_failed', subscription_id: candidate.id, err: error },
        'Billing locked to downgraded transition failed',
      );
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
    logger.error(
      { event: 'organization.expiration_sweep_failed', err: error },
      'Organization expiration sweep failed',
    );
  }

  let retention = { archived: 0, purged: 0, failed: 0 };
  try {
    retention = await processOrganizationRetentionSweep(now);
  } catch (error) {
    retention.failed += 1;
    logger.error(
      { event: 'organization.retention_sweep_failed', err: error },
      'Organization retention sweep failed',
    );
  }

  let recovery = { reconciled: 0, failed: 0 };
  try {
    recovery = await processBillingRecoverySweep(now);
  } catch {
    recovery.failed += 1;
    logger.error({ event: 'billing.recovery_sweep_failed' }, 'Billing recovery sweep failed');
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
    recoveryReconciled: recovery.reconciled,
    recoveryFailures: recovery.failed,
    replacementFailures,
    refundFailures,
    earlyBirdExpired,
    earlyBirdFailures,
  };
}
