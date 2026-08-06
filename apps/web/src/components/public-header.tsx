import Link from 'next/link';
import { PLATFORM_ROLE, platformRoleSchema } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { ListChevronsUpDown, UserRound } from 'lucide-react';
import { AccountMenu } from '@/components/account-menu';
import { TickifBrandLogo } from '@/components/tickif-brand-logo';

const navLinks = [
  { href: '/', label: 'Explore' },
  { href: '/designer/dashboard', label: 'Designers' },
  { href: '/', label: 'Cost Calculator' },
  { href: '/enquiries', label: 'Your Enquiries' },
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
    <header className="border-b border-border bg-background">
      <div className="flex h-14 w-full items-center justify-between px-5 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="inline-flex items-center rounded-lg p-2">
            <TickifBrandLogo />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
            <Button asChild variant="inverted" size="compact">
              <Link href="/login">
                <UserRound className="size-4" aria-hidden />
                Sign in
              </Link>
            </Button>
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

  const parsedRole = platformRoleSchema.safeParse(userRole);
  if (parsedRole.success && parsedRole.data !== PLATFORM_ROLE.VISITOR) {
    return '/designer/dashboard';
  }

  return '/designer/onboarding';
}
