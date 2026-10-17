import 'server-only';
import { headers } from 'next/headers';
import {
  organizationBranchesPageResponseSchema,
  organizationBranchSchema,
  organizationWorkspaceResponseSchema,
} from '@repo/contracts';
import { api } from '@/lib/api';

export async function getBranchesData(branchId?: string) {
  const reqHeaders = await headers();
  const cookie = reqHeaders.get('cookie');
  if (!cookie) {
    return { branches: null, workspace: null, error: 'Could not load your branches.' };
  }

  try {
    const [branchesResponse, workspaceResponse, detailResponse] = await Promise.all([
      api.api.orgs.branches.list.$get(
        { query: { page: '1', limit: '12', q: '' } },
        { headers: { cookie }, init: { cache: 'no-store' } },
      ),
      api.api.orgs.summary.$get({}, { headers: { cookie }, init: { cache: 'no-store' } }),
      branchId
        ? api.api.orgs.branches[':branchId'].$get(
            { param: { branchId } },
            { headers: { cookie }, init: { cache: 'no-store' } },
          )
        : null,
    ]);
    if (detailResponse?.status === 404) return { branches: null, workspace: null, notFound: true };
    if (!branchesResponse.ok || !workspaceResponse.ok) {
      return { branches: null, workspace: null, error: 'Could not load your branches.' };
    }

    const branches = organizationBranchesPageResponseSchema.safeParse(
      await branchesResponse.json(),
    );
    const workspace = organizationWorkspaceResponseSchema.safeParse(await workspaceResponse.json());
    const detail = detailResponse
      ? organizationBranchSchema.safeParse(await detailResponse.json())
      : null;
    if (!branches.success || !workspace.success || (detail && !detail.success)) {
      return { branches: null, workspace: null, error: 'Could not load your branches.' };
    }

    return {
      branches: {
        activeTeamId: branches.data.activeTeamId,
        branchUsage: branches.data.branchUsage,
        branchLimit: branches.data.branchLimit,
        branches: detail?.success ? [detail.data] : branches.data.items,
      },
      branchesPage: branches.data,
      workspace: workspace.data,
      error: undefined,
    };
  } catch {
    return { branches: null, workspace: null, error: 'Could not load your branches.' };
  }
}
