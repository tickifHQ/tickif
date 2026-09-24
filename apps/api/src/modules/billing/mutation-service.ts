import {
  billingMutationOutcomeSchema,
  type BillingMutationRequest,
  type BillingMutationOutcome,
} from '@repo/contracts';
import { subscribeRepository } from './subscribe-repository.js';
import { subscribeService } from './subscribe-service.js';
import {
  assertBillingAccess,
  validateBillingPreview,
  type BillingCaller,
} from './selection-service.js';
import { AppError } from '../../lib/errors.js';
import { startReplacement } from './replacement-service.js';
import { replacementRepository, cancelReplacementRenewal } from '@repo/billing';

export const billingMutationService = {
  async execute(
    caller: BillingCaller,
    params: BillingMutationRequest,
    kind: 'subscribe' | 'change_plan' | 'cancel',
  ) {
    await assertBillingAccess(caller);
    const org = caller.activeOrgId!;
    const replacement = await replacementRepository.current(org);
    if (replacement) {
      if (kind === 'change_plan' && replacement.targetTier === params.targetTier)
        return {
          operationId: replacement.id,
          outcome: 'processing',
          targetTier: replacement.targetTier,
          effectiveAt: replacement.periodEnd.toISOString(),
          razorpaySubscriptionId: replacement.replacementSubscriptionId ?? '',
        };
      if (!(kind === 'cancel' && replacement.status === 'confirmed'))
        throw AppError.conflict('Complete the pending plan change before choosing another plan.');
    }
    const reserved = await subscribeRepository.withOrganizationLock(org, async (repository) => {
      const existing = await repository.findOperation(org, params.operationId);
      if (existing) {
        if (existing.targetTier !== params.targetTier || existing.kind !== kind)
          throw new AppError(
            'operation_conflict',
            'This operation ID belongs to another selection.',
            409,
          );
        if (existing.status === 'failed')
          throw new AppError(
            'operation_failed',
            'This operation failed. Refresh and explicitly review a new request.',
            409,
          );
        if (existing.result) return { replay: existing.result };
        throw new AppError(
          'reconciliation_pending',
          'This request is still being reconciled. Refresh billing before continuing.',
          409,
        );
      }
      if (await repository.findOpenOperation(org))
        throw new AppError(
          'reconciliation_pending',
          'An earlier billing request must be reconciled before continuing.',
          409,
        );
      const { preview, revision } = await validateBillingPreview(caller, params, repository);
      if (preview.action !== kind)
        throw new AppError(
          'billing_action_unavailable',
          'Review the available recovery action before continuing.',
          409,
        );
      await repository.insertOperation({
        organizationId: org,
        operationId: params.operationId,
        actorId: caller.userId,
        targetTier: params.targetTier,
        kind,
        sourceSubscriptionId: preview.sourceSubscriptionId,
        stateRevision: revision,
        status: 'processing',
      });
      return { preview };
    });
    if ('replay' in reserved) return reserved.replay;
    // Reservation is committed before any provider side effect. A crash/timeout
    // leaves it open and prevents another operation from issuing a duplicate call.
    try {
      const result =
        kind === 'subscribe'
          ? await subscribeService.createSubscription(caller, params)
          : kind === 'cancel'
            ? replacement
              ? await cancelReplacementRenewal(org)
              : await subscribeService.cancelSubscription(caller, params)
            : await startReplacement(caller, params.operationId, reserved.preview!);
      if (!result) throw AppError.forbidden('Organization billing is unavailable.');
      const outcome: BillingMutationOutcome = {
        operationId: params.operationId,
        outcome: kind === 'cancel' ? 'scheduled' : 'processing',
        targetTier: params.targetTier,
        effectiveAt:
          kind === 'cancel' &&
          'currentPeriodEnd' in result &&
          typeof result.currentPeriodEnd === 'string'
            ? result.currentPeriodEnd
            : reserved.preview!.effectiveAt,
        razorpaySubscriptionId: result.razorpaySubscriptionId,
      };
      const response = { ...result, ...outcome };
      // Checkout creation is complete; activation remains provider-authoritative.
      // A paid change retains its reservation until captured payment and
      // cancellation of the previous renewal are verified.
      await subscribeRepository.updateOperation(org, params.operationId, {
        status: kind === 'change_plan' ? 'processing' : 'scheduled',
        result: response,
      });
      return response;
    } catch (error) {
      const knownRejection = error instanceof AppError && error.status < 500;
      await subscribeRepository.updateOperation(org, params.operationId, {
        status: knownRejection ? 'failed' : 'reconciliation_pending',
        result: knownRejection
          ? billingMutationOutcomeSchema.parse({
              operationId: params.operationId,
              outcome: 'failed',
              targetTier: params.targetTier,
              effectiveAt: null,
              razorpaySubscriptionId: reserved.preview!.sourceSubscriptionId ?? '',
            })
          : null,
      });
      throw error;
    }
  },
};
