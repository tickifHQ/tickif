import type { ReactNode } from 'react';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { requireAuth } from '@/lib/auth-guard';
import { ProtectedBfcacheGuard } from '@/components/protected-bfcache-guard';

const designerLinks = [
  { href: '/designer/dashboard', label: 'Dashboard' },
  { href: '/', label: 'View site' },
];

/** Designer workspace chrome. Requires role: designer, admin, or superadmin. */
export default async function DesignerLayout({ children }: { children: ReactNode }) {
  await requireAuth({ requiredRole: 'designer' });
  return (
    <div className="flex min-h-screen flex-col">
      <ProtectedBfcacheGuard />
      <SiteNav brand="Tickif · Designer" brandHref="/designer/dashboard" links={designerLinks} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
