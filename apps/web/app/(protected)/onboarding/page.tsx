import { redirect } from 'next/navigation';
import {
  ACCOUNT_STATUS,
  PLATFORM_ROLE,
  accountStatusSchema,
  platformRoleSchema,
} from '@repo/contracts';
import { requireAuth } from '@/lib/auth-guard';
import { VisitorFeedOnboardingPage } from '@/components/visitor-feed-onboarding-page';

export const metadata = {
  title: 'Onboarding · Tickif',
};

export default async function VisitorOnboardingPage() {
  const session = await requireAuth();

  const role = platformRoleSchema.safeParse(session.user.role);
  if (!role.success) redirect('/unauthorized');
  if (role.data === PLATFORM_ROLE.DESIGNER) redirect('/designer/dashboard');
  if (role.data === PLATFORM_ROLE.ADMIN || role.data === PLATFORM_ROLE.SUPERADMIN) {
    redirect('/dashboard');
  }
  const status = accountStatusSchema.safeParse(session.user.status);
  if (!status.success) redirect('/unauthorized');
  if (status.data === ACCOUNT_STATUS.ACTIVE) redirect('/home');
  if (status.data !== ACCOUNT_STATUS.PENDING) redirect('/unauthorized');

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4 py-8">
      <VisitorFeedOnboardingPage />
    </main>
  );
}
