'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { rolePassesCheck, type RequiredPlatformRole } from '@/lib/auth-guard';

interface RouteGuardProps {
  requiredRole?: RequiredPlatformRole;
  children: React.ReactNode;
}

// role is added by the better-auth admin plugin — not in the base session type.
function getUserRole(user: unknown): string | null {
  return ((user as Record<string, unknown>).role as string | null) ?? null;
}

/**
 * Client-side route guard for pages where server redirect isn't sufficient
 * (e.g. client-navigated routes).
 *
 * States:
 * - Session loading → neutral skeleton (no content flash)
 * - No session → redirect to /login
 * - Role check fails → redirect to /unauthorized
 * - Passes → render children
 *
 * When #16 (RPC 401 hook) lands, useSession() reactive state will handle
 * 401-triggered session invalidation automatically — no extra wiring needed.
 */
export function RouteGuard({ requiredRole, children }: RouteGuardProps) {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();

  useEffect(() => {
    if (isPending) return;

    if (!session?.user) {
      router.replace('/login');
      return;
    }

    if (requiredRole && !rolePassesCheck(getUserRole(session.user), requiredRole)) {
      router.replace('/unauthorized');
    }
  }, [isPending, session, requiredRole, router]);

  if (isPending) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
      </div>
    );
  }

  if (!session?.user) return null;

  if (requiredRole && !rolePassesCheck(getUserRole(session.user), requiredRole)) return null;

  return <>{children}</>;
}
