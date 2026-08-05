import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { PLATFORM_ROLE } from '@repo/contracts';
import { LoginCard } from '@/components/login-card';
import { getServerSession, rolePassesCheck } from '@/lib/auth-guard';
import { ADMIN_MODERATION_PATH } from '@/lib/auth-paths';

type LoginPageProps = {
  searchParams: Promise<{
    callbackURL?: string | string[];
    mode?: string | string[];
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
  const callbackPath = safeCallbackPath(params.callbackURL);

  if (rolePassesCheck(session?.user.role ?? null, PLATFORM_ROLE.ADMIN)) {
    redirect(ADMIN_MODERATION_PATH);
  }

  if (session) {
    redirect(initialMode === 'designer' ? '/designer/onboarding' : '/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <LoginCard initialMode={initialMode} callbackPath={callbackPath} />
    </main>
  );
}
