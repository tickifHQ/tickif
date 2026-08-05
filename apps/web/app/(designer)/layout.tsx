import type { ReactNode } from 'react';
import { PLATFORM_ROLE } from '@repo/contracts';
import { DesignerWorkspaceShell } from '@/components/designer-workspace-shell';
import { requireAuth } from '@/lib/auth-guard';
import { ProtectedBfcacheGuard } from '@/components/protected-bfcache-guard';
import { requireCurrentDesignerProfile } from '@/lib/designer-profile';

/** Designer workspace chrome. Requires role: designer, admin, or superadmin. */
export default async function DesignerLayout({ children }: { children: ReactNode }) {
  const session = await requireAuth({ requiredRole: PLATFORM_ROLE.DESIGNER });
  const profile = await requireCurrentDesignerProfile();
  const studioName = profile.displayName.trim() || session.user.name?.trim() || 'Your studio';
  const studioLocation =
    profile.address?.trim() || profile.organization.name.trim() || 'Designer workspace';

  return (
    <DesignerWorkspaceShell
      activeOrganizationId={profile.organization.id}
      studioName={studioName}
      studioLocation={studioLocation}
    >
      <ProtectedBfcacheGuard />
      {children}
    </DesignerWorkspaceShell>
  );
}
