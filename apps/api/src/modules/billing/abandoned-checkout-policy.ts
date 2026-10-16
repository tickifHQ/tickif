import { replacementProvider } from '@repo/billing';
import type { replacementRepository } from '@repo/billing';

/** A closed window is not proof of abandonment: fetch both mandate and funds. */
export async function canSupersedeReplacement(
  row: NonNullable<Awaited<ReturnType<typeof replacementRepository.current>>>,
) {
  if (row.status !== 'checkout' || !row.replacementSubscriptionId) return false;
  const mandate = await replacementProvider.subscription(row.replacementSubscriptionId);
  if (mandate.status !== 'created' || mandate.plan_id !== row.targetPlanId) return false;
  const payments = row.orderId ? await replacementProvider.payments(row.orderId) : [];
  return !payments.some((payment) => ['authorized', 'captured'].includes(payment.status));
}
