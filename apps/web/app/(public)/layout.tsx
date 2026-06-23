import type { ReactNode } from 'react';
import { PublicHeader } from '@/components/public-header';
import { PublicFooter } from '@/components/public-footer';
import { getServerSession } from '@/lib/auth-guard';
import { ScrollGate } from '@/components/scroll-gate';

/**
 * Public-facing chrome: discovery nav + footer wrapped around the content.
 *
 * SSR content is always rendered (crawlable by bots). The scroll-gate is a
 * client-side sibling — NOT wrapping children — so SSR output is never withheld.
 * Omitted entirely for authenticated users.
 */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  const isAuthenticated = !!session;

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader isAuthenticated={isAuthenticated} />
      <main className="flex-1">{children}</main>
      <PublicFooter />
      {!isAuthenticated && <ScrollGate />}
    </div>
  );
}
