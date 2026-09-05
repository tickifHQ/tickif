import { redirect } from 'next/navigation';
import { PLATFORM_ROLE } from '@repo/contracts';
import { NewOrganizationForm } from '@/components/new-organization-form';
import { getServerSession, rolePassesCheck } from '@/lib/auth-guard';
import { ADMIN_DASHBOARD_PATH } from '@/lib/auth-paths';

export const metadata = {
  title: 'New organisation · Tickif',
};

export default async function NewOrganizationPage() {
  const session = await getServerSession({ disableCookieCache: true });
  const userRole = session?.user.role ?? null;

  if (rolePassesCheck(userRole, PLATFORM_ROLE.ADMIN)) {
    redirect(ADMIN_DASHBOARD_PATH);
  }

  if (!rolePassesCheck(userRole, PLATFORM_ROLE.DESIGNER)) {
    redirect('/designer/onboarding');
  }

  return (
    <NewOrganizationForm
      signedInAs={session?.user.email ?? null}
      signedInName={session?.user.name ?? null}
    />
  );
}
