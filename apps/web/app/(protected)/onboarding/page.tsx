import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@repo/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/card';
import { requireAuth, rolePassesCheck } from '@/lib/auth-guard';

export const metadata = {
  title: 'Welcome to Tickif',
};

export default async function VisitorOnboardingPage() {
  const session = await requireAuth();

  if (rolePassesCheck(session.user.role, 'designer')) {
    redirect('/designer/dashboard');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/20 px-4 py-10">
      <Card className="w-full max-w-2xl rounded-3xl border-border/80 shadow-sm">
        <CardHeader className="space-y-3">
          <CardTitle className="font-display text-3xl tracking-tight">Welcome to Tickif</CardTitle>
          <CardDescription className="max-w-xl text-sm leading-6">
            Save the homes you love, message designers directly, and keep your shortlist handy
            when you&apos;re ready to start a project.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/80 bg-background px-4 py-4">
              <h2 className="text-sm font-medium text-foreground">Save inspiration</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Keep your favorite homes and ideas in one place.
              </p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-background px-4 py-4">
              <h2 className="text-sm font-medium text-foreground">Talk to designers</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Reach out when you find someone whose work matches your taste.
              </p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-background px-4 py-4">
              <h2 className="text-sm font-medium text-foreground">Book consults</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Move from browsing to your first conversation when you&apos;re ready.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="emphasis" className="sm:min-w-40">
              <Link href="/">Start exploring</Link>
            </Button>
            <Button asChild variant="outline" className="sm:min-w-40">
              <Link href="/designer/onboarding">I&apos;m a designer instead</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
