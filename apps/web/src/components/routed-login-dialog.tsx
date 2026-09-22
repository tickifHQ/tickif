'use client';

import { useRouter } from 'next/navigation';
import { ActionLoginDialog } from '@/components/action-login-dialog';

export function RoutedLoginDialog({
  loginHref,
  initialMode,
}: {
  loginHref: string;
  initialMode: 'browsing' | 'designer';
}) {
  const router = useRouter();

  return (
    <ActionLoginDialog
      open
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
      loginHref={loginHref}
      initialMode={initialMode}
    />
  );
}
