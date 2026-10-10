'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { PublicHeader } from '@/components/public-header';
import { PublicFooter } from '@/components/public-footer';

/** Apply the landing design only to /; other public routes retain their chrome. */
export function PublicShell({
  children,
  isAuthenticated,
  userRole,
}: {
  children: ReactNode;
  isAuthenticated: boolean;
  userRole: string | null;
}) {
  const landing = usePathname() === '/';
  return (
    <div
      data-landing={landing || undefined}
      data-auth-scroll-gutter={!isAuthenticated || undefined}
      className="flex min-h-screen flex-col bg-background"
    >
      <PublicHeader isAuthenticated={isAuthenticated} userRole={userRole} landing={landing} />
      <main className="flex-1">{children}</main>
      <PublicFooter landing={landing} />
    </div>
  );
}
