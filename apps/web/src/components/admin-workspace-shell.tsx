'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';
import { AccountMenu } from '@/components/account-menu';
import { WorkspaceShellFrame } from '@/components/workspace-shell-frame';
import { SUPPORT_WHATSAPP_URL } from '@/lib/support';
import {
  Inbox,
  LayoutDashboard,
  MessageSquareMore,
  ShieldUser,
  SquareChartGantt,
} from 'lucide-react';

type AdminNavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

const adminItems: AdminNavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Project moderation', href: '/moderation', icon: SquareChartGantt },
  { label: 'Review moderation', href: '/review-moderation', icon: MessageSquareMore },
  { label: 'Profile verification', href: '/verifications', icon: ShieldUser },
  { label: 'Enquiries', href: '/admin/enquiries', icon: Inbox },
];

function isActive(pathname: string, href: string) {
  return href === '/dashboard'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function AdminSidebar({ pathname }: { pathname: string }) {
  return (
    <>
      <div className="px-6 py-5">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-foreground"
        >
          <Image src="/icon.svg" alt="" width={20} height={20} className="size-5" aria-hidden />
          <span>Tickif</span>
        </Link>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-between overflow-y-auto px-4 py-5">
        <section className="space-y-2">
          <p className="text-xs font-normal uppercase leading-none text-muted-foreground">
            Operations
          </p>
          <nav className="space-y-0.5" aria-label="Admin navigation">
            {adminItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    active
                      ? 'flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-2 text-sm font-medium leading-none text-foreground shadow-sm'
                      : 'flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'
                  }
                >
                  <Icon className="size-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </section>
        <a
          href={SUPPORT_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <MessageSquareMore className="size-4" aria-hidden="true" />
          <span>Contact support</span>
        </a>
      </div>
    </>
  );
}

export function AdminWorkspaceShell({
  adminName,
  children,
}: {
  adminName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const currentItem = adminItems.find((item) => isActive(pathname, item.href));
  const HeaderIcon = currentItem?.icon ?? LayoutDashboard;

  return (
    <WorkspaceShellFrame
      navigationLabel="Admin navigation"
      renderSidebar={() => <AdminSidebar pathname={pathname} />}
      headerTitle={
        <div className="hidden items-center gap-2 text-sm font-medium leading-5 text-foreground sm:inline-flex">
          <HeaderIcon className="size-4" aria-hidden="true" />
          <span>{currentItem?.label ?? 'Admin'}</span>
        </div>
      }
      headerActions={<AccountMenu showLabel avatarSeed={adminName} />}
    >
      {children}
    </WorkspaceShellFrame>
  );
}
