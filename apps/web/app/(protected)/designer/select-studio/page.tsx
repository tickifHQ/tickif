import { redirect } from 'next/navigation';
import { PLATFORM_ROLE } from '@repo/contracts';
import { getServerSession, rolePassesCheck } from '@/lib/auth-guard';
import { ADMIN_DASHBOARD_PATH } from '@/lib/auth-paths';

export const metadata = {
  title: 'Choose your studio · Tickif',
};

/**
 * Compatibility redirect only (E-249 decision). Login restores the persisted
 * context directly, so this gate no longer picks studios: organisation
 * sessions continue to the dashboard, everyone else lands on My Tickif.
 */
export default async function DesignerSelectStudioPage() {
  const session = await getServerSession({ disableCookieCache: true });
  const userRole = session?.user.role ?? null;

  if (rolePassesCheck(userRole, PLATFORM_ROLE.ADMIN)) {
    redirect(ADMIN_DASHBOARD_PATH);
  }

  if (!rolePassesCheck(userRole, PLATFORM_ROLE.DESIGNER)) {
    redirect('/designer/onboarding');
  }

  if (session?.session.activeOrganizationId) {
    redirect('/designer/dashboard');
  }

  redirect('/home');
}
