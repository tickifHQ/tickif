import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
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
  // A failed/absent draft simply yields null → the wizard starts fresh as before.
  let initialDraft: OnboardingDraftResponse | null = null;
  if (session) {
    const cookie = (await headers()).get('cookie') ?? undefined;
    if (cookie) {
      try {
        initialDraft = await fetchOnboardingDraft(cookie);
      } catch {
        initialDraft = null;
      }
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
