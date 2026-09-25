import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '@repo/config';
import {
  createReplacement,
  replacementRepository,
  reconcileReplacement,
  replacementProvider,
} from '@repo/billing';
import type { BillingChangePreview, BillingReplacementVerify } from '@repo/contracts';
import { assertBillingAccess, type BillingCaller } from './selection-service.js';
import { resolveRazorpayPlanId } from './razorpay-client.js';
import { invalidateEntitlementCache } from '../../lib/redis.js';
import { AppError } from '../../lib/errors.js';

export async function startReplacement(
  caller: BillingCaller,
  id: string,
  preview: Omit<BillingChangePreview, 'previewToken' | 'expiresAt'>,
) {
  if (
    !preview.sourceSubscriptionId ||
    !preview.nextRenewalAt ||
    preview.adjustmentAmount === null ||
    preview.recurringAmount === null ||
    !preview.currency ||
    preview.targetTier === 'hobby'
  )
    throw AppError.conflict('A verified paid period and price are required.');
  const periodEnd = new Date(preview.nextRenewalAt);
  if (periodEnd.getTime() <= Date.now() + 60_000)
    throw AppError.conflict('Renewal is in progress. Refresh billing after it completes.');
  await createReplacement({
    id,
    organizationId: caller.activeOrgId!,
    sourceSubscriptionId: preview.sourceSubscriptionId,
    sourceTier: preview.currentTier,
    targetTier: preview.targetTier,
    targetPlanId: resolveRazorpayPlanId(preview.targetTier)!,
    amount: preview.adjustmentAmount,
    recurringAmount: preview.recurringAmount,
    currency: preview.currency,
    periodEnd,
    expiresAt: new Date(Math.min(Date.now() + 15 * 60_000, periodEnd.getTime() - 30_000)),
  });
  return {
    razorpaySubscriptionId: (await replacementRepository.current(caller.activeOrgId!))!
      .replacementSubscriptionId!,
  };
}

export async function replacementCheckout(caller: BillingCaller) {
  await assertBillingAccess(caller);
  await reconcileReplacement(caller.activeOrgId!);
  await invalidateEntitlementCache(caller.activeOrgId!);
  const row = await replacementRepository.current(caller.activeOrgId!);
  const mandate = row?.replacementSubscriptionId
    ? await replacementProvider.subscription(row.replacementSubscriptionId)
    : null;
  return row
    ? {
        operationId: row.id,
        status: row.status,
        mandateAuthorized: !!mandate && ['authenticated', 'active'].includes(mandate.status),
        targetTier: row.targetTier,
        razorpaySubscriptionId: row.replacementSubscriptionId,
        razorpayOrderId: row.orderId,
        amount: row.amount,
        currency: row.currency,
        effectiveAt: row.periodEnd.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        razorpayKeyId: config.RAZORPAY_KEY_ID ?? '',
      }
    : null;
}

export async function verifyReplacement(caller: BillingCaller, input: BillingReplacementVerify) {
  await assertBillingAccess(caller);
  const row = await replacementRepository.current(caller.activeOrgId!);
  if (!row || row.id !== input.operationId)
    throw AppError.forbidden('Checkout does not belong to this organization.');
  const id = input.kind === 'order' ? row.orderId : row.replacementSubscriptionId;
  if (!id || id !== input.providerId) throw AppError.forbidden('Checkout identity mismatch.');
  const message = input.kind === 'order' ? `${id}|${input.paymentId}` : `${input.paymentId}|${id}`;
  const signature = createHmac('sha256', config.RAZORPAY_KEY_SECRET!).update(message).digest('hex');
  if (
    !/^[a-f0-9]{64}$/i.test(input.signature) ||
    !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(input.signature, 'hex'))
  )
    throw AppError.badRequest('Invalid payment signature');
  // Signature is not fulfillment: the shared reconciler fetches authorization and captured funds.
  return replacementCheckout(caller);
}
