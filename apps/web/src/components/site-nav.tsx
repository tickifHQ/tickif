import Link from 'next/link';
import { Container } from './container';
import { AccountMenu } from './account-menu';

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
    <header className="border-b bg-background">
      <Container as="nav" className="flex items-center justify-between py-4">
        <Link href={brandHref} className="text-lg font-semibold tracking-tight text-foreground">
          {brand}
        </Link>

        {/* Desktop links + sign in */}
        <div className="hidden items-center gap-6 sm:flex">
          <ul className="flex items-center gap-6">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <AccountMenu />
        </div>

        {/* Mobile account + menu toggle */}
        <div className="flex items-center gap-2 sm:hidden">
          <AccountMenu />
          <details className="relative">
            <summary
              className="flex cursor-pointer list-none items-center rounded-md border px-3 py-2 text-sm text-muted-foreground"
              aria-label="Toggle navigation menu"
            >
              Menu
            </summary>
            <ul className="absolute right-0 z-10 mt-2 w-44 rounded-md border bg-card py-1 shadow-lg">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="block px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </Container>
    </header>
  );
}
