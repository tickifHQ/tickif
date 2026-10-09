import type { ReactNode } from 'react';
import { PublicShell } from '@/components/public-shell';
import { getServerSession } from '@/lib/auth-guard';
import { ScrollGate } from '@/components/scroll-gate';
import { LandingProjectPreviewProvider } from '@/components/landing-project-preview';

/**
 * Public-facing chrome: discovery nav + footer wrapped around the content.
 *
 * SSR content is always rendered (crawlable by bots). The scroll-gate is a
 * client-side sibling — NOT wrapping children — so SSR output is never withheld.
 * Omitted entirely for authenticated users.
 */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession({ disableCookieCache: true });
  const isAuthenticated = !!session;

  return (
    <LandingProjectPreviewProvider>
      <PublicShell isAuthenticated={isAuthenticated} userRole={session?.user.role ?? null}>
        {children}
      </PublicShell>
      {!isAuthenticated && <ScrollGate />}
    </LandingProjectPreviewProvider>
  );
}
