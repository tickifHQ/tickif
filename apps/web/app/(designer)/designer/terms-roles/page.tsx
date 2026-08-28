import { headers } from 'next/headers';
import { organizationWorkspaceResponseSchema } from '@repo/contracts';
import { DesignerTermsRoles } from '@/components/designer-terms-roles';
import { api } from '@/lib/api';
import { requireAuth } from '@/lib/auth-guard';

export const metadata = {
  title: 'Team & Roles · Tickif',
};

async function getOrganizationWorkspace() {
  const reqHeaders = await headers();
  const cookie = reqHeaders.get('cookie');
  if (!cookie) {
    return { data: null, error: 'Could not load your studio team.' };
  }

  try {
    const response = await api.api.orgs.current.$get({}, { headers: { cookie } });
    if (!response.ok) {
      return { data: null, error: 'Could not load your studio team.' };
    }

    const parsed = organizationWorkspaceResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { data: null, error: 'Could not load your studio team.' };
    }

    return { data: parsed.data };
  } catch {
    return { data: null, error: 'Could not load your studio team.' };
  }
}

export default async function DesignerTermsRolesPage() {
  await requireAuth({ requiredRole: 'designer' });
  const workspace = await getOrganizationWorkspace();
  return <DesignerTermsRoles workspace={workspace.data} error={workspace.error} />;
}
