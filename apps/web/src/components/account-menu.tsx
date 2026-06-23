'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Avatar, AvatarFallback } from '@repo/ui/components/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@repo/ui/components/dropdown-menu';
import { Skeleton } from '@repo/ui/components/skeleton';
import Link from 'next/link';

export function AccountMenu() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (isPending) {
    return <Skeleton role="status" className="size-8 rounded-full" />;
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
  const initial = (user.name ?? user.email ?? '?').charAt(0).toUpperCase();

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
        <button type="button" className="outline-none">
          <Avatar>
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
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
