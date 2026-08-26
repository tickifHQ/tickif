'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@repo/ui/lib/utils';

type PublicNavigationItem = { href: string; label: string } | { href?: never; label: string };

const navigationItems = [
  { href: '/', label: 'Explore' },
  { label: 'Designers' },
  { label: 'Cost Calculator' },
  { href: '/enquiries', label: 'Your Enquiries' },
  { label: 'For you' },
] as const satisfies ReadonlyArray<PublicNavigationItem>;

const itemClassName =
  'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors';

export function PublicNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
      {navigationItems.map((item) => {
        if (!('href' in item)) {
          return (
            // Spans are not focusable, so unavailable items are skipped when tabbing.
            <span
              key={item.label}
              aria-label={`${item.label}, coming soon`}
              title="Coming soon"
              className={cn(itemClassName, 'cursor-default opacity-60')}
            >
              {item.label}
            </span>
          );
        }

        if (isCurrentPath(pathname, item.href)) {
          return (
            <span
              key={item.label}
              aria-current="page"
              className={cn(itemClassName, 'bg-accent text-foreground')}
            >
              {item.label}
            </span>
          );
        }

        return (
          <Link
            key={item.label}
            href={item.href}
            className={cn(itemClassName, 'hover:bg-accent hover:text-foreground')}
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
