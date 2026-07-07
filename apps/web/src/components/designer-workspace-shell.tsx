'use client';

import Link from 'next/link';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AccountMenu } from '@/components/account-menu';
import { InitialsAvatar } from '@/components/initials-avatar';
import { Avatar } from '@repo/ui/components/avatar';
import { Button } from '@repo/ui/components/button';
import {
  ArrowUpRight,
  BadgeHelp,
  BriefcaseBusiness,
  CalendarDays,
  ChartLine,
  CircleUserRound,
  FileBadge2,
  FolderKanban,
  HandCoins,
  House,
  Menu,
  MessagesSquare,
  Plus,
  ShieldCheck,
  Star,
  Users,
  X,
} from 'lucide-react';

type NavItem = {
  label: string;
  href?: string;
  icon: ComponentType<{ className?: string }>;
};

const studioItems: NavItem[] = [
  { label: 'Overview', href: '/designer/dashboard', icon: House },
  { label: 'Projects', href: '/designer/projects', icon: FolderKanban },
  { label: 'Leads', href: '/designer/leads', icon: Users },
  { label: 'Consultations', icon: CalendarDays },
  { label: 'Reviews', icon: Star },
  { label: 'Analytics', icon: ChartLine },
];

const growItems: NavItem[] = [
  { label: 'Portfolio', href: '/designer/onboarding', icon: BriefcaseBusiness },
  { label: 'Verification', icon: ShieldCheck },
  { label: 'Terms & roles', icon: FileBadge2 },
  { label: 'Plan & billing', icon: HandCoins },
  { label: 'Profile & settings', href: '/designer/profile', icon: CircleUserRound },
];

function isItemActive(pathname: string, href?: string) {
  if (!href) return false;
  if (href === '/designer/dashboard') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const active = isItemActive(pathname, item.href);
  const className = active
    ? 'flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-2 text-[13px] leading-[1.1] font-medium text-foreground shadow-sm'
    : 'flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] leading-[1.1] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground';

  if (item.href) {
    return (
      <Link href={item.href} className={className} aria-current={active ? 'page' : undefined}>
        <Icon className="size-4" />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <span className={className} aria-disabled="true">
      <Icon className="size-4" />
      <span>{item.label}</span>
    </span>
  );
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
      <div className="font-mono px-2 py-2 text-xs leading-[1.1] font-normal text-muted-foreground uppercase">
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
  if (pathname === '/designer/dashboard') {
    return (
      <div className="inline-flex items-center gap-2 text-sm leading-5 font-medium tracking-[-0.006em] text-foreground">
        <House className="size-4" />
        <span className="font-medium">Overview</span>
      </div>
    );
  }

  if (pathname === '/designer/projects') {
    return (
      <div className="inline-flex items-center gap-2 text-sm leading-5 font-medium tracking-[-0.006em] text-foreground">
        <FolderKanban className="size-4" />
        <span className="font-medium">Projects</span>
      </div>
    );
  }

  if (pathname === '/designer/leads') {
    return (
      <div className="inline-flex items-center gap-2 text-sm leading-5 font-medium tracking-[-0.006em] text-foreground">
        <Users className="size-4" />
        <span className="font-medium">Leads</span>
      </div>
    );
  }

  if (pathname.startsWith('/designer/projects/upload')) {
    return (
      <div className="inline-flex items-center gap-2 text-sm leading-5 font-medium tracking-[-0.006em] text-muted-foreground">
        <Link href="/designer/projects" className="inline-flex items-center gap-2 text-foreground">
          <BriefcaseBusiness className="size-4" />
          <span className="font-medium">Projects</span>
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">Upload project</span>
      </div>
    );
  }

  return null;
}

function SidebarContent({
  studioName,
  studioLocation,
  pathname,
}: {
  studioName: string;
  studioLocation: string;
  pathname: string;
}) {
  return (
    <>
      <div className="border-b border-border px-6 py-5">
        <Link href="/" className="inline-flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <span>Tickif</span>
        </Link>
      </div>

      <div className="border-b border-border p-4">
        <div className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left shadow-sm">
          <Avatar className="size-10 rounded-xl">
            <InitialsAvatar
              seed={studioName}
              fallbackSeed={studioLocation}
              alt=""
              size={40}
            />
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm leading-[1.1] font-medium text-foreground">{studioName}</div>
            <div className="truncate text-xs leading-[1.1] text-muted-foreground">{studioLocation}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between px-4 py-5">
        <div className="space-y-6">
          <SidebarSection title="Studio" items={studioItems} pathname={pathname} />
          <SidebarSection title="Grow" items={growItems} pathname={pathname} />
        </div>

        <div className="space-y-1">
          <Link
            href="mailto:support@tickif.in"
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] leading-[1.1] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <BadgeHelp className="size-4" />
            <span>Contact support</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] leading-[1.1] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <MessagesSquare className="size-4" />
            <span>Explore Tickif</span>
            <ArrowUpRight className="ml-auto size-4" />
          </Link>
        </div>
      </div>
    </>
  );
}

export function DesignerWorkspaceShell({
  studioName,
  studioLocation,
  children,
}: {
  studioName: string;
  studioLocation: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-muted/30">
      <div className="flex h-full overflow-hidden bg-muted/20">
        <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-border/80 bg-background/70 lg:flex">
          <SidebarContent studioName={studioName} studioLocation={studioLocation} pathname={pathname} />
        </aside>

        {mobileNavOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Designer navigation">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-background shadow-xl">
              <button
                type="button"
                aria-label="Close navigation"
                className="absolute top-4 right-4 inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={() => setMobileNavOpen(false)}
              >
                <X className="size-4" />
              </button>
              <SidebarContent studioName={studioName} studioLocation={studioLocation} pathname={pathname} />
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col p-2">
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between rounded-t-[22px] border border-border/80 bg-background/80 px-6 backdrop-blur">
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
              {pathname === '/designer/dashboard' || pathname === '/designer/projects' || pathname === '/designer/leads' ? (
                <Button
                  asChild
                  variant="emphasis"
                  className="h-10 cursor-pointer"
                >
                  <Link href="/designer/projects/new">
                    <Plus className="size-4" />
                    Add new project
                  </Link>
                </Button>
              ) : null}
              <AccountMenu showLabel avatarSeed={studioName} />
            </div>
          </header>
          <section className="min-h-0 flex-1 overflow-hidden rounded-b-[22px] border-x border-b border-border/80 bg-background shadow-sm">
            <main className="h-full min-w-0 overflow-y-auto">
              {children}
            </main>
          </section>
        </div>
      </div>
    </div>
  );
}
