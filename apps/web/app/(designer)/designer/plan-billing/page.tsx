import { DesignerPlanBilling } from '@/components/designer-plan-billing';
import { BillingDevSwitcher } from '@/components/billing-dev-switcher';
import { getBillingState } from '@/lib/billing-data';

export const metadata = {
  title: 'Plan & billing · Tickif',
};

export default async function DesignerPlanBillingPage() {
  const billing = await getBillingState();

  // Development-only: render interactive billing context switcher.
  // In production, the page renders the billing state directly from the API.
  if (process.env.NODE_ENV !== 'production') {
    return <BillingDevSwitcher initialBilling={billing} />;
  }

  // TODO(E-239): Resolve org role from session/billing API.
  return <DesignerPlanBilling billing={billing} role="owner" />;
}
