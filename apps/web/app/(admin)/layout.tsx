import type { ReactNode } from 'react';
import { PLATFORM_ROLE } from '@repo/contracts';
import { AdminWorkspaceShell } from '@/components/admin-workspace-shell';
import { requireAuth } from '@/lib/auth-guard';
import { ProtectedBfcacheGuard } from '@/components/protected-bfcache-guard';

/** Admin console chrome. Requires role: admin or superadmin (redirects to /unauthorized). */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAuth({ requiredRole: PLATFORM_ROLE.ADMIN });
  return (
    <AdminWorkspaceShell adminName={session.user.name?.trim() || 'Admin'}>
      <ProtectedBfcacheGuard />
      {children}
    </AdminWorkspaceShell>
  );
}
