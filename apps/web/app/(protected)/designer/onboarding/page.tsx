import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import {
  ACCOUNT_STATUS,
  PLATFORM_ROLE,
  accountStatusSchema,
  platformRoleSchema,
  type OnboardingDraftResponse,
} from '@repo/contracts';
import { DesignerOnboarding } from '@/components/designer-onboarding';
import { getServerSession, rolePassesCheck } from '@/lib/auth-guard';
import { ADMIN_DASHBOARD_PATH } from '@/lib/auth-paths';
import { fetchOnboardingDraft } from '@/lib/onboarding-draft-api';

export const metadata = {
  title: 'Designer onboarding · Tickif',
};

export default async function DesignerOnboardingPage() {
  const session = await getServerSession({ disableCookieCache: true });
  const userRole = session?.user.role ?? null;

  if (rolePassesCheck(userRole, PLATFORM_ROLE.ADMIN)) {
    redirect(ADMIN_DASHBOARD_PATH);
  }

  if (rolePassesCheck(userRole, PLATFORM_ROLE.DESIGNER)) {
    redirect(
      session?.session.activeOrganizationId ? '/designer/dashboard' : '/designer/select-studio',
    );
  }

  if (session) {
    const role = platformRoleSchema.safeParse(userRole);
    const status = accountStatusSchema.safeParse(session.user.status);
    if (!role.success || !status.success) redirect('/unauthorized');
    if (role.data !== PLATFORM_ROLE.VISITOR) redirect('/unauthorized');
    if (status.data === ACCOUNT_STATUS.ACTIVE) redirect('/home/list-your-work');
    if (status.data !== ACCOUNT_STATUS.PENDING) redirect('/unauthorized');
  }

  // E-298: resume account-level onboarding progress. Fetched server-side so the
  // wizard's first paint already shows the saved step/fields (no flash of step 1).
  // Only a successful read can establish that it is safe to start a fresh draft.
  let initialDraft: OnboardingDraftResponse | null = null;
  if (session) {
    const cookie = (await headers()).get('cookie') ?? undefined;
    try {
      if (!cookie) throw new Error('Missing session cookie');
      initialDraft = await fetchOnboardingDraft(cookie);
    } catch {
      return (
        <div className="mx-auto max-w-lg px-6 py-12">
          <Alert variant="destructive">
            <AlertTitle>Could not load your saved progress</AlertTitle>
            <AlertDescription>
              <p>Please try again to continue your setup.</p>
              <a href="/designer/onboarding" className="underline underline-offset-4">
                Try again
              </a>
            </AlertDescription>
          </Alert>
        </div>
      );
    }
  }

  return (
    <DesignerOnboarding
      signedInAs={session?.user.email ?? null}
      signedInName={session?.user.name ?? null}
      initialDraft={initialDraft}
    />
  );
}
