import type { BillingRecovery, BillingRecoveryRequest } from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { invalidateEntitlementCache } from '../../lib/redis.js';
import { subscribeRepository } from './subscribe-repository.js';
import { recoveryRepository, type RecoveryRow } from './recovery-repository.js';
import {
  assertBillingAccess,
  validateBillingPreview,
  type BillingCaller,
} from './selection-service.js';
import {
  cancelSubscription,
  fetchSubscription,
  resolveTierFromRazorpayPlanId,
} from './razorpay-client.js';

export function serializeRecovery(row: RecoveryRow | undefined): BillingRecovery | null {
  return row
    ? {
        ...row,
        eligibleAt: row.eligibleAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }
    : null;
}
const revisionConflict = () =>
  new AppError(
    'recovery_revision_conflict',
    'Recovery was changed by another billing user. Refresh before reviewing it again.',
    409,
  );

export const recoveryService = {
  async get(caller: BillingCaller) {
    await assertBillingAccess(caller);
    const org = caller.activeOrgId!;
    // Reconcile a saved intent on a visit as well as the periodic sweep. A
    // provider-confirmed activation should not display a pending checkout until
    // the next worker tick. Reads never create an intent or purchase anything.
    const existing = await recoveryRepository.findRecovery(org);
    if (!existing) return { recovery: null };
    return subscribeRepository.withOrganizationLock(org, async (repository) => {
      const row = await repository.findRecovery(org);
      if (!row) return { recovery: null };
      const local = await repository.find(org);
      if (!local) return { recovery: serializeRecovery(row) };
      try {
        const current = local.razorpaySubscriptionId
          ? await fetchSubscription(local.razorpaySubscriptionId)
          : null;
        const source =
          current?.id === row.sourceSubscriptionId
            ? current
            : await fetchSubscription(row.sourceSubscriptionId);
        const terminal = ['cancelled', 'completed', 'expired'];
        const sourceEnded = terminal.includes(source.status);
        const tier = current ? resolveTierFromRazorpayPlanId(current.plan_id) : null;
        let change: Pick<RecoveryRow, 'status' | 'eligibleAt' | 'reason'>;
        if (
          current?.status === 'active' &&
          tier &&
          local.planTier === tier &&
          local.subscriptionState === 'active' &&
          (sourceEnded || current.id === source.id) &&
          (tier === row.targetTier || current.id !== source.id)
        ) {
          change = {
            status: tier === row.targetTier ? 'completed' : 'superseded',
            eligibleAt: null,
            reason: tier === row.targetTier ? null : 'another_plan_activated',
          };
        } else if (sourceEnded && (!current || terminal.includes(current.status))) {
          // The stored date is never authority: both old/current provider state
          // must establish that a replacement cannot overlap a live mandate.
          change = {
            status: 'eligible',
            eligibleAt: null,
            reason: 'source_subscription_terminated',
          };
        } else if (
          !sourceEnded &&
          source.current_end &&
          (source.cancel_at_cycle_end ||
            (local.razorpaySubscriptionId === source.id && local.cancelAtPeriodEnd))
        ) {
          change = {
            status: 'waiting_for_expiry',
            eligibleAt: new Date(source.current_end * 1000),
            reason: 'cancellation_scheduled',
          };
        } else {
          return { recovery: serializeRecovery(row) };
        }
        const pending = await repository.findOpenOperation(org);
        if (pending?.kind === 'recover' && pending.sourceSubscriptionId === source.id)
          await repository.updateOperation(org, pending.operationId, {
            status: 'scheduled',
            result: { recoveryId: row.id },
          });
        if (
          change.status === row.status &&
          change.reason === row.reason &&
          change.eligibleAt?.getTime() === row.eligibleAt?.getTime()
        )
          return { recovery: serializeRecovery(row) };
        const changed = await repository.updateRecovery(org, row.id, row.revision, change);
        return { recovery: serializeRecovery(changed ?? row) };
      } catch {
        // An unavailable provider cannot prove completion; keep accepted intent.
        return { recovery: serializeRecovery(row) };
      }
    });
  },
  async dismiss(
    caller: BillingCaller,
    input: { expectedRecoveryId: string; expectedRevision: number },
  ) {
    await assertBillingAccess(caller);
    return subscribeRepository.withOrganizationLock(caller.activeOrgId!, async (repository) => {
      const row = await repository.findRecovery(caller.activeOrgId!);
      if (!row || row.id !== input.expectedRecoveryId || row.revision !== input.expectedRevision)
        throw revisionConflict();
      const changed = await repository.updateRecovery(caller.activeOrgId!, row.id, row.revision, {
        status: 'dismissed',
        reason: 'intent_dismissed_provider_schedule_unchanged',
      });
      if (!changed) throw revisionConflict();
      return { recovery: serializeRecovery(changed) };
    });
  },
  async save(caller: BillingCaller, input: BillingRecoveryRequest) {
    await assertBillingAccess(caller);
    const org = caller.activeOrgId!;
    // Commit the accepted target and operation before provider I/O. A lost response
    // must leave a durable uncertain request, never permit a second cancellation.
    const reserved = await subscribeRepository.withOrganizationLock(org, async (repository) => {
      const previous = await repository.findOperation(org, input.operationId);
      const current = await repository.findRecovery(org);
      if (previous) {
        if (previous.kind !== 'recover' || previous.targetTier !== input.targetTier)
          throw new AppError(
            'operation_conflict',
            'Operation ID was already used for another request.',
            409,
          );
        return { replay: true, recovery: current };
      }
      if (
        (current?.id ?? null) !== input.expectedRecoveryId ||
        (current?.revision ?? null) !== input.expectedRevision
      )
        throw revisionConflict();
      if (current?.status === 'checkout_pending')
        throw new AppError(
          'checkout_conflict',
          'Finish or reconcile the existing checkout before changing recovery.',
          409,
        );
      if (await repository.findOpenOperation(org))
        throw new AppError(
          'billing_operation_pending',
          'An earlier billing request must be reconciled first.',
          409,
        );
      const { preview, revision } = await validateBillingPreview(caller, input, repository);
      const replacingEligibleIntent =
        current?.status === 'eligible' && preview.action === 'subscribe';
      if (replacingEligibleIntent) {
        // Confirmed cancellation may clear the local provider ID. The saved
        // intent still identifies the original mandate; verify its termination
        // before changing only the future target, without another cancellation.
        if (
          preview.sourceSubscriptionId &&
          preview.sourceSubscriptionId !== current.sourceSubscriptionId
        )
          throw revisionConflict();
        const source = await fetchSubscription(current.sourceSubscriptionId);
        if (!['cancelled', 'completed', 'expired'].includes(source.status))
          throw new AppError(
            'recovery_not_eligible',
            'The original subscription has not ended. Refresh billing before replacing this target.',
            409,
          );
        const changed = await repository.updateRecovery(org, current.id, current.revision, {
          targetTier: input.targetTier,
          actorId: caller.userId,
          eligibleAt: null,
          reason: 'source_subscription_terminated',
        });
        if (!changed) throw revisionConflict();
        await repository.insertOperation({
          operationId: input.operationId,
          organizationId: org,
          actorId: caller.userId,
          targetTier: input.targetTier,
          kind: 'recover',
          sourceSubscriptionId: current.sourceSubscriptionId,
          stateRevision: revision,
          status: 'scheduled',
          result: { recoveryId: current.id },
        });
        return { replay: true, recovery: changed };
      }
      if (preview.action !== 'recover' || !preview.sourceSubscriptionId)
        throw new AppError(
          'billing_action_unavailable',
          'This selection does not need deferred recovery.',
          409,
        );
      if (current && current.sourceSubscriptionId !== preview.sourceSubscriptionId)
        throw new AppError(
          'recovery_revision_conflict',
          'The source subscription changed. Refresh and dismiss the obsolete intent before creating another.',
          409,
        );
      const row = current
        ? await repository.updateRecovery(org, current.id, current.revision, {
            targetTier: input.targetTier,
            actorId: caller.userId,
            status: 'requested',
            reason: 'cancellation_requested',
          })
        : await repository.insertRecovery({
            organizationId: org,
            actorId: caller.userId,
            targetTier: input.targetTier,
            sourceSubscriptionId: preview.sourceSubscriptionId,
            reason: 'cancellation_requested',
          });
      if (!row) throw revisionConflict();
      await repository.insertOperation({
        operationId: input.operationId,
        organizationId: org,
        actorId: caller.userId,
        targetTier: input.targetTier,
        kind: 'recover',
        sourceSubscriptionId: preview.sourceSubscriptionId,
        stateRevision: revision,
        status: 'processing',
      });
      return { replay: false, recovery: row };
    });
    if (reserved.replay) return { recovery: serializeRecovery(reserved.recovery) };
    let providerMutationStarted = false;
    try {
      const result = await subscribeRepository.withOrganizationLock(org, async (repository) => {
        await assertBillingAccess(caller);
        const { preview } = await validateBillingPreview(caller, input, repository);
        const row = await repository.findRecovery(org);
        if (
          !row ||
          row.id !== reserved.recovery!.id ||
          row.revision !== reserved.recovery!.revision ||
          preview.sourceSubscriptionId !== row.sourceSubscriptionId
        )
          throw revisionConflict();
        const local = await repository.find(org);
        let remote = await fetchSubscription(row.sourceSubscriptionId);
        let cancellationAccepted =
          local?.razorpaySubscriptionId === row.sourceSubscriptionId && local.cancelAtPeriodEnd;
        if (
          !remote.cancel_at_cycle_end &&
          !cancellationAccepted &&
          !['cancelled', 'completed', 'expired'].includes(remote.status)
        ) {
          providerMutationStarted = true;
          remote = await cancelSubscription({
            subscriptionId: row.sourceSubscriptionId,
            cancelAtCycleEnd: true,
          });
          // A successful cancel request acknowledges the requested schedule.
          // Razorpay does not have to echo cancel_at_cycle_end in its response.
          cancellationAccepted = true;
        }
        const terminal = ['cancelled', 'completed', 'expired'].includes(remote.status);
        const verified = terminal || cancellationAccepted || remote.cancel_at_cycle_end === true;
        const eligibleAt = remote.current_end ? new Date(remote.current_end * 1000) : null;
        const changed = await repository.updateRecovery(org, row.id, row.revision, {
          status: terminal ? 'eligible' : verified ? 'waiting_for_expiry' : 'requested',
          eligibleAt,
          reason: verified ? null : 'provider_outcome_unconfirmed',
        });
        if (local && verified)
          await repository.update(local.id, {
            cancelAtPeriodEnd: true,
            currentPeriodEnd: eligibleAt,
          });
        await repository.updateOperation(org, input.operationId, {
          status: verified ? 'scheduled' : 'reconciliation_pending',
          result: { recoveryId: row.id },
        });
        return { recovery: serializeRecovery(changed) };
      });
      await invalidateEntitlementCache(org);
      return result;
    } catch (error) {
      const definitivelyRejected =
        error instanceof AppError &&
        ['validation_error', 'payment_mode_change_unsupported'].includes(error.code);
      const uncertain = providerMutationStarted && !definitivelyRejected;
      const reason = uncertain ? 'provider_outcome_unconfirmed' : 'review_required';
      await subscribeRepository.updateOperation(org, input.operationId, {
        status: uncertain ? 'reconciliation_pending' : 'failed',
        result: { reason },
      });
      const row = await recoveryRepository.findRecovery(org);
      if (row) await recoveryRepository.updateRecovery(org, row.id, row.revision, { reason });
      throw error;
    }
  },
};
