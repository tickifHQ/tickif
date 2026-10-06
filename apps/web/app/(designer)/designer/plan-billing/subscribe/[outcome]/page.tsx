import { notFound } from 'next/navigation';
import { planTierSchema } from '@repo/contracts';
import { CheckoutResult } from '@/components/subscribe/checkout-result';
import { requireAuth } from '@/lib/auth-guard';
import { getCurrentOrgCapabilities, hasBillingAccess } from '@/lib/current-org-role';
import { BillingAccessDenied } from '@/components/billing-access-denied';

export const metadata = { title: 'Checkout · Tickif' };

export default async function CheckoutResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ outcome: string }>;
  searchParams: Promise<{ plan?: string | string[] }>;
}) {
  const session = await requireAuth({ requiredRole: 'designer' });
  const capabilities = await getCurrentOrgCapabilities();
  if (!hasBillingAccess(capabilities)) return <BillingAccessDenied />;
  const { outcome } = await params;
  const target = planTierSchema.safeParse((await searchParams).plan);
  if ((outcome !== 'complete' && outcome !== 'closed') || !target.success) notFound();
  return (
    <CheckoutResult
      outcome={outcome}
      targetTier={target.data}
      userId={session.user.id}
      organizationId={session.session.activeOrganizationId}
    />
  );
}
