import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { PLATFORM_ROLE } from '@repo/contracts';
import { LoginCard } from '@/components/login-card';
import { activeContextForSession, getServerSession, rolePassesCheck } from '@/lib/auth-guard';
import { ADMIN_DASHBOARD_PATH } from '@/lib/auth-paths';

type LoginPageProps = {
  searchParams: Promise<{
    callbackURL?: string | string[];
    mode?: string | string[];
    next?: string | string[];
  }>;
};

export function safeCallbackPath(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate?.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return undefined;
  }
  return candidate;
}

export default async function LoginPage({ searchParams }: LoginPageProps): Promise<ReactNode> {
  const [params, session] = await Promise.all([
    searchParams,
    getServerSession({ disableCookieCache: true }),
  ]);
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const initialMode = mode === 'designer' ? 'designer' : 'browsing';
  const callbackPath = safeCallbackPath(params.callbackURL) ?? safeCallbackPath(params.next);

  if (session && callbackPath) {
    redirect(callbackPath);
  }

  if (rolePassesCheck(session?.user.role ?? null, PLATFORM_ROLE.ADMIN)) {
    redirect(ADMIN_DASHBOARD_PATH);
  }

  if (session) {
    // Restored-context routing: personal and zero-org users land on their
    // personal home. Profiles still onboarding keep the onboarding flow, which
    // is detected through the pending account status on the session user.
    const context = activeContextForSession(session);
    const accountStatus =
      typeof session.user === 'object' &&
      session.user !== null &&
      'status' in session.user &&
      typeof (session.user as { status?: unknown }).status === 'string'
        ? ((session.user as { status?: string }).status ?? null)
        : null;
    if (accountStatus !== 'pending') {
      redirect(context.kind === 'organization' ? '/designer/dashboard' : '/home');
    }
    redirect(initialMode === 'designer' ? '/designer/onboarding' : '/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <LoginCard initialMode={initialMode} callbackPath={callbackPath} />
    </main>
  );
}
