import type { ReactNode } from 'react';
import { LoginCard } from '@/components/login-card';

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
  const params = await searchParams;
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const initialMode = mode === 'designer' ? 'designer' : 'browsing';
  const callbackPath = safeCallbackPath(params.callbackURL);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <LoginCard initialMode={initialMode} callbackPath={callbackPath} />
    </main>
  );
}
