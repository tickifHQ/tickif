import Link from 'next/link';
import { Container } from './container';

export type NavLink = { href: string; label: string };

const defaultLinks: NavLink[] = [
  { href: '/', label: 'Discover' },
  { href: '/designer/dashboard', label: 'For designers' },
];

/**
 * Responsive top navigation. The mobile menu uses a native `<details>`/
 * `<summary>` disclosure so it works without any client-side JS — keeping this
 * a Server Component. `brand` and `links` are configurable so designer/admin
 * areas can vary the chrome.
 */
export function SiteNav({
  brand = 'Tickif',
  brandHref = '/',
  links = defaultLinks,
}: {
  brand?: string;
  brandHref?: string;
  links?: NavLink[];
}) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <Container as="nav" className="flex items-center justify-between py-4">
        <Link href={brandHref} className="text-lg font-semibold tracking-tight text-neutral-900">
          {brand}
        </Link>

        {/* Desktop links */}
        <ul className="hidden items-center gap-6 sm:flex">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm text-neutral-600 transition-colors hover:text-neutral-900"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Mobile disclosure menu (no JS) */}
        <details className="relative sm:hidden">
          <summary
            className="flex cursor-pointer list-none items-center rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
            aria-label="Toggle navigation menu"
          >
            Menu
          </summary>
          <ul className="absolute right-0 z-10 mt-2 w-44 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      </Container>
    </header>
  );
}
