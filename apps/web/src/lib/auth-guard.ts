import { cache } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { PLATFORM_ROLE, platformRoleSchema, type PlatformRole } from '@repo/contracts';
import { env } from '@/env';

export type RequiredPlatformRole = Exclude<PlatformRole, typeof PLATFORM_ROLE.VISITOR>;

const PLATFORM_ROLE_LEVEL: Readonly<Record<PlatformRole, number>> = {
  [PLATFORM_ROLE.VISITOR]: 0,
  [PLATFORM_ROLE.DESIGNER]: 1,
  [PLATFORM_ROLE.ADMIN]: 2,
  [PLATFORM_ROLE.SUPERADMIN]: 3,
};

/**
 * Server-side auth utilities for layouts and server components.
 *
 * Calls the API's better-auth session endpoint to resolve the current user.
 * Does NOT import @repo/auth (that pulls DB deps into the web bundle).
 */

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  [key: string]: unknown;
};

type SessionData = {
  session: {
    id: string;
    token: string;
    expiresAt: string;
    activeOrganizationId?: string | null;
    [key: string]: unknown;
  };
  user: SessionUser;
};

type GetServerSessionOptions = {
  disableCookieCache?: boolean;
};

/**
 * Role hierarchy:
 * - superadmin passes all checks
 * - admin passes admin + designer checks
 * - designer passes designer check only
 * - null fails all checks
 */
export function rolePassesCheck(
  userRole: string | null,
  requiredRole: RequiredPlatformRole,
): boolean {
  const parsedRole = platformRoleSchema.safeParse(userRole);
  if (!parsedRole.success) return false;

  const userLevel = PLATFORM_ROLE_LEVEL[parsedRole.data];
  const requiredLevel = PLATFORM_ROLE_LEVEL[requiredRole];

  return userLevel >= requiredLevel;
}

/**
 * Non-throwing variant — returns session or null.
 * Used in (public)/layout.tsx to decide whether to render the scroll-gate.
 *
 * Deduped per request (React cache), keyed by disableCookieCache: callers
 * passing the same flag (e.g. (public) layout + page) share one API
 * round-trip; callers with different flags still fetch independently.
 */
export async function getServerSession(options?: GetServerSessionOptions): Promise<SessionData | null> {
  return fetchSession(Boolean(options?.disableCookieCache));
}

const fetchSession = cache(async (disableCookieCache: boolean): Promise<SessionData | null> => {
  const reqHeaders = await headers();
  const cookie = reqHeaders.get('cookie');
  if (!cookie) return null;

  try {
    const url = new URL('/api/auth/get-session', env.NEXT_PUBLIC_API_URL);
    if (disableCookieCache) {
      url.searchParams.set('disableCookieCache', 'true');
    }

    const res = await fetch(url.toString(), {
      headers: { cookie },
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.session || !data?.user) return null;
    return data as SessionData;
  } catch {
    return null;
  }
});

/**
 * Throwing variant — redirects on failure.
 * Used in protected/designer/admin layouts.
 */
export async function requireAuth(options?: {
  requiredRole?: RequiredPlatformRole;
}): Promise<SessionData> {
  const session = await getServerSession({
    disableCookieCache: Boolean(options?.requiredRole),
  });

  if (!session) {
    redirect('/login');
  }

  if (options?.requiredRole) {
    if (!rolePassesCheck(session.user.role, options.requiredRole)) {
      redirect('/unauthorized');
    }
  }

  return session;
}
