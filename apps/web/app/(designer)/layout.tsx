import type { ReactNode } from 'react';
import { DesignerWorkspaceShell } from '@/components/designer-workspace-shell';
import { requireAuth } from '@/lib/auth-guard';
import { ProtectedBfcacheGuard } from '@/components/protected-bfcache-guard';

/** Designer workspace chrome. Requires role: designer, admin, or superadmin. */
export default async function DesignerLayout({ children }: { children: ReactNode }) {
  const session = await requireAuth({ requiredRole: 'designer' });
  const studioName = session.user.name?.trim() || 'Your studio';
  const studioLocation = session.user.email?.trim() || 'Designer workspace';

  return (
    <DesignerWorkspaceShell studioName={studioName} studioLocation={studioLocation}>
      <ProtectedBfcacheGuard />
      {children}
    </DesignerWorkspaceShell>
  );
}
