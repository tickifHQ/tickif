import { earlyBirdTierSchema } from '@repo/contracts';
import { requireAuth } from '@/lib/auth-guard';
import { getCurrentOrgCapabilities, hasBillingAccess } from '@/lib/current-org-role';
import { getBillingCatalog } from '@/lib/billing-catalog';
import { BillingAccessDenied } from '@/components/billing-access-denied';
import { EarlyBirdClaim } from '@/components/early-bird-trial';
import Link from 'next/link';

export const metadata = { title: 'Early bird · Tickif' };

export default async function EarlyBirdPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const session = await requireAuth({ requiredRole: 'designer' });
  const capabilities = await getCurrentOrgCapabilities();
  if (!hasBillingAccess(capabilities)) return <BillingAccessDenied />;
  const selected = earlyBirdTierSchema.safeParse((await searchParams).plan ?? 'professional_plus');
  const catalog = await getBillingCatalog();
  const plan = selected.success ? catalog?.plans.find((plan) => plan.tier === selected.data) : null;
  if (!plan)
    return (
      <div className="p-8" role="status">
        This offer is unavailable.{' '}
        <Link href="/designer/plan-billing/subscribe" className="underline">
          View billing plans
        </Link>
      </div>
    );
  return (
    <div className="px-5 py-12">
      <EarlyBirdClaim
        key={`${session.user.id}:${session.session.activeOrganizationId}:${plan.tier}`}
        plan={plan}
      />
    </div>
  );
}
