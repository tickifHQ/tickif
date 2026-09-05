import dynamic from 'next/dynamic';
import { BillingAccessDenied } from '@/components/billing-access-denied';
import { DesignerPlanBilling } from '@/components/designer-plan-billing';
import { getBillingState } from '@/lib/billing-data';
import { getCurrentOrgCapabilities, hasBillingAccess } from '@/lib/current-org-role';
import { BillingLoadError } from '@/components/billing-load-error';
import { requireAuth } from '@/lib/auth-guard';

export const metadata = {
  title: 'Plan & billing · Tickif',
};

const BillingDevSwitcher =
  process.env.NODE_ENV === 'production'
    ? () => null
    : dynamic(() =>
        import('@/components/billing-dev-switcher').then((mod) => mod.BillingDevSwitcher),
      );

export default async function DesignerPlanBillingPage() {
  await requireAuth({ requiredRole: 'designer' });

  const orgCapabilities = await getCurrentOrgCapabilities();
  if (!hasBillingAccess(orgCapabilities)) {
    return <BillingAccessDenied />;
  }

  const billing = await getBillingState();
  if (!billing) return <BillingLoadError />;

  return (
    <>
      <DesignerPlanBilling billing={billing} />
      {process.env.NODE_ENV !== 'production' && <BillingDevSwitcher initialBilling={billing} />}
    </>
  );
}
