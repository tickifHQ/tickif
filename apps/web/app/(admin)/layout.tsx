import type { ReactNode } from 'react';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { requireAuth } from '@/lib/auth-guard';

const adminLinks = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/', label: 'View site' },
];

/** Admin console chrome. Requires role: admin or superadmin (redirects to /unauthorized). */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAuth({ requiredRole: 'admin' });
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav brand="Tickif · Admin" brandHref="/admin/dashboard" links={adminLinks} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
