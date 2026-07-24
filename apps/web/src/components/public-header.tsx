import Link from 'next/link';
import { Button } from '@repo/ui/components/button';
import { ListChevronsUpDown, UserRound } from 'lucide-react';
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
          <Button asChild variant="neutral" size="xs" className="hidden w-32 sm:inline-flex">
            <Link href={listYourWorkHref}>
              <ListChevronsUpDown className="size-4" aria-hidden />
              List your work
            </Link>
          </Button>
          {isAuthenticated ? (
            <AccountMenu />
          ) : (
            <Link
              href="/login"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#27272a] px-2.5 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-[#27272a]/90"
            >
              <UserRound className="size-4" aria-hidden />
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
