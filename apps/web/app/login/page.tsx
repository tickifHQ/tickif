import type { ReactNode } from 'react';
import { LoginCard } from '@/components/login-card';

export default function LoginPage(): ReactNode {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <LoginCard />
    </main>
  );
}
