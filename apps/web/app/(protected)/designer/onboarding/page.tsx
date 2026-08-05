import { redirect } from 'next/navigation';
import { DesignerOnboarding } from '@/components/designer-onboarding';
import { getServerSession, rolePassesCheck } from '@/lib/auth-guard';
import { ADMIN_MODERATION_PATH } from '@/lib/auth-paths';

export const metadata = {
  title: 'Designer onboarding · Tickif',
};

export default async function DesignerOnboardingPage() {
  const session = await getServerSession({ disableCookieCache: true });
  const userRole = session?.user.role ?? null;

  if (rolePassesCheck(userRole, 'admin')) {
    redirect(ADMIN_MODERATION_PATH);
  }

  if (rolePassesCheck(userRole, 'designer')) {
    redirect(
      session?.session.activeOrganizationId ? '/designer/dashboard' : '/designer/select-studio',
    );
  }

  return (
    <DesignerOnboarding
      signedInAs={session?.user.email ?? null}
      signedInName={session?.user.name ?? null}
    />
  );
}
