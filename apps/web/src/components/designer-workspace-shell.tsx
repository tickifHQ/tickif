'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState, useTransition, type ComponentType, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AccountMenu } from '@/components/account-menu';
import { DesignerBranchSelector } from '@/components/designer-branch-selector';
import { DesignerOrganizationSwitcher } from '@/components/designer-organization-switcher';
import { Button } from '@repo/ui/components/button';
import { Skeleton } from '@repo/ui/components/skeleton';
import { WorkspaceShellFrame } from '@/components/workspace-shell-frame';
import type { OrganizationCapabilities } from '@repo/contracts';
import {
  ChartLine,
  CalendarDays,
  CreditCard,
  FileUser,
  Building2,
  Layers,
  LayoutDashboard,
  Link as LinkIcon,
  MessageSquareMore,
  Plus,
  Settings,
  Shield,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';

type NavItem = {
  label: string;
  href?: string;
  icon: ComponentType<{ className?: string }>;
  headerIcon?: ComponentType<{ className?: string }>;
  comingSoon?: boolean;
  visible?: (capabilities: OrganizationCapabilities) => boolean;
};

const hasProjectAccess = (capabilities: OrganizationCapabilities) =>
  capabilities.writeProjects ||
  (capabilities.analyticsScope !== 'none' && capabilities.analyticsScope !== 'billing');
const hasLeadAccess = (capabilities: OrganizationCapabilities) => capabilities.leadScope !== 'none';

const studioItems: NavItem[] = [
  { label: 'Overview', href: '/designer/dashboard', icon: LayoutDashboard },
  { label: 'Projects', href: '/designer/projects', icon: Layers, visible: hasProjectAccess },
  { label: 'Leads', href: '/designer/leads', icon: FileUser, visible: hasLeadAccess },
  {
    label: 'Reviews',
    href: '/designer/reviews',
    icon: MessageSquareMore,
    visible: (capabilities) => capabilities.manageMembers,
  },
  {
    label: 'Consultations',
    href: '/designer/consultations',
    icon: CalendarDays,
    visible: hasLeadAccess,
  },
  {
    label: 'Analytics',
    href: '/designer/analytics',
    icon: ChartLine,
    visible: (capabilities) => capabilities.analyticsScope !== 'none',
  },
];

const growItems: NavItem[] = [
  {
    label: 'Portfolio',
    href: '/designer/portfolio',
    icon: LinkIcon,
    visible: (capabilities) => capabilities.editOrganization,
  },
  {
    label: 'Verification',
    href: '/designer/verification',
    icon: ShieldCheck,
    headerIcon: Shield,
    visible: (capabilities) => capabilities.manageVerification,
  },
  {
    label: 'Team & Roles',
    href: '/designer/terms-roles',
    icon: UsersRound,
    visible: (capabilities) => capabilities.manageMembers,
  },
  {
    label: 'Branches',
    href: '/designer/branches',
    icon: Building2,
    visible: (capabilities) => capabilities.manageMembers,
  },
  {
    label: 'Plan & billing',
    href: '/designer/plan-billing',
    icon: CreditCard,
    visible: (capabilities) => capabilities.billing,
  },
];

const headerItems: NavItem[] = [
  ...studioItems,
  ...growItems,
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

function visibleItems(items: NavItem[], capabilities: OrganizationCapabilities): NavItem[] {
  return items.filter((item) => !item.visible || item.visible(capabilities));
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

  const navigationItem = headerItems.find((item) => isItemActive(pathname, item.href));

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
  planLabel,
  pathname,
  isWorkspaceRefreshing,
  onSwitchSuccess,
  capabilities,
}: {
  activeOrganizationId: string;
  studioName: string;
  planLabel: string;
  pathname: string;
  isWorkspaceRefreshing: boolean;
  onSwitchSuccess: (organizationId: string) => void;
  capabilities: OrganizationCapabilities;
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
          <SidebarSection
            title="Studio"
            items={visibleItems(studioItems, capabilities)}
            pathname={pathname}
          />
          <SidebarSection
            title="Grow"
            items={visibleItems(growItems, capabilities)}
            pathname={pathname}
          />
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-3">
            <DesignerBranchSelector
              key={activeOrganizationId}
              organizationId={activeOrganizationId}
            />
            <Link
              href="mailto:support@tickif.in"
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm leading-none font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <MessageSquareMore className="size-4" />
              <span>Contact support</span>
            </Link>
          </div>

          <div className="border-t border-border pt-3">
            <DesignerOrganizationSwitcher
              activeOrganizationId={activeOrganizationId}
              studioName={studioName}
              secondaryLabel={planLabel}
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
  planLabel,
  capabilities,
  children,
}: {
  activeOrganizationId: string;
  studioName: string;
  planLabel: string;
  capabilities: OrganizationCapabilities;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [refreshingOrganizationId, setRefreshingOrganizationId] = useState<string | null>(null);
  const [isRefreshPending, startRefreshTransition] = useTransition();
  const isWorkspaceRefreshing = refreshingOrganizationId !== null || isRefreshPending;

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
    <WorkspaceShellFrame
      navigationLabel="Designer navigation"
      renderSidebar={() => (
        <SidebarContent
          activeOrganizationId={activeOrganizationId}
          studioName={studioName}
          planLabel={planLabel}
          pathname={pathname}
          isWorkspaceRefreshing={isWorkspaceRefreshing}
          onSwitchSuccess={handleSwitchSuccess}
          capabilities={capabilities}
        />
      )}
      headerTitle={<WorkspaceHeaderTitle pathname={pathname} />}
      headerActions={
        <>
          {capabilities.writeProjects &&
          (pathname === '/designer/dashboard' ||
            pathname === '/designer/projects' ||
            pathname === '/designer/leads') ? (
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
          <AccountMenu showLabel showProfileSettings={capabilities.editOrganization} />
        </>
      }
      busy={isWorkspaceRefreshing}
      busyFallback={<WorkspaceContentSkeleton />}
    >
      {children}
    </WorkspaceShellFrame>
  );
}
