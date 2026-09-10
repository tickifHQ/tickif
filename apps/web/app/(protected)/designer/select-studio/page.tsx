import { redirect } from 'next/navigation';
import { PLATFORM_ROLE } from '@repo/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/card';
import { DesignerOrganizationSwitcher } from '@/components/designer-organization-switcher';
import { getServerSession, rolePassesCheck } from '@/lib/auth-guard';
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

  const displayName = session?.user.name?.trim() || session?.user.email?.trim() || 'Your account';

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <Card className="w-full max-w-md gap-6 p-6 sm:p-8">
        <CardHeader className="gap-2 p-0">
          <CardTitle>
            <h1 className="text-xl">Choose your studio</h1>
          </CardTitle>
          <CardDescription>
            Select the studio workspace you want to open, or create a new organisation.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <DesignerOrganizationSwitcher
            activeOrganizationId={null}
            studioName={displayName}
            studioLocation="Choose a studio"
          />
        </CardContent>
      </Card>
    </main>
  );
}
