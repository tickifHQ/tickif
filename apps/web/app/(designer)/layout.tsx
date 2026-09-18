import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { PLATFORM_ROLE } from '@repo/contracts';
import { DesignerWorkspaceShell } from '@/components/designer-workspace-shell';
import { requireAuth } from '@/lib/auth-guard';
import { ProtectedBfcacheGuard } from '@/components/protected-bfcache-guard';
import { requireCurrentDesignerProfile } from '@/lib/designer-profile';
import { getCurrentOrgCapabilities } from '@/lib/current-org-role';

/** Designer workspace chrome. Requires the exact designer platform role. */
export default async function DesignerLayout({ children }: { children: ReactNode }) {
  const session = await requireAuth({ requiredRole: PLATFORM_ROLE.DESIGNER });
  const [profile, orgCapabilities] = await Promise.all([
    requireCurrentDesignerProfile(),
    getCurrentOrgCapabilities(),
  ]);
  const studioName = profile.displayName.trim() || session.user.name?.trim() || 'Your studio';
  const studioLocation =
    profile.address?.trim() || profile.organization.name.trim() || 'Designer workspace';
  if (!orgCapabilities) redirect('/unauthorized');

  return (
    <DesignerWorkspaceShell
      activeOrganizationId={profile.organization.id}
      studioName={studioName}
      studioLocation={studioLocation}
      capabilities={orgCapabilities}
    >
      <ProtectedBfcacheGuard />
      {children}
    </DesignerWorkspaceShell>
  );
}
