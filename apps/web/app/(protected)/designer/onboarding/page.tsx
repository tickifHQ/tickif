import { redirect } from 'next/navigation';
import { DesignerOnboarding } from '@/components/designer-onboarding';
import { getServerSession, rolePassesCheck } from '@/lib/auth-guard';

export const metadata = {
  title: 'Designer onboarding · Tickif',
};

export default async function DesignerOnboardingPage() {
  const session = await getServerSession({ disableCookieCache: true });

  if (rolePassesCheck(session?.user.role ?? null, 'designer')) {
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
