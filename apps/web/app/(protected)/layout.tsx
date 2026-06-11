import type { ReactNode } from 'react';
import { requireAuth } from '@/lib/auth-guard';

/**
 * Protected route group layout.
 *
 * Hard auth wall — redirects to /login if no session.
 * No role check here (role checks happen in sub-group layouts).
 *
 * Routes under this group: /dashboard, /settings, project/profile detail pages.
 */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await requireAuth();
  return <>{children}</>;
}
