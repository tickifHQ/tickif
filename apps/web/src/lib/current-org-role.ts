import { cache } from 'react';
import { headers } from 'next/headers';
import {
  organizationWorkspaceResponseSchema,
  type OrganizationCapabilities,
  type OrganizationMemberRole,
  type OrganizationWorkspaceResponse,
} from '@repo/contracts';
import { api } from '@/lib/api';

const getCurrentOrgWorkspace = cache(async (): Promise<OrganizationWorkspaceResponse | null> => {
  const reqHeaders = await headers();
  const cookie = reqHeaders.get('cookie');
  if (!cookie) return null;

  try {
    const response = await api.api.orgs.current.$get({}, { headers: { cookie } });
    if (!response.ok) return null;
    const parsed = organizationWorkspaceResponseSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
});

/** Current org membership role, cached with the workspace request. */
export async function getCurrentOrgRole(): Promise<OrganizationMemberRole | null> {
  return (await getCurrentOrgWorkspace())?.currentUserRole ?? null;
}

/** Current org capabilities, cached with the workspace request. */
export async function getCurrentOrgCapabilities(): Promise<OrganizationCapabilities | null> {
  return (await getCurrentOrgWorkspace())?.capabilities ?? null;
}

/** Billing is Owner-only until E-240 introduces billing_admin end-to-end. */
export function hasBillingAccess(role: OrganizationMemberRole | null): boolean {
  return role === 'owner';
}
