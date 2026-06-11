'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { rolePassesCheck } from '@/lib/auth-guard';

interface RouteGuardProps {
  requiredRole?: 'designer' | 'admin' | 'superadmin';
  children: React.ReactNode;
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

    // role is added by the admin plugin — access via index signature
    const userRole = (session.user as Record<string, unknown>).role as string | null;
    if (requiredRole && !rolePassesCheck(userRole, requiredRole)) {
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

  const userRole = (session.user as Record<string, unknown>).role as string | null;
  if (requiredRole && !rolePassesCheck(userRole, requiredRole)) return null;

  return <>{children}</>;
}
