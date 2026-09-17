import type { ReactNode } from 'react';
import { PLATFORM_ROLE } from '@repo/contracts';
import { DesignerWorkspaceShell } from '@/components/designer-workspace-shell';
import { requireAuth } from '@/lib/auth-guard';
import { ProtectedBfcacheGuard } from '@/components/protected-bfcache-guard';
import { requireCurrentDesignerProfile } from '@/lib/designer-profile';
import {
  getCurrentOrgCapabilities,
  getCurrentOrgPlanTier,
  hasBillingAccess,
} from '@/lib/current-org-role';
import { PLAN_TIER_LABELS } from '@/lib/billing-types';

/** Designer workspace chrome. Requires role: designer, admin, or superadmin. */
export default async function DesignerLayout({ children }: { children: ReactNode }) {
  const session = await requireAuth({ requiredRole: PLATFORM_ROLE.DESIGNER });
  const [profile, orgCapabilities, planTier] = await Promise.all([
    requireCurrentDesignerProfile(),
    getCurrentOrgCapabilities(),
    getCurrentOrgPlanTier(),
  ]);
  const studioName = profile.displayName.trim() || session.user.name?.trim() || 'Your studio';
  const planLabel = planTier ? `${PLAN_TIER_LABELS[planTier]} plan` : 'Plan unavailable';

  return (
    <DesignerWorkspaceShell
      activeOrganizationId={profile.organization.id}
      studioName={studioName}
      planLabel={planLabel}
      isOwner={hasBillingAccess(orgCapabilities)}
    >
      <ProtectedBfcacheGuard />
      {children}
    </DesignerWorkspaceShell>
  );
}
