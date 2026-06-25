import Link from 'next/link';
import { AccountMenu } from '@/components/account-menu';

const navLinks = [
  { href: '/', label: 'Explore' },
  { href: '/designer/dashboard', label: 'Designers' },
  { href: '/', label: 'Cost Calculator' },
  { href: '/', label: 'For you' },
];

/** Public discovery header from the Figma home frame. Admin/designer chrome stays on the shared SiteNav. */
export function PublicHeader({
  isAuthenticated = false,
  userRole = null,
}: {
  isAuthenticated?: boolean;
  userRole?: string | null;
}) {
  const listYourWorkHref = getListYourWorkHref({ isAuthenticated, userRole });

  return (
    <header className="border-b border-[#e8e6e1] bg-white">
      <div className="mx-auto flex h-14 w-full max-w-[1512px] items-center justify-between px-6 lg:px-10">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-[20px] font-medium tracking-tight text-[#047857]">
            tickif
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="rounded-md px-3 py-1.5 text-[13px] font-medium text-[#52525b] transition-colors hover:bg-accent hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href={listYourWorkHref}
            className="hidden h-8 items-center gap-1.5 rounded-md border border-border bg-white px-2.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-accent sm:inline-flex"
          >
            <svg viewBox="0 0 24 24" className="size-[15px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
            </svg>
            List your work
          </Link>
          {isAuthenticated ? (
            <AccountMenu />
          ) : (
            <Link
              href="/login"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#27272a] px-2.5 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-[#27272a]/90"
            >
              <svg viewBox="0 0 24 24" className="size-[15px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" />
              </svg>
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function getListYourWorkHref({
  isAuthenticated,
  userRole,
}: {
  isAuthenticated: boolean;
  userRole: string | null;
}) {
  if (!isAuthenticated) {
    return '/login?mode=designer';
  }

  if (userRole === 'designer' || userRole === 'admin' || userRole === 'superadmin') {
    return '/designer/dashboard';
  }

  return '/designer/onboarding';
}
