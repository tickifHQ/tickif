import type { ReactNode } from 'react';
import { getServerSession } from '@/lib/auth-guard';
import { ScrollGate } from '@/components/scroll-gate';

/**
 * Public route group layout.
 *
 * SSR content is always rendered (crawlable by bots).
 * The scroll-gate is rendered as a client-side sibling — NOT wrapping children —
 * so the SSR output is never withheld from the response body.
 *
 * If the user is authenticated, the scroll-gate is omitted entirely.
 */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  const isAuthenticated = !!session;

  return (
    <>
      {children}
      {!isAuthenticated && <ScrollGate />}
    </>
  );
}
