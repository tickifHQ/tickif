'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigationItems = [
  { href: '/', label: 'Explore' },
  { label: 'Designers' },
  { label: 'Cost Calculator' },
  { href: '/enquiries', label: 'Your Enquiries' },
  { label: 'For you' },
] as const;

const itemClassName =
  'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors';

export function PublicNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
      {navigationItems.map((item) => {
        if (!('href' in item)) {
          return (
            <span
              key={item.label}
              aria-disabled="true"
              title="Coming soon"
              className={`${itemClassName} cursor-default opacity-60`}
            >
              {item.label}
              <span className="sr-only">, coming soon</span>
            </span>
          );
        }

        if (isCurrentPath(pathname, item.href)) {
          return (
            <span
              key={item.label}
              aria-current="page"
              className={`${itemClassName} bg-accent text-foreground`}
            >
              {item.label}
            </span>
          );
        }

        return (
          <Link
            key={item.label}
            href={item.href}
            className={`${itemClassName} hover:bg-accent hover:text-foreground`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function isCurrentPath(pathname: string, href: string) {
  return href === '/' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
