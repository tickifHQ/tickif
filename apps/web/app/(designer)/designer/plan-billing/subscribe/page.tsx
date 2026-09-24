import { SubscribePage } from '@/components/subscribe/subscribe-page';
import { requireAuth } from '@/lib/auth-guard';
import { getCurrentOrgCapabilities, hasBillingAccess } from '@/lib/current-org-role';
import { BillingAccessDenied } from '@/components/billing-access-denied';

export const metadata = {
  title: 'Subscribe · Tickif',
};

/**
 * E-120 Subscribe page.
 * Server component wrapper — the client component handles state and API calls.
 */
export default async function DesignerSubscribePage() {
  const session = await requireAuth({ requiredRole: 'designer' });
  const capabilities = await getCurrentOrgCapabilities();
  if (!hasBillingAccess(capabilities)) return <BillingAccessDenied />;
  return (
    <SubscribePage userId={session.user.id} organizationId={session.session.activeOrganizationId} />
  );
}
