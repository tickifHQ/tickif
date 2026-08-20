import { DesignerTermsRoles } from '@/components/designer-terms-roles';
import { requireAuth } from '@/lib/auth-guard';

export const metadata = {
  title: 'Team & Roles · Tickif',
};

export default async function DesignerTermsRolesPage() {
  await requireAuth({ requiredRole: 'designer' });
  return <DesignerTermsRoles />;
}
