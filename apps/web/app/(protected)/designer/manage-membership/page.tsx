import { redirect } from 'next/navigation';
import { PLATFORM_ROLE } from '@repo/contracts';
import { DesignerMembershipExit } from '@/components/designer-membership-exit';
import { requireAuth } from '@/lib/auth-guard';

export const metadata = {
  title: 'Manage studio membership · Tickif',
};

export default async function DesignerManageMembershipPage() {
  const session = await requireAuth({ requiredRole: PLATFORM_ROLE.DESIGNER });
  const organizationId = session.session.activeOrganizationId;

  if (!organizationId) {
    redirect('/designer/select-studio');
  }

  return <DesignerMembershipExit organizationId={organizationId} />;
}
