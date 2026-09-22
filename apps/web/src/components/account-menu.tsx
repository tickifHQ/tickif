'use client';

import { useState } from 'react';
import { ACCOUNT_STATUS, PLATFORM_ROLE } from '@repo/contracts';
import { authClient } from '@/lib/auth-client';
import { InitialsAvatar } from '@/components/initials-avatar';
import { Avatar } from '@repo/ui/components/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuGroup,
} from '@repo/ui/components/dropdown-menu';
import { Skeleton } from '@repo/ui/components/skeleton';
import { cn } from '@repo/ui/lib/utils';
import { ChevronDown, LogOut, Settings } from 'lucide-react';
import Link from 'next/link';

/**
 * Where "Complete setup" sends a pending account. A deferred designer signup is
 * role=visitor + status=pending until they create a studio, so we cannot rely on
 * the DESIGNER role to detect designer intent. Any pending account that reached a
 * designer-onboarding entry point resumes the designer flow — mirroring
 * public-header's getListYourWorkHref (status=pending → /designer/onboarding), so
 * "Complete setup", "List your work", and "Continue setup" all land on the same
 * resumable onboarding rather than the visitor form. An explicit DESIGNER role
 * (rare in this pending+no-org state) also routes there.
 */
function completeSetupHref(personalRole: string | null): string {
  return personalRole === PLATFORM_ROLE.VISITOR || personalRole === PLATFORM_ROLE.DESIGNER
    ? '/designer/onboarding'
    : '/onboarding';
}

export function AccountMenu({
  showLabel = false,
  avatarSeed,
  showProfileSettings = false,
}: {
  showLabel?: boolean;
  avatarSeed?: string;
  showProfileSettings?: boolean;
}) {
  const { data: session, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false);

  if (isPending) {
    return (
      <Skeleton
        role="status"
        className={showLabel ? 'size-10 rounded-full sm:w-28' : 'size-8 rounded-full'}
      />
    );
  }

  if (!session) {
    return (
      <Link
        href="/login"
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Sign in
      </Link>
    );
  }

  const user = session.user;
  const personalRole = 'role' in user ? user.role : null;
  const accountStatus = 'status' in user ? user.status : null;
  const hasOrganizationContext = Boolean(session.session.activeOrganizationId);
  const hasPersonalProfileRole =
    personalRole === PLATFORM_ROLE.VISITOR || personalRole === PLATFORM_ROLE.DESIGNER;
  const userName = user.name?.trim() || null;
  const displayName = userName ?? 'Account';
  const firstName = userName?.split(/\s+/, 1)[0] ?? 'Account';
  const resolvedAvatarSeed = avatarSeed?.trim() || displayName;

  async function handleSignOut() {
    try {
      await authClient.signOut();
    } catch {
      // Keep the user moving away from protected UI even if the local sign-out call reports an error.
    } finally {
      setOpen(false);
      // Sign-out must leave protected content entirely, never render it behind
      // the intercepted sign-in modal.
      window.location.replace('/login');
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Open account menu for ${displayName}`}
          className={cn(
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            showLabel
              ? 'inline-flex cursor-pointer items-center gap-0 rounded-full border border-border bg-background p-1 text-sm leading-none font-medium text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground sm:gap-2 sm:pr-3'
              : 'inline-flex size-8 cursor-pointer items-center justify-center rounded-full outline-none',
          )}
        >
          <Avatar className="size-8">
            <InitialsAvatar seed={resolvedAvatarSeed} fallbackSeed="Your name" alt="" size={32} />
          </Avatar>
          {showLabel ? (
            <>
              <span className="hidden max-w-24 truncate text-sm leading-none font-medium sm:inline">
                {firstName}
              </span>
              <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
            </>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="truncate">
          <p className="font-medium">{displayName}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {personalRole === PLATFORM_ROLE.VISITOR &&
          accountStatus === ACCOUNT_STATUS.ACTIVE &&
          !hasOrganizationContext ? (
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/home/settings">
                <Settings aria-hidden="true" />
                Personal settings
              </Link>
            </DropdownMenuItem>
          ) : null}
          {hasPersonalProfileRole &&
          accountStatus === ACCOUNT_STATUS.PENDING &&
          !hasOrganizationContext ? (
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href={completeSetupHref(personalRole)}>
                <Settings aria-hidden="true" />
                Complete setup
              </Link>
            </DropdownMenuItem>
          ) : null}
          {showProfileSettings &&
          personalRole === PLATFORM_ROLE.DESIGNER &&
          accountStatus === ACCOUNT_STATUS.ACTIVE &&
          hasOrganizationContext ? (
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/designer/profile">
                <Settings aria-hidden="true" />
                Profile &amp; settings
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={handleSignOut}
            variant="destructive"
            className="cursor-pointer"
          >
            <LogOut aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
