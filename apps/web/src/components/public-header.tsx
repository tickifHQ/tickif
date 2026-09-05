import type { ReactNode } from 'react';
import Link from 'next/link';
import { PLATFORM_ROLE, platformRoleSchema } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { ListChevronsUpDown, UserRound } from 'lucide-react';
import { AccountMenu } from '@/components/account-menu';
import { TickifBrandLogo } from '@/components/tickif-brand-logo';
import { PublicNavigation } from '@/components/public-navigation';

/** Public discovery header from the Figma home frame. Admin/designer chrome stays on the shared SiteNav. */
export function PublicHeader({
  contextSwitcher,
  isAuthenticated = false,
  userRole = null,
}: {
  contextSwitcher?: ReactNode;
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
          <PublicNavigation />
        </div>

        <div className="flex items-center gap-2.5">
          {contextSwitcher}
          {contextSwitcher ? null : (
            <Button asChild variant="neutral" size="xs" className="hidden w-32 sm:inline-flex">
              <Link href={listYourWorkHref}>
                <ListChevronsUpDown className="size-4" aria-hidden />
                List your work
              </Link>
            </Button>
          )}
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
