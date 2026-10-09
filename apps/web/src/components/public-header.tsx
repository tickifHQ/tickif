import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { PLATFORM_ROLE, platformRoleSchema } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { ListChevronsUpDown, UserRound } from 'lucide-react';
import { AccountMenu } from '@/components/account-menu';
import { TickifBrandLogo } from '@/components/tickif-brand-logo';
import { PublicNavigation } from '@/components/public-navigation';
import { LandingHeaderSearch } from '@/components/home-search-bar';

/** Public discovery header from the Figma home frame. Admin/designer chrome stays on the shared SiteNav. */
export function PublicHeader({
  contextSwitcher,
  isAuthenticated = false,
  userRole = null,
  landing = false,
}: {
  contextSwitcher?: ReactNode;
  isAuthenticated?: boolean;
  userRole?: string | null;
  landing?: boolean;
}) {
  const listYourWorkHref =
    isAuthenticated && userRole === PLATFORM_ROLE.VISITOR
      ? null
      : getListYourWorkHref({ isAuthenticated, userRole });

  return (
    <header className="border-b border-border bg-background/90 backdrop-blur-md">
      <div
        className={`flex w-full items-center justify-between gap-4 px-5 ${landing ? 'h-[72px] sm:px-8 lg:px-12' : 'h-14 sm:px-6'}`}
      >
        <div className="flex items-center gap-6 lg:gap-9">
          <Link href="/" className="inline-flex items-center rounded-lg p-2">
            {landing ? (
              <span className="inline-flex items-center gap-3" aria-label="Tickif">
                <img src="/images/landing/logo-mark.svg" alt="" />
                <img
                  src="/images/landing/logo-word.svg"
                  alt="Tickif"
                  className="dark:brightness-0 dark:invert"
                />
              </span>
            ) : (
              <TickifBrandLogo />
            )}
          </Link>
          <PublicNavigation landing={landing} />
        </div>

        <div className="flex items-center gap-2.5">
          {contextSwitcher}
          {landing ? (
            <div className="hidden w-[470px] xl:block">
              <Suspense>
                <LandingHeaderSearch />
              </Suspense>
            </div>
          ) : null}
          {listYourWorkHref ? (
            <Button
              asChild
              variant={landing ? 'ghost' : 'neutral'}
              size={landing ? 'sm' : 'xs'}
              className="hidden sm:inline-flex"
            >
              <Link href={listYourWorkHref}>
                {!landing ? <ListChevronsUpDown className="size-4" aria-hidden /> : null}
                {landing ? 'List your projects' : 'List your work'}
              </Link>
            </Button>
          ) : null}
          {isAuthenticated ? (
            <AccountMenu showProfileSettings={userRole === PLATFORM_ROLE.DESIGNER} />
          ) : (
            <Button
              asChild
              variant={landing ? 'default' : 'inverted'}
              size={landing ? 'sm' : 'compact'}
            >
              <Link href="/login">
                {!landing ? <UserRound className="size-4" aria-hidden /> : null}
                {landing ? 'Log in' : 'Sign in'}
              </Link>
            </Button>
          )}
        </div>
      </div>
      <PublicNavigation mobile landing={landing} />
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
  if (!parsedRole.success) return '/unauthorized';
  if (parsedRole.data === PLATFORM_ROLE.DESIGNER) {
    return '/designer/dashboard';
  }
  if (parsedRole.data === PLATFORM_ROLE.ADMIN || parsedRole.data === PLATFORM_ROLE.SUPERADMIN) {
    return '/dashboard';
  }
  return '/unauthorized';
}
