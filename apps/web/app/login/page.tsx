import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { LoginCard } from '@/components/login-card';
import { getServerSession, rolePassesCheck } from '@/lib/auth-guard';
import { ADMIN_MODERATION_PATH } from '@/lib/auth-paths';

type LoginPageProps = {
  searchParams: Promise<{
    mode?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps): Promise<ReactNode> {
  const [params, session] = await Promise.all([
    searchParams,
    getServerSession({ disableCookieCache: true }),
  ]);
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const initialMode = mode === 'designer' ? 'designer' : 'browsing';

  if (rolePassesCheck(session?.user.role ?? null, 'admin')) {
    redirect(ADMIN_MODERATION_PATH);
  }

  if (session) {
    redirect(initialMode === 'designer' ? '/designer/onboarding' : '/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <LoginCard initialMode={initialMode} />
    </main>
  );
}
