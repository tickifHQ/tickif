import { redirect } from 'next/navigation';
import {
  ACCOUNT_STATUS,
  PLATFORM_ROLE,
  accountStatusSchema,
  platformRoleSchema,
} from '@repo/contracts';
import { DesignerOnboarding } from '@/components/designer-onboarding';
import { getServerSession, rolePassesCheck } from '@/lib/auth-guard';
import { ADMIN_DASHBOARD_PATH } from '@/lib/auth-paths';

export const metadata = {
  title: 'Designer onboarding · Tickif',
};

export default async function DesignerOnboardingPage() {
  const session = await getServerSession({ disableCookieCache: true });
  const userRole = session?.user.role ?? null;

  if (rolePassesCheck(userRole, PLATFORM_ROLE.ADMIN)) {
    redirect(ADMIN_DASHBOARD_PATH);
  }

  if (rolePassesCheck(userRole, PLATFORM_ROLE.DESIGNER)) {
    redirect(
      session?.session.activeOrganizationId ? '/designer/dashboard' : '/designer/select-studio',
    );
  }

  if (session) {
    const role = platformRoleSchema.safeParse(userRole);
    const status = accountStatusSchema.safeParse(session.user.status);
    if (!role.success || !status.success) redirect('/unauthorized');
    if (role.data !== PLATFORM_ROLE.VISITOR) redirect('/unauthorized');
    if (status.data === ACCOUNT_STATUS.ACTIVE) redirect('/home/list-your-work');
    if (status.data !== ACCOUNT_STATUS.PENDING) redirect('/unauthorized');
  }

  return (
    <DesignerOnboarding
      signedInAs={session?.user.email ?? null}
      signedInName={session?.user.name ?? null}
    />
  );
}
