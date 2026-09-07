import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PLATFORM_ROLE } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import { requireAuth, rolePassesCheck } from '@/lib/auth-guard';
import { ADMIN_DASHBOARD_PATH } from '@/lib/auth-paths';

export const metadata = {
  title: 'Finish setup later · Tickif',
};

export default async function DeferredDesignerOnboardingPage() {
  const session = await requireAuth();
  const role = session.user.role;

  if (rolePassesCheck(role, PLATFORM_ROLE.ADMIN)) {
    redirect(ADMIN_DASHBOARD_PATH);
  }
  if (rolePassesCheck(role, PLATFORM_ROLE.DESIGNER)) {
    redirect(
      session.session.activeOrganizationId ? '/designer/dashboard' : '/designer/select-studio',
    );
  }
  if (role !== PLATFORM_ROLE.VISITOR && role !== null) {
    redirect('/unauthorized');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <Card className="w-full max-w-lg space-y-6 p-6 sm:p-8">
        <div className="space-y-3">
          <h1 className="text-xl font-medium text-foreground">
            Finish setting up your designer workspace
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your account is ready to explore Tickif. Complete your designer details to create your
            workspace and start adding projects.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/designer/onboarding">Continue setup</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/home">Explore projects</Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
