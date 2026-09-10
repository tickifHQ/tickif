import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PLATFORM_ROLE } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/card';
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
      <Card className="flex w-full max-w-lg flex-col gap-6 p-6 sm:p-8">
        <CardHeader className="gap-3 p-0">
          <CardTitle>
            <h1 className="text-xl">Finish setting up your designer workspace</h1>
          </CardTitle>
          <CardDescription>
            Your account is ready to explore Tickif. Complete your designer details to create your
            workspace and start adding projects.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex-col items-stretch gap-3 p-0 sm:flex-row">
          <Button asChild>
            <Link href="/designer/onboarding">Continue setup</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/home">Explore projects</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
