import type { ReactNode } from 'react';
import { PhoneLoginCard } from '@/components/phone-login-card';
import { GoogleLoginButton } from '@/components/google-login-button';

export default function LoginPage(): ReactNode {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Tickif</h1>
          <p className="mt-1 text-sm text-neutral-500">Sign in to continue</p>
        </div>

        <PhoneLoginCard />

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-neutral-400">or</span>
          </div>
        </div>

        <GoogleLoginButton />
      </div>
    </main>
  );
}
