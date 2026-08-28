'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState, useTransition, type ComponentType, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AccountMenu } from '@/components/account-menu';
import { DesignerOrganizationSwitcher } from '@/components/designer-organization-switcher';
import { Button } from '@repo/ui/components/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@repo/ui/components/dialog';
import { Skeleton } from '@repo/ui/components/skeleton';
import {
  CalendarDays,
  ChartLine,
  CreditCard,
  ExternalLink,
  FileUser,
  Layers,
  LayoutDashboard,
  Link as LinkIcon,
  Menu,
  MessageSquareMore,
  Plus,
  Settings,
  Shield,
  ShieldCheck,
  Star,
  UsersRound,
  X,
} from 'lucide-react';

type NavItem = {
  label: string;
  href?: string;
  icon: ComponentType<{ className?: string }>;
  headerIcon?: ComponentType<{ className?: string }>;
  comingSoon?: boolean;
  /** Hide from designers who are not the org owner (billing is owner-only until E-240). */
  ownerOnly?: boolean;
};

const studioItems: NavItem[] = [
  { label: 'Overview', href: '/designer/dashboard', icon: LayoutDashboard },
  { label: 'Projects', href: '/designer/projects', icon: Layers },
  { label: 'Leads', href: '/designer/leads', icon: FileUser },
  { label: 'Consultations', href: '/designer/consultations', icon: CalendarDays },
  { label: 'Reviews', href: '/designer/reviews', icon: Star },
  { label: 'Analytics', href: '/designer/analytics', icon: ChartLine },
];

const growItems: NavItem[] = [
  { label: 'Portfolio', href: '/designer/portfolio', icon: LinkIcon },
  {
    label: 'Verification',
    href: '/designer/verification',
    icon: ShieldCheck,
    headerIcon: Shield,
  },
  { label: 'Team & Roles', href: '/designer/terms-roles', icon: UsersRound },
  { label: 'Plan & billing', href: '/designer/plan-billing', icon: CreditCard, ownerOnly: true },
  { label: 'Profile & settings', href: '/designer/profile', icon: Settings },
];

function isItemActive(pathname: string, href?: string) {
  if (!href) return false;
  if (href === '/designer/dashboard') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const active = isItemActive(pathname, item.href);
  const className = item.href
    ? active
      ? 'flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-2 text-sm leading-none font-medium text-foreground shadow-sm'
      : 'flex items-center gap-2 rounded-lg px-2 py-2 text-sm leading-none font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'
    : 'flex cursor-not-allowed items-center gap-2 rounded-lg px-2 py-2 text-sm leading-none font-medium text-muted-foreground/60';

  if (item.href) {
    return (
      <Link href={item.href} className={className} aria-current={active ? 'page' : undefined}>
        <Icon className="size-4" />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <span
      className={className}
      aria-disabled="true"
      title={item.comingSoon ? 'Coming soon' : undefined}
    >
      <Icon className="size-4" />
      <span>{item.label}</span>
      {item.comingSoon ? <span className="sr-only">Coming soon</span> : null}
    </span>
  );
}

function visibleItems(items: NavItem[], isOwner: boolean): NavItem[] {
  return items.filter((item) => !item.ownerOnly || isOwner);
}

function SidebarSection({
  title,
  items,
  pathname,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <section className="space-y-2">
      <div className="text-xs leading-none font-normal text-muted-foreground uppercase">
        {title}
      </div>
      <div className="space-y-0.5">
        {items.map((item) => (
          <SidebarItem key={item.label} item={item} pathname={pathname} />
        ))}
      </div>
    </section>
  );
}

function WorkspaceHeaderTitle({ pathname }: { pathname: string }) {
  if (pathname.startsWith('/designer/projects/upload')) {
    return (
      <div className="hidden items-center gap-2 text-sm leading-5 font-medium text-muted-foreground sm:inline-flex">
        <Link href="/designer/projects" className="inline-flex items-center gap-2 text-foreground">
          <Layers className="size-4" />
          <span className="font-medium">Projects</span>
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">Upload project</span>
      </div>
    );
  }

  const navigationItem = [...studioItems, ...growItems].find((item) =>
    isItemActive(pathname, item.href),
  );

  if (navigationItem?.href) {
    const Icon = navigationItem.headerIcon ?? navigationItem.icon;

    return (
      <div className="hidden items-center gap-2 text-sm leading-5 font-medium text-foreground sm:inline-flex">
        <Icon className="size-4" />
        <span className="font-medium">{navigationItem.label}</span>
      </div>
    );
  }

  return null;
}

function SidebarContent({
  activeOrganizationId,
  studioName,
  studioLocation,
  pathname,
  isWorkspaceRefreshing,
  onSwitchSuccess,
  isOwner,
}: {
  activeOrganizationId: string;
  studioName: string;
  studioLocation: string;
  pathname: string;
  isWorkspaceRefreshing: boolean;
  onSwitchSuccess: (organizationId: string) => void;
  isOwner: boolean;
}) {
  return (
    <>
      <div className="px-6 py-5">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-foreground"
        >
          <Image src="/icon.svg" alt="" width={20} height={20} className="size-5" aria-hidden />
          <span>Tickif</span>
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-between overflow-y-auto px-4 py-5">
        <div className="space-y-6">
          <SidebarSection title="Studio" items={studioItems} pathname={pathname} />
          <SidebarSection
            title="Grow"
            items={visibleItems(growItems, isOwner)}
            pathname={pathname}
          />
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <Link
              href="mailto:support@tickif.in"
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm leading-none font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <MessageSquareMore className="size-4" />
              <span>Contact support</span>
            </Link>
            <Link
              href="/"
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm leading-none font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Image src="/icon.svg" alt="" width={16} height={16} className="size-4" aria-hidden />
              <span>Explore Tickif</span>
              <ExternalLink className="ml-auto size-4" />
            </Link>
          </div>

          <div className="border-t border-border pt-3">
            <DesignerOrganizationSwitcher
              activeOrganizationId={activeOrganizationId}
              studioName={studioName}
              studioLocation={studioLocation}
              isWorkspaceRefreshing={isWorkspaceRefreshing}
              onSwitchSuccess={onSwitchSuccess}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function WorkspaceContentSkeleton() {
  return (
    <div role="status" aria-label="Loading workspace" className="h-full overflow-hidden p-6 md:p-8">
      <span className="sr-only">Loading the selected workspace</span>
      <div className="mx-auto max-w-5xl space-y-6" aria-hidden="true">
        <div className="space-y-3">
          <Skeleton className="h-7 w-48 motion-reduce:animate-none" />
          <Skeleton className="h-4 w-72 max-w-full motion-reduce:animate-none" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-28 rounded-xl motion-reduce:animate-none" />
          <Skeleton className="h-28 rounded-xl motion-reduce:animate-none" />
          <Skeleton className="h-28 rounded-xl motion-reduce:animate-none" />
        </div>
        <Skeleton className="min-h-64 rounded-2xl motion-reduce:animate-none" />
      </div>
    </div>
  );
}

export function DesignerWorkspaceShell({
  activeOrganizationId,
  studioName,
  studioLocation,
  isOwner,
  children,
}: {
  activeOrganizationId: string;
  studioName: string;
  studioLocation: string;
  isOwner: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [refreshingOrganizationId, setRefreshingOrganizationId] = useState<string | null>(null);
  const [isRefreshPending, startRefreshTransition] = useTransition();
  const isWorkspaceRefreshing = refreshingOrganizationId !== null || isRefreshPending;

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (refreshingOrganizationId === activeOrganizationId) {
      setRefreshingOrganizationId(null);
    }
  }, [activeOrganizationId, refreshingOrganizationId]);

  function handleSwitchSuccess(organizationId: string) {
    setRefreshingOrganizationId(organizationId);
    startRefreshTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-muted/30">
      <div className="flex h-full overflow-hidden bg-muted/20">
        <aside className="hidden h-full w-64 shrink-0 flex-col lg:flex">
          <SidebarContent
            activeOrganizationId={activeOrganizationId}
            studioName={studioName}
            studioLocation={studioLocation}
            pathname={pathname}
            isWorkspaceRefreshing={isWorkspaceRefreshing}
            onSwitchSuccess={handleSwitchSuccess}
            isOwner={isOwner}
          />
        </aside>

        <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <DialogContent
            aria-describedby={undefined}
            showCloseButton={false}
            overlayClassName="lg:hidden"
            className="left-0 top-0 flex h-full w-4/5 max-w-72 translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-l-0 border-r border-border bg-background p-0 shadow-xl lg:hidden"
          >
            <DialogTitle className="sr-only">Designer navigation</DialogTitle>
            <DialogClose asChild>
              <button
                type="button"
                aria-label="Close navigation"
                autoFocus
                className="absolute top-4 right-4 inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" />
              </button>
            </DialogClose>
            <SidebarContent
              activeOrganizationId={activeOrganizationId}
              studioName={studioName}
              studioLocation={studioLocation}
              pathname={pathname}
              isWorkspaceRefreshing={isWorkspaceRefreshing}
              onSwitchSuccess={handleSwitchSuccess}
              isOwner={isOwner}
            />
          </DialogContent>
        </Dialog>

        <div className="flex min-w-0 flex-1 flex-col p-2">
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between rounded-t-3xl border border-border/80 bg-background/80 px-6 backdrop-blur">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 cursor-pointer lg:hidden"
                aria-label="Open navigation"
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu className="size-4" />
              </Button>
              <WorkspaceHeaderTitle pathname={pathname} />
            </div>
            <div className="flex items-center gap-2.5">
              {pathname === '/designer/dashboard' ||
              pathname === '/designer/projects' ||
              pathname === '/designer/leads' ? (
                <Button
                  asChild
                  variant="inverted"
                  size="compact"
                  className="size-10 cursor-pointer rounded-full p-0 sm:h-8 sm:w-auto sm:rounded-md sm:px-2.5"
                >
                  <Link href="/designer/projects/new" aria-label="Add new project">
                    <Plus className="size-4" />
                    <span className="hidden sm:inline">Add new project</span>
                  </Link>
                </Button>
              ) : null}
              <AccountMenu showLabel avatarSeed={studioName} />
            </div>
          </header>
          <section className="min-h-0 flex-1 overflow-hidden rounded-b-3xl border-x border-b border-border/80 bg-background shadow-sm">
            <main className="h-full min-w-0 overflow-y-auto" aria-busy={isWorkspaceRefreshing}>
              {isWorkspaceRefreshing ? <WorkspaceContentSkeleton /> : children}
            </main>
          </section>
        </div>
      </div>
    </div>
  );
}
