'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@repo/ui/lib/utils';
import { typography } from '@repo/ui/lib/typography';

type PublicNavigationItem = { href: string; label: string };

const navigationItems = [
  { href: '/', label: 'Explore' },
  { href: '/designers', label: 'Designers' },
  { href: '/blog', label: 'Blog' },
  { href: '/enquiries', label: 'Your Enquiries' },
] as const satisfies ReadonlyArray<PublicNavigationItem>;
const mobileNavigationItems = navigationItems.slice(0, 3);

const itemClassName =
  'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors';

export function PublicNavigation({
  mobile = false,
  landing = false,
  visitor = false,
  visitorView,
}: {
  mobile?: boolean;
  landing?: boolean;
  visitor?: boolean;
  visitorView?: 'explore' | 'nearby' | 'following';
}) {
  const pathname = usePathname();
  const items = visitor
    ? [
        { href: '/home', label: 'For you' },
        { href: '/home?feed=custom&view=explore', label: 'Explore' },
        { href: '/designers', label: 'Designers' },
      ]
    : landing
      ? [
          { href: '/', label: 'Explore' },
          { href: '/#browse-by-room', label: 'Rooms' },
          { href: '/#browse-by-city', label: 'Cities' },
          { href: '/designers', label: 'Designers' },
        ]
      : mobile
        ? mobileNavigationItems
        : navigationItems;

  return (
    <nav
      aria-label={mobile ? 'Mobile primary' : 'Primary'}
      className={
        mobile
          ? cn('flex flex-wrap items-center gap-2 px-5 pb-3', visitor ? 'lg:hidden' : 'md:hidden')
          : cn('hidden items-center', visitor ? 'gap-0.5 lg:flex' : 'gap-1 md:flex')
      }
    >
      {items.map((item) => {
        const current =
          visitor && pathname === '/home' && item.label !== 'Designers'
            ? visitorView === 'explore'
              ? item.label === 'Explore'
              : item.label === 'For you'
            : isCurrentPath(pathname, item.href);
        if (current) {
          return (
            <span
              key={item.label}
              aria-current="page"
              className={cn(
                itemClassName,
                visitor ? [typography.labelMd, 'py-2'] : landing && typography.labelSm,
                landing || visitor
                  ? 'rounded-full bg-foreground/6 text-foreground'
                  : 'bg-accent text-foreground',
              )}
            >
              {item.label}
            </span>
          );
        }

        return (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              itemClassName,
              (landing || visitor) && typography.labelMd,
              visitor && 'rounded-full py-2',
              'hover:bg-accent hover:text-foreground',
            )}
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
