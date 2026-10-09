import { redirect } from 'next/navigation';
import {
  ACCOUNT_STATUS,
  PLATFORM_ROLE,
  accountStatusSchema,
  platformRoleSchema,
} from '@repo/contracts';
import { requireAuth } from '@/lib/auth-guard';
import { safeCallbackPath } from '@/lib/auth-paths';
import { getVisitorFeedPreferences } from '@/lib/visitor-feed.server';
import { VisitorOnboardingForm } from '@/components/visitor-onboarding-form';

export const metadata = {
  title: 'Onboarding · Tickif',
};

export default async function VisitorOnboardingPage({
  searchParams = Promise.resolve({}),
}: { searchParams?: Promise<{ callbackURL?: string | string[] }> } = {}) {
  const session = await requireAuth();

  const role = platformRoleSchema.safeParse(session.user.role);
  if (!role.success) redirect('/unauthorized');
  if (role.data === PLATFORM_ROLE.DESIGNER) redirect('/designer/dashboard');
  if (role.data === PLATFORM_ROLE.ADMIN || role.data === PLATFORM_ROLE.SUPERADMIN) {
    redirect('/dashboard');
  }
  const status = accountStatusSchema.safeParse(session.user.status);
  if (!status.success) redirect('/unauthorized');
  if (status.data !== ACCOUNT_STATUS.ACTIVE && status.data !== ACCOUNT_STATUS.PENDING)
    redirect('/unauthorized');

  if (session.session.activeOrganizationId) redirect('/unauthorized');
  const [params, saved] = await Promise.all([searchParams, getVisitorFeedPreferences()]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <VisitorOnboardingForm
        initialPreferences={saved.preferences}
        callbackPath={safeCallbackPath(params.callbackURL)}
      />
    </main>
  );
}
