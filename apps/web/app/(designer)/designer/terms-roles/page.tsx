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
    const response = await api.api.orgs.summary.$get(
      {},
      { headers: { cookie }, init: { cache: 'no-store' } },
    );
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
  return (
    <DesignerTermsRoles
      key={workspace.data?.organization.id}
      workspace={workspace.data}
      error={workspace.error}
      serverLists
    />
  );
}
