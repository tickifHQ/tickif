import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import {
  ACCOUNT_STATUS,
  PLATFORM_ROLE,
  accountStatusSchema,
  platformRoleSchema,
} from '@repo/contracts';
import { LoginCard } from '@/components/login-card';
import { getServerSession, rolePassesCheck } from '@/lib/auth-guard';
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
    const role = platformRoleSchema.safeParse(session.user.role);
    const status = accountStatusSchema.safeParse(session.user.status);
    if (!role.success || !status.success) redirect('/unauthorized');
    if (role.data === PLATFORM_ROLE.DESIGNER) {
      redirect(
        status.data === ACCOUNT_STATUS.PENDING ? '/designer/onboarding' : '/designer/dashboard',
      );
    }
    if (role.data !== PLATFORM_ROLE.VISITOR) redirect('/unauthorized');
    if (status.data === ACCOUNT_STATUS.ACTIVE) redirect('/home');
    if (status.data !== ACCOUNT_STATUS.PENDING) redirect('/unauthorized');
    redirect(initialMode === 'designer' ? '/designer/onboarding' : '/onboarding');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <LoginCard initialMode={initialMode} callbackPath={callbackPath} />
    </main>
  );
}
