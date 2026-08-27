import { describe, expect, it } from 'vitest';
import {
  ORGANIZATION_CAPABILITY,
  ORGANIZATION_CAPABILITY_VALUES,
  ORGANIZATION_MEMBER_ROLE,
  ORGANIZATION_MEMBER_ROLE_VALUES,
  type OrganizationCapability,
  type OrganizationMemberRole,
} from '@repo/contracts';
import { organizationCapabilitiesForRole, orgRoles } from '@repo/auth/permissions';

const EXPECTED_MATRIX: Record<OrganizationMemberRole, Record<OrganizationCapability, boolean>> = {
  owner: Object.fromEntries(
    ORGANIZATION_CAPABILITY_VALUES.map((capability) => [capability, true]),
  ) as Record<OrganizationCapability, boolean>,
  admin: {
    billing: false,
    manage_members: true,
    change_member_roles: true,
    transfer_ownership: false,
    write_projects: true,
    submit_projects: true,
    archive_projects: true,
    delete_projects: true,
    read_leads: true,
    read_analytics: true,
    edit_organization: true,
    manage_verification: true,
  },
  billing_admin: {
    billing: true,
    manage_members: false,
    change_member_roles: false,
    transfer_ownership: false,
    write_projects: false,
    submit_projects: false,
    archive_projects: false,
    delete_projects: false,
    read_leads: false,
    read_analytics: true,
    edit_organization: false,
    manage_verification: false,
  },
  member: {
    billing: false,
    manage_members: false,
    change_member_roles: false,
    transfer_ownership: false,
    write_projects: true,
    submit_projects: true,
    archive_projects: true,
    delete_projects: false,
    read_leads: true,
    read_analytics: true,
    edit_organization: false,
    manage_verification: false,
  },
  viewer: {
    billing: false,
    manage_members: false,
    change_member_roles: false,
    transfer_ownership: false,
    write_projects: false,
    submit_projects: false,
    archive_projects: false,
    delete_projects: false,
    read_leads: false,
    read_analytics: true,
    edit_organization: false,
    manage_verification: false,
  },
};

function permissionFor(role: OrganizationMemberRole, capability: OrganizationCapability) {
  switch (capability) {
    case ORGANIZATION_CAPABILITY.BILLING:
      return { billing: ['manage'] } as const;
    case ORGANIZATION_CAPABILITY.MANAGE_MEMBERS:
      return { member: ['create'] } as const;
    case ORGANIZATION_CAPABILITY.CHANGE_MEMBER_ROLES:
      return { member: ['update'] } as const;
    case ORGANIZATION_CAPABILITY.TRANSFER_OWNERSHIP:
      return { ownership: ['transfer'] } as const;
    case ORGANIZATION_CAPABILITY.WRITE_PROJECTS:
      return { project: ['create', 'edit'] } as const;
    case ORGANIZATION_CAPABILITY.SUBMIT_PROJECTS:
      return { project: ['submit'] } as const;
    case ORGANIZATION_CAPABILITY.ARCHIVE_PROJECTS:
      return { project: ['archive'] } as const;
    case ORGANIZATION_CAPABILITY.DELETE_PROJECTS:
      return { project: ['delete'] } as const;
    case ORGANIZATION_CAPABILITY.READ_LEADS:
      return {
        lead: [role === ORGANIZATION_MEMBER_ROLE.MEMBER ? 'read-assigned' : 'read-all'],
      } as const;
    case ORGANIZATION_CAPABILITY.READ_ANALYTICS:
      return {
        analytics: [
          role === ORGANIZATION_MEMBER_ROLE.BILLING_ADMIN
            ? 'read-billing'
            : role === ORGANIZATION_MEMBER_ROLE.MEMBER
              ? 'read-own'
              : role === ORGANIZATION_MEMBER_ROLE.VIEWER
                ? 'read-org'
                : 'read-full',
        ],
      } as const;
    case ORGANIZATION_CAPABILITY.EDIT_ORGANIZATION:
      return { organization: ['update'] } as const;
    case ORGANIZATION_CAPABILITY.MANAGE_VERIFICATION:
      return { verification: ['manage'] } as const;
  }
}

function capabilityIsEnabled(
  capabilities: ReturnType<typeof organizationCapabilitiesForRole>,
  capability: OrganizationCapability,
): boolean {
  switch (capability) {
    case ORGANIZATION_CAPABILITY.BILLING:
      return capabilities.billing;
    case ORGANIZATION_CAPABILITY.MANAGE_MEMBERS:
      return capabilities.manageMembers;
    case ORGANIZATION_CAPABILITY.CHANGE_MEMBER_ROLES:
      return capabilities.changeMemberRoles;
    case ORGANIZATION_CAPABILITY.TRANSFER_OWNERSHIP:
      return capabilities.transferOwnership;
    case ORGANIZATION_CAPABILITY.WRITE_PROJECTS:
      return capabilities.writeProjects;
    case ORGANIZATION_CAPABILITY.SUBMIT_PROJECTS:
      return capabilities.submitProjects;
    case ORGANIZATION_CAPABILITY.ARCHIVE_PROJECTS:
      return capabilities.archiveProjects;
    case ORGANIZATION_CAPABILITY.DELETE_PROJECTS:
      return capabilities.deleteProjects;
    case ORGANIZATION_CAPABILITY.READ_LEADS:
      return capabilities.leadScope !== 'none';
    case ORGANIZATION_CAPABILITY.READ_ANALYTICS:
      return capabilities.analyticsScope !== 'none';
    case ORGANIZATION_CAPABILITY.EDIT_ORGANIZATION:
      return capabilities.editOrganization;
    case ORGANIZATION_CAPABILITY.MANAGE_VERIFICATION:
      return capabilities.manageVerification;
  }
}

describe('organization role matrix', () => {
  it.each(
    ORGANIZATION_MEMBER_ROLE_VALUES.flatMap((role) =>
      ORGANIZATION_CAPABILITY_VALUES.map((capability) => ({ role, capability })),
    ),
  )('$role $capability matches the 5 x 12 policy matrix', ({ role, capability }) => {
    const expected = EXPECTED_MATRIX[role][capability];
    const authorized = orgRoles[role].authorize(permissionFor(role, capability)).success;
    const capabilities = organizationCapabilitiesForRole(role, {
      rbacEnabled: true,
      frozen: false,
    });

    expect(authorized).toBe(expected);
    expect(capabilityIsEnabled(capabilities, capability)).toBe(expected);
  });

  it('denies every capability to a frozen member without deleting their role', () => {
    for (const role of ORGANIZATION_MEMBER_ROLE_VALUES) {
      const capabilities = organizationCapabilitiesForRole(role, {
        rbacEnabled: true,
        frozen: true,
      });
      expect(capabilities).toMatchObject({
        billing: false,
        manageMembers: false,
        writeProjects: false,
        leadScope: 'none',
        analyticsScope: 'none',
      });
    }
  });

  for (const role of ORGANIZATION_MEMBER_ROLE_VALUES) {
    it.todo(`${role} archive integration waits for E-253 archived project state`);
  }

  it.todo('member assigned-only lead filtering waits for the E-255 follow-up');

  for (const role of ORGANIZATION_MEMBER_ROLE_VALUES) {
    it.todo(`${role} analytics dataset scope is covered by E-246`);
  }
});
