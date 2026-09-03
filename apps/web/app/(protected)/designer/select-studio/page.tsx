import { redirect } from 'next/navigation';
import { PLATFORM_ROLE } from '@repo/contracts';
import { DesignerOrganizationSwitcher } from '@/components/designer-organization-switcher';
import { getServerSession, rolePassesCheck } from '@/lib/auth-guard';
import { Card } from '@repo/ui/components/card';
import { ADMIN_DASHBOARD_PATH } from '@/lib/auth-paths';

export const metadata = {
  title: 'Choose your studio · Tickif',
};

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

  const accountName = session?.user.name?.trim() || 'Your account';

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card radius="2xl" className="w-full max-w-md p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Choose your studio
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Select the studio you want to manage. You can switch studios later from the sidebar.
        </p>
        <div className="mt-6 rounded-xl border border-border bg-background p-2">
          <DesignerOrganizationSwitcher
            activeOrganizationId={null}
            studioName={accountName}
            studioLocation="Choose a studio to continue"
          />
        </div>
      </Card>
    </main>
  );
}
