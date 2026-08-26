import { cache } from 'react';
import { headers } from 'next/headers';
import { organizationWorkspaceResponseSchema, type OrganizationMemberRole } from '@repo/contracts';
import { api } from '@/lib/api';

/**
 * Current org membership role for the signed-in designer.
 * Cached per request so the designer layout and billing page share one fetch.
 */
export const getCurrentOrgRole = cache(async (): Promise<OrganizationMemberRole | null> => {
  const reqHeaders = await headers();
  const cookie = reqHeaders.get('cookie');
  if (!cookie) return null;

  try {
    const response = await api.api.orgs.current.$get({}, { headers: { cookie } });
    if (!response.ok) return null;
    const parsed = organizationWorkspaceResponseSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    return parsed.data.currentUserRole;
  } catch {
    return null;
  }
});

/** Billing is Owner-only until E-240 introduces billing_admin end-to-end. */
export function hasBillingAccess(role: OrganizationMemberRole | null): boolean {
  return role === 'owner';
}
