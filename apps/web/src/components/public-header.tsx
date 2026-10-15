import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@repo/ui/lib/utils';
import { typography } from '@repo/ui/lib/typography';
import { PLATFORM_ROLE, platformRoleSchema } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Separator } from '@repo/ui/components/separator';
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
  visitor = false,
  visitorSearch,
  visitorActivity,
  visitorView,
}: {
  contextSwitcher?: ReactNode;
  isAuthenticated?: boolean;
  userRole?: string | null;
  landing?: boolean;
  visitor?: boolean;
  visitorSearch?: ReactNode;
  visitorActivity?: ReactNode;
  visitorView?: 'explore' | 'nearby' | 'following';
}) {
  const listYourWorkHref =
    isAuthenticated && userRole === PLATFORM_ROLE.VISITOR
      ? null
      : getListYourWorkHref({ isAuthenticated, userRole });

  return (
    <header
      className={cn(
        'relative z-40 border-b backdrop-blur-md',
        visitor
          ? 'border-account-menu-divider bg-visitor-header-background xl:h-18'
          : 'border-border bg-background/90',
      )}
    >
      <div
        className={cn(
          'flex w-full items-center justify-between gap-3 px-5',
          visitor
            ? 'min-h-18 flex-wrap py-3 sm:px-8 lg:px-12 xl:h-full xl:min-h-0 xl:flex-nowrap xl:py-0'
            : landing
              ? 'h-18 sm:px-8 lg:px-12'
              : 'h-14 sm:px-6',
        )}
      >
        <div className={cn('flex items-center gap-6 lg:gap-9', visitor && 'shrink-0')}>
          <Link
            href="/"
            className={cn(
              'inline-flex items-center rounded-lg',
              visitor ? 'p-navigation-logo' : 'p-2',
            )}
          >
            {landing || visitor ? (
              <span
                className={cn('inline-flex items-center', visitor ? 'gap-3.25' : 'gap-3')}
                aria-label="Tickif"
              >
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
          <PublicNavigation landing={landing} visitor={visitor} visitorView={visitorView} />
        </div>
        <div
          className={
            visitorSearch ? 'contents xl:flex xl:min-w-0 xl:items-center xl:gap-2' : 'contents'
          }
        >
          {visitorSearch ? (
            <div className="order-last w-full min-w-0 xl:order-none xl:w-117.5">
              {visitorSearch}
            </div>
          ) : null}
          <div className={cn('flex items-center', visitor ? 'shrink-0 gap-2' : 'gap-2.5')}>
            {contextSwitcher}
            {visitorActivity ? <div className="hidden sm:block">{visitorActivity}</div> : null}
            {landing ? (
              <div className="hidden w-117.5 xl:block">
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
                className={cn('hidden sm:inline-flex', landing && typography.labelMd)}
              >
                <Link href={listYourWorkHref}>
                  {!landing ? <ListChevronsUpDown className="size-4" aria-hidden /> : null}
                  {landing ? 'List your projects' : 'List your work'}
                </Link>
              </Button>
            ) : null}
            {isAuthenticated ? (
              <>
                {visitor && visitorActivity ? (
                  <Separator
                    orientation="vertical"
                    className="hidden bg-foreground/10 data-[orientation=vertical]:h-5 sm:block"
                  />
                ) : null}
                <AccountMenu showProfileSettings={userRole === PLATFORM_ROLE.DESIGNER} />
              </>
            ) : (
              <Button
                asChild
                variant={landing ? 'default' : 'inverted'}
                size={landing ? 'sm' : 'compact'}
                className={landing ? typography.labelMd : undefined}
              >
                <Link href="/login">
                  {!landing ? <UserRound className="size-4" aria-hidden /> : null}
                  {landing ? 'Log in' : 'Sign in'}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
      <PublicNavigation mobile landing={landing} visitor={visitor} visitorView={visitorView} />
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
