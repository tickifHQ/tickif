import type { ReactNode } from 'react';
import { requireAuth } from '@/lib/auth-guard';

/**
 * Designer route group layout.
 *
 * Requires role: designer, admin, or superadmin.
 * Redirects to /unauthorized on role mismatch.
 */
export default async function DesignerLayout({ children }: { children: ReactNode }) {
  await requireAuth({ requiredRole: 'designer' });
  return <>{children}</>;
}
