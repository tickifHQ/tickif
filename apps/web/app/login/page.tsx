import type { ReactNode } from 'react';
import { LoginCard } from '@/components/login-card';

type LoginPageProps = {
  searchParams: Promise<{
    mode?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps): Promise<ReactNode> {
  const params = await searchParams;
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const initialMode = mode === 'designer' ? 'designer' : 'browsing';

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <LoginCard initialMode={initialMode} />
    </main>
  );
}
