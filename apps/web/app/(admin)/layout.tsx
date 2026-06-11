import type { ReactNode } from 'react';
import { requireAuth } from '@/lib/auth-guard';

/**
 * Admin route group layout.
 *
 * Requires role: admin or superadmin.
 * Redirects to /unauthorized on role mismatch.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAuth({ requiredRole: 'admin' });
  return <>{children}</>;
}
