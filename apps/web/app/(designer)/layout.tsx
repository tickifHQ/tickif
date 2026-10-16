import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PLATFORM_ROLE } from '@repo/contracts';
import { config } from '@repo/config/features';
import { DesignerWorkspaceShell } from '@/components/designer-workspace-shell';
import { requireAuth } from '@/lib/auth-guard';
import { ProtectedBfcacheGuard } from '@/components/protected-bfcache-guard';
import { requireCurrentDesignerProfile } from '@/lib/designer-profile';
import { getCurrentOrgWorkspace } from '@/lib/current-org-role';
import { WorkspaceEntitlementSync } from '@/components/workspace-entitlement-sync';
import { PLAN_TIER_LABELS } from '@/lib/billing-types';

/** Designer workspace chrome. Requires the exact designer platform role. */
export default async function DesignerLayout({ children }: { children: ReactNode }) {
  const session = await requireAuth({ requiredRole: PLATFORM_ROLE.DESIGNER });
  const [profile, workspace] = await Promise.all([
    requireCurrentDesignerProfile(),
    getCurrentOrgWorkspace(),
  ]);
  const studioName = profile.displayName.trim() || session.user.name?.trim() || 'Your studio';
  if (!workspace || workspace.organization.id !== profile.organization.id)
    redirect('/unauthorized');
  const { capabilities: orgCapabilities, planTier, currentUserRole: role } = workspace;
  const planLabel = planTier ? `${PLAN_TIER_LABELS[planTier]} plan` : 'Plan unavailable';

  return (
    <WorkspaceEntitlementSync
      organizationId={workspace.organization.id}
      planTier={planTier}
      subscriptionState={workspace.subscriptionState}
    >
      <DesignerWorkspaceShell
        activeOrganizationId={profile.organization.id}
        studioName={studioName}
        logoUrl={profile.logoUrl}
        planLabel={planLabel}
        capabilities={orgCapabilities}
        consultationsEnabled={config.CONSULTATIONS_ENABLED}
      >
        <ProtectedBfcacheGuard />
        {role === 'owner' && !orgCapabilities.editOrganization ? (
          <p className="m-6 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
            Studio editing is unavailable.{' '}
            <Link
              href="/designer/portfolio"
              className="font-medium text-foreground underline underline-offset-4"
            >
              View studio closure and recovery
            </Link>
          </p>
        ) : null}
        {children}
      </DesignerWorkspaceShell>
    </WorkspaceEntitlementSync>
  );
}
