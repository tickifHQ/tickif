'use client';

import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
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
  ChevronDown,
  CircleUserRound,
  FileBadge2,
  FolderKanban,
  HandCoins,
  House,
  MessagesSquare,
  Plus,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react';

type NavItem = {
  label: string;
  href?: string;
  icon: ComponentType<{ className?: string }>;
};

const studioItems: NavItem[] = [
  { label: 'Overview', href: '/designer/dashboard', icon: House },
  { label: 'Projects', href: '/designer/projects/upload', icon: FolderKanban },
  { label: 'Leads', icon: Users },
  { label: 'Consultations', icon: CalendarDays },
  { label: 'Reviews', icon: Star },
  { label: 'Analytics', icon: ChartLine },
];

const growItems: NavItem[] = [
  { label: 'Portfolio', href: '/designer/onboarding', icon: BriefcaseBusiness },
  { label: 'Verification', icon: ShieldCheck },
  { label: 'Terms & roles', icon: FileBadge2 },
  { label: 'Plan & billing', icon: HandCoins },
  { label: 'Profile & settings', icon: CircleUserRound },
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

  if (pathname.startsWith('/designer/projects/upload')) {
    return (
      <div className="inline-flex items-center gap-2 text-sm leading-5 font-medium tracking-[-0.006em] text-muted-foreground">
        <Link href="/designer/projects/upload" className="inline-flex items-center gap-2 text-foreground">
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

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="flex min-h-screen overflow-hidden bg-muted/20">
        <aside className="flex w-64 shrink-0 flex-col border-r border-border/80 bg-background/70">
          <div className="border-b border-border px-6 py-5">
            <Link href="/" className="inline-flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
              <span>Tickif</span>
            </Link>
          </div>

          <div className="border-b border-border p-4">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left shadow-sm transition-colors hover:bg-accent"
            >
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
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
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
        </aside>

        <div className="flex min-w-0 flex-1 flex-col p-2">
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between rounded-t-[22px] border border-border/80 bg-background/80 px-6 backdrop-blur">
            <WorkspaceHeaderTitle pathname={pathname} />
            <div className="flex items-center gap-2.5">
              {pathname === '/designer/dashboard' ? (
                <Button
                  asChild
                  className="h-10 cursor-pointer border border-white/10 bg-[#0e121b] text-white shadow-[0px_1px_2px_0px_rgba(27,28,29,0.48),0px_0px_0px_1px_#242628] [background-image:linear-gradient(180deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_100%)] hover:bg-[#0e121b]/90"
                >
                  <Link href="/designer/projects/upload">
                    <Plus className="size-4" />
                    Add new project
                  </Link>
                </Button>
              ) : null}
              <AccountMenu showLabel />
            </div>
          </header>
          <section className="min-h-0 flex-1 overflow-hidden rounded-b-[22px] border-x border-b border-border/80 bg-background shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
            <main className="h-full min-w-0 overflow-y-auto">{children}</main>
          </section>
        </div>
      </div>
    </div>
  );
}
