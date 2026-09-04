import { headers } from 'next/headers';
import {
  organizationBranchesResponseSchema,
  organizationWorkspaceResponseSchema,
} from '@repo/contracts';
import { DesignerBranches } from '@/components/designer-branches';
import { api } from '@/lib/api';
import { requireAuth } from '@/lib/auth-guard';

export const metadata = {
  title: 'Branches · Tickif',
};

async function getBranchesData() {
  const reqHeaders = await headers();
  const cookie = reqHeaders.get('cookie');
  if (!cookie) {
    return { branches: null, workspace: null, error: 'Could not load your branches.' };
  }

  try {
    const [branchesResponse, workspaceResponse] = await Promise.all([
      api.api.orgs.branches.$get({}, { headers: { cookie } }),
      api.api.orgs.current.$get({}, { headers: { cookie } }),
    ]);
    if (!branchesResponse.ok || !workspaceResponse.ok) {
      return { branches: null, workspace: null, error: 'Could not load your branches.' };
    }

    const branches = organizationBranchesResponseSchema.safeParse(await branchesResponse.json());
    const workspace = organizationWorkspaceResponseSchema.safeParse(await workspaceResponse.json());
    if (!branches.success || !workspace.success) {
      return { branches: null, workspace: null, error: 'Could not load your branches.' };
    }

    return { branches: branches.data, workspace: workspace.data, error: undefined };
  } catch {
    return { branches: null, workspace: null, error: 'Could not load your branches.' };
  }
}

export default async function DesignerBranchesPage() {
  await requireAuth({ requiredRole: 'designer' });
  const data = await getBranchesData();
  return (
    <DesignerBranches branches={data.branches} workspace={data.workspace} error={data.error} />
  );
}
