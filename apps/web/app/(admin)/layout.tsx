import type { ReactNode } from 'react';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { requireAuth } from '@/lib/auth-guard';
import { ProtectedBfcacheGuard } from '@/components/protected-bfcache-guard';
import { ADMIN_LOGIN_PATH } from '@/lib/auth-paths';

const adminLinks = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/', label: 'View site' },
];

/** Admin console chrome. Requires role: admin or superadmin (redirects to /unauthorized). */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAuth({
    requiredRole: 'admin',
    unauthenticatedRedirectTo: ADMIN_LOGIN_PATH,
  });
  return (
    <div className="flex min-h-screen flex-col">
      <ProtectedBfcacheGuard />
      <SiteNav brand="Tickif · Admin" brandHref="/admin/dashboard" links={adminLinks} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
