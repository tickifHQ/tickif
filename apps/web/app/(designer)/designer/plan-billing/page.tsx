import dynamic from 'next/dynamic';
import { DesignerPlanBilling } from '@/components/designer-plan-billing';
import { BillingAccessDenied } from '@/components/billing-access-denied';
import { getBillingState } from '@/lib/billing-data';
import { getCurrentOrgRole, hasBillingAccess } from '@/lib/current-org-role';
import { requireAuth } from '@/lib/auth-guard';

export const metadata = {
  title: 'Plan & billing · Tickif',
};

const BillingDevSwitcher =
  process.env.NODE_ENV === 'production'
    ? () => null
    : dynamic(
        () =>
          import('@/components/billing-dev-switcher').then((mod) => mod.BillingDevSwitcher),
        { ssr: false },
      );

export default async function DesignerPlanBillingPage() {
  await requireAuth({ requiredRole: 'designer' });

  const orgRole = await getCurrentOrgRole();
  if (!hasBillingAccess(orgRole)) {
    return <BillingAccessDenied />;
  }

  const billing = await getBillingState();

  return (
    <>
      <DesignerPlanBilling billing={billing} />
      {process.env.NODE_ENV !== 'production' && (
        <BillingDevSwitcher initialBilling={billing} />
      )}
    </>
  );
}
