'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
} from '@repo/ui/components/dropdown-menu';
import { Skeleton } from '@repo/ui/components/skeleton';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';

export function AccountMenu({
  showLabel = false,
  avatarSeed,
}: {
  showLabel?: boolean;
  avatarSeed?: string;
}) {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (isPending) {
    return (
      <Skeleton
        role="status"
        className={showLabel ? 'h-10 w-28 rounded-full' : 'size-8 rounded-full'}
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
  const displayName = user.name ?? user.email ?? 'Account';
  const resolvedAvatarSeed = avatarSeed?.trim() || displayName;

  async function handleSignOut() {
    try {
      await authClient.signOut();
    } catch {
      // Keep the user moving away from protected UI even if the local sign-out call reports an error.
    } finally {
      setOpen(false);
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={showLabel ? undefined : `Open account menu for ${displayName}`}
          className={
            showLabel
              ? 'inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-1.5 py-1 pr-3 text-[13px] leading-[1.1] font-medium text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground'
              : 'cursor-pointer outline-none'
          }
        >
          <Avatar className={showLabel ? 'size-8' : undefined}>
            <InitialsAvatar
              seed={resolvedAvatarSeed}
              fallbackSeed="Tickif"
              alt=""
              size={showLabel ? 32 : 40}
            />
          </Avatar>
          {showLabel ? (
            <>
              <span className="max-w-24 truncate text-[13px] leading-[1.1] font-medium">
                {displayName}
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="truncate">
          <p className="font-medium">{user.name}</p>
          {user.email && (
            <p className="text-xs font-normal text-muted-foreground">{user.email}</p>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} variant="destructive" className="cursor-pointer">
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
