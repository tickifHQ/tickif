import { headers } from 'next/headers';
import { organizationWorkspaceResponseSchema, type OrganizationMemberRole } from '@repo/contracts';
import { DesignerPlanBilling } from '@/components/designer-plan-billing';
import { BillingDevSwitcher } from '@/components/billing-dev-switcher';
import { BillingAccessDenied } from '@/components/billing-access-denied';
import { getBillingState } from '@/lib/billing-data';
import { api } from '@/lib/api';
import { requireAuth } from '@/lib/auth-guard';

export const metadata = {
  title: 'Plan & billing · Tickif',
};

async function getCurrentOrgRole(): Promise<OrganizationMemberRole | null> {
  const reqHeaders = await headers();
  const cookie = reqHeaders.get('cookie');
  if (!cookie) return null;

  try {
    const response = await api.api.orgs.current.$get({}, { headers: { cookie } });
    if (!response.ok) return null;
    const parsed = organizationWorkspaceResponseSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    return parsed.data.currentUserRole;
  } catch {
    return null;
  }
}

/**
 * Billing access: only org owners can view Plan & Billing.
 * billing_admin role does not exist end-to-end yet (E-240).
 * Until then, fail closed: owner-only.
 */
function hasBillingAccess(role: OrganizationMemberRole | null): boolean {
  return role === 'owner';
}

export default async function DesignerPlanBillingPage() {
  await requireAuth({ requiredRole: 'designer' });

  const [billing, orgRole] = await Promise.all([getBillingState(), getCurrentOrgRole()]);

  // Authorization gate: fail closed.
  if (!hasBillingAccess(orgRole)) {
    return <BillingAccessDenied />;
  }

  return (
    <>
      <DesignerPlanBilling billing={billing} />
      {process.env.NODE_ENV !== 'production' && (
        <BillingDevSwitcher initialBilling={billing} />
      )}
    </>
  );
}
