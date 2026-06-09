import type { ReactNode } from 'react';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';

const designerLinks = [
  { href: '/designer/dashboard', label: 'Dashboard' },
  { href: '/', label: 'View site' },
];

/** Designer workspace chrome. */
export default function DesignerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav brand="Tickif · Designer" brandHref="/designer/dashboard" links={designerLinks} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
