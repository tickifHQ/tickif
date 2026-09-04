import type { OrganizationCapabilities } from '@repo/contracts';
import { organizationCapabilitiesForRole } from '@repo/auth/permissions';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: vi.fn() }));

import { hasBillingAccess } from '../../src/lib/current-org-role';

const capabilities: OrganizationCapabilities = {
  billing: false,
  manageMembers: false,
  changeMemberRoles: false,
  transferOwnership: false,
  writeProjects: true,
  submitProjects: true,
  archiveProjects: true,
  deleteProjects: true,
  leadScope: 'full',
  analyticsScope: 'full',
  editOrganization: true,
  manageVerification: true,
};

describe('hasBillingAccess', () => {
  it('allows a Billing Admin through the live billing capability', () => {
    const activeCapabilities = organizationCapabilitiesForRole('billing_admin', {
      rbacEnabled: true,
      frozen: false,
    });
    expect(hasBillingAccess(activeCapabilities)).toBe(true);
  });

  it('keeps the billing recovery page available to Billing Admin while RBAC is suspended', () => {
    const lockedCapabilities = organizationCapabilitiesForRole('billing_admin', {
      rbacEnabled: false,
      frozen: false,
    });
    expect(hasBillingAccess(lockedCapabilities)).toBe(true);
  });

  it('denies an Admin without the billing capability', () => {
    expect(hasBillingAccess(capabilities)).toBe(false);
  });
});
