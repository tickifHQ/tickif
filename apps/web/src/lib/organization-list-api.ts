import {
  organizationBranchesPageResponseSchema,
  organizationBranchMembersPageResponseSchema,
  organizationMembersPageResponseSchema,
  organizationInvitationsPageResponseSchema,
  type OrganizationListQuery,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { handleApiResponse } from '@/lib/api-response';

function queryStrings(query: OrganizationListQuery) {
  return { page: String(query.page), limit: String(query.limit), q: query.q };
}

export async function loadOrganizationMembersPage(
  query: OrganizationListQuery,
  signal: AbortSignal,
  filters?: { transferEligible?: boolean; availableForBranchId?: string },
) {
  const response = await api.api.orgs.members.$get(
    {
      query: {
        ...queryStrings(query),
        ...(filters?.transferEligible ? { transferEligible: 'true' as const } : {}),
        ...(filters?.availableForBranchId
          ? { availableForBranchId: filters.availableForBranchId }
          : {}),
      },
    },
    { init: { signal, cache: 'no-store' } },
  );
  return handleApiResponse(
    response,
    organizationMembersPageResponseSchema,
    'Could not load studio members.',
  );
}

export async function loadOrganizationInvitationsPage(
  query: OrganizationListQuery,
  signal: AbortSignal,
) {
  const response = await api.api.orgs.invitations.$get(
    { query: queryStrings(query) },
    { init: { signal, cache: 'no-store' } },
  );
  return handleApiResponse(
    response,
    organizationInvitationsPageResponseSchema,
    'Could not load invitations.',
  );
}

export async function loadBranchesPage(
  query: OrganizationListQuery,
  signal: AbortSignal,
  removalTargetFor?: string,
) {
  const response = await api.api.orgs.branches.list.$get(
    { query: { ...queryStrings(query), ...(removalTargetFor ? { removalTargetFor } : {}) } },
    { init: { signal, cache: 'no-store' } },
  );
  return handleApiResponse(
    response,
    organizationBranchesPageResponseSchema,
    'Could not load branches.',
  );
}

export async function loadBranchMembersPage(
  branchId: string,
  query: OrganizationListQuery,
  signal: AbortSignal,
) {
  const response = await api.api.orgs.branches[':branchId'].members.$get(
    { param: { branchId }, query: queryStrings(query) },
    { init: { signal, cache: 'no-store' } },
  );
  return handleApiResponse(
    response,
    organizationBranchMembersPageResponseSchema,
    'Could not load branch members.',
  );
}
