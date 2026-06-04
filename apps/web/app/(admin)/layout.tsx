import type { ReactNode } from 'react';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';

const adminLinks = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/', label: 'View site' },
];

/** Admin console chrome. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav brand="Tickif · Admin" brandHref="/admin/dashboard" links={adminLinks} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
