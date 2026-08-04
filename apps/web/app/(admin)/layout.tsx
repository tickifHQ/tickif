import type { ReactNode } from 'react';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { requireAuth } from '@/lib/auth-guard';
import { ProtectedBfcacheGuard } from '@/components/protected-bfcache-guard';

const adminLinks = [
  { href: '/admin/moderation', label: 'Moderation' },
  { href: '/', label: 'View site' },
];

/** Admin console chrome. Requires role: admin or superadmin (redirects to /unauthorized). */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAuth({ requiredRole: 'admin' });
  return (
    <div className="flex min-h-screen flex-col">
      <ProtectedBfcacheGuard />
      <SiteNav brand="Tickif · Admin" brandHref="/admin/moderation" links={adminLinks} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
