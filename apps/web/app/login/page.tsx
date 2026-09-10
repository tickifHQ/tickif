import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ACCOUNT_STATUS, accountStatusSchema, PLATFORM_ROLE } from '@repo/contracts';
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
    const accountStatus = accountStatusSchema.safeParse(session.user.status);
    if (!accountStatus.success) {
      redirect('/unauthorized');
    }
    if (accountStatus.data === ACCOUNT_STATUS.ACTIVE) {
      if (session.user.role === PLATFORM_ROLE.DESIGNER) {
        redirect(session.session.activeOrganizationId ? '/designer/dashboard' : '/home');
      }
      if (session.user.role === PLATFORM_ROLE.VISITOR) {
        redirect('/home');
      }
      redirect('/unauthorized');
    }
    if (accountStatus.data === ACCOUNT_STATUS.PENDING) {
      // Fresh Designer-tab signups still carry the visitor role until designer
      // onboarding creates their studio, so explicit designer-mode intent must
      // survive routing or they land in visitor onboarding with no studio.
      redirect(
        session.user.role === PLATFORM_ROLE.DESIGNER || initialMode === 'designer'
          ? '/designer/onboarding'
          : '/onboarding',
      );
    }
    redirect('/unauthorized');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <LoginCard initialMode={initialMode} callbackPath={callbackPath} />
    </main>
  );
}
