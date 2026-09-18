import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { PLATFORM_ROLE } from '@repo/contracts';
import { DesignerWorkspaceShell } from '@/components/designer-workspace-shell';
import { requireAuth } from '@/lib/auth-guard';
import { ProtectedBfcacheGuard } from '@/components/protected-bfcache-guard';
import { requireCurrentDesignerProfile } from '@/lib/designer-profile';
import {
  getCurrentOrgCapabilities,
  getCurrentOrgPlanTier,
} from '@/lib/current-org-role';
import { PLAN_TIER_LABELS } from '@/lib/billing-types';

/** Designer workspace chrome. Requires the exact designer platform role. */
export default async function DesignerLayout({ children }: { children: ReactNode }) {
  const session = await requireAuth({ requiredRole: PLATFORM_ROLE.DESIGNER });
  const [profile, orgCapabilities, planTier] = await Promise.all([
    requireCurrentDesignerProfile(),
    getCurrentOrgCapabilities(),
    getCurrentOrgPlanTier(),
  ]);
  const studioName = profile.displayName.trim() || session.user.name?.trim() || 'Your studio';
  if (!orgCapabilities) redirect('/unauthorized');
  const planLabel = planTier ? `${PLAN_TIER_LABELS[planTier]} plan` : 'Plan unavailable';

  return (
    <DesignerWorkspaceShell
      activeOrganizationId={profile.organization.id}
      studioName={studioName}
      planLabel={planLabel}
      capabilities={orgCapabilities}
    >
      <ProtectedBfcacheGuard />
      {children}
    </DesignerWorkspaceShell>
  );
}
