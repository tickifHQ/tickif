import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, adminAc } from 'better-auth/plugins/admin/access';
import {
  ORGANIZATION_ACCESS_SCOPE,
  ORGANIZATION_MEMBER_ROLE,
  PLATFORM_ROLE,
  type OrganizationCapabilities,
  type OrganizationMemberRole,
  type PlatformRole,
} from '@repo/contracts';
import {
  adminAc as organizationAdminAc,
  defaultStatements as organizationDefaultStatements,
  ownerAc as organizationOwnerAc,
} from 'better-auth/plugins/organization/access';

export type { PlatformRole } from '@repo/contracts';

/**
 * better-auth access control for the admin plugin (E-87).
 *
 * Statements stay better-auth's defaults (user/session admin operations): app-level
 * permissions (taxonomy CRUD, project ownership, ...) are enforced by the Hono guards
 * in apps/api, not by better-auth hasPermission — one source of truth.
 */
export const statement = defaultStatements;

export const ac = createAccessControl(statement);

/**
 * The 4 platform roles (must stay in sync with the user_role pgEnum, see ADR 0001).
 * Only superadmins may use Better Auth's account-administration endpoints. Platform
 * admins moderate Tickif through the app's Hono routes and must not be able to create,
 * promote, ban, or remove privileged accounts through `/api/auth/admin/*`.
 */
export const roles = {
  [PLATFORM_ROLE.VISITOR]: ac.newRole({ user: [], session: [] }),
  [PLATFORM_ROLE.DESIGNER]: ac.newRole({ user: [], session: [] }),
  [PLATFORM_ROLE.ADMIN]: ac.newRole({ user: [], session: [] }),
  [PLATFORM_ROLE.SUPERADMIN]: ac.newRole({ ...adminAc.statements }),
} satisfies Record<PlatformRole, ReturnType<typeof ac.newRole>>;

export const orgStatement = {
  ...organizationDefaultStatements,
  billing: ['read', 'manage'],
  ownership: ['transfer'],
  project: ['create', 'edit', 'submit', 'archive', 'delete'],
  lead: ['read-all', 'read-assigned'],
  analytics: ['read-full', 'read-billing', 'read-own', 'read-org', 'read-branch'],
  verification: ['manage'],
} as const;

export const orgAc = createAccessControl(orgStatement);

export const orgRoles = {
  [ORGANIZATION_MEMBER_ROLE.OWNER]: orgAc.newRole({
    ...organizationOwnerAc.statements,
    billing: ['read', 'manage'],
    ownership: ['transfer'],
    project: ['create', 'edit', 'submit', 'archive', 'delete'],
    lead: ['read-all', 'read-assigned'],
    analytics: ['read-full', 'read-billing', 'read-own', 'read-org', 'read-branch'],
    verification: ['manage'],
  }),
  [ORGANIZATION_MEMBER_ROLE.ADMIN]: orgAc.newRole({
    ...organizationAdminAc.statements,
    billing: [],
    ownership: [],
    project: ['create', 'edit', 'submit', 'archive', 'delete'],
    lead: ['read-all', 'read-assigned'],
    analytics: ['read-full', 'read-own', 'read-org', 'read-branch'],
    verification: ['manage'],
  }),
  [ORGANIZATION_MEMBER_ROLE.BILLING_ADMIN]: orgAc.newRole({
    organization: [],
    member: [],
    invitation: [],
    team: [],
    ac: ['read'],
    billing: ['read', 'manage'],
    ownership: [],
    project: [],
    lead: [],
    analytics: ['read-billing'],
    verification: [],
  }),
  [ORGANIZATION_MEMBER_ROLE.MEMBER]: orgAc.newRole({
    organization: [],
    member: [],
    invitation: [],
    team: [],
    ac: ['read'],
    billing: [],
    ownership: [],
    project: ['create', 'edit', 'submit', 'archive'],
    lead: ['read-assigned'],
    analytics: ['read-own'],
    verification: [],
  }),
  [ORGANIZATION_MEMBER_ROLE.VIEWER]: orgAc.newRole({
    organization: [],
    member: [],
    invitation: [],
    team: [],
    ac: ['read'],
    billing: [],
    ownership: [],
    project: [],
    lead: [],
    analytics: ['read-org'],
    verification: [],
  }),
} satisfies Record<OrganizationMemberRole, ReturnType<typeof orgAc.newRole>>;

const NO_ORGANIZATION_CAPABILITIES: OrganizationCapabilities = {
  billing: false,
  manageMembers: false,
  changeMemberRoles: false,
  transferOwnership: false,
  writeProjects: false,
  submitProjects: false,
  archiveProjects: false,
  deleteProjects: false,
  leadScope: ORGANIZATION_ACCESS_SCOPE.NONE,
  analyticsScope: ORGANIZATION_ACCESS_SCOPE.NONE,
  editOrganization: false,
  manageVerification: false,
};

export function organizationCapabilitiesForRole(
  role: OrganizationMemberRole,
  options: { rbacEnabled: boolean; frozen: boolean },
): OrganizationCapabilities {
  if (options.frozen) return NO_ORGANIZATION_CAPABILITIES;

  if (!options.rbacEnabled) {
    return role === ORGANIZATION_MEMBER_ROLE.OWNER
      ? {
          ...NO_ORGANIZATION_CAPABILITIES,
          billing: true,
          writeProjects: true,
          submitProjects: true,
          archiveProjects: true,
          deleteProjects: true,
          leadScope: ORGANIZATION_ACCESS_SCOPE.FULL,
          analyticsScope: ORGANIZATION_ACCESS_SCOPE.ORGANIZATION,
          editOrganization: true,
          manageVerification: true,
        }
      : NO_ORGANIZATION_CAPABILITIES;
  }

  const authorizer = orgRoles[role];
  const leadScope =
    role === ORGANIZATION_MEMBER_ROLE.MEMBER
      ? ORGANIZATION_ACCESS_SCOPE.ASSIGNED
      : authorizer.authorize({ lead: ['read-all'] }).success
        ? ORGANIZATION_ACCESS_SCOPE.FULL
        : ORGANIZATION_ACCESS_SCOPE.NONE;
  const analyticsScope =
    role === ORGANIZATION_MEMBER_ROLE.BILLING_ADMIN
      ? ORGANIZATION_ACCESS_SCOPE.BILLING
      : role === ORGANIZATION_MEMBER_ROLE.MEMBER
        ? ORGANIZATION_ACCESS_SCOPE.OWN
        : role === ORGANIZATION_MEMBER_ROLE.VIEWER
          ? ORGANIZATION_ACCESS_SCOPE.ORGANIZATION
          : authorizer.authorize({ analytics: ['read-full'] }).success
            ? ORGANIZATION_ACCESS_SCOPE.FULL
            : ORGANIZATION_ACCESS_SCOPE.NONE;

  return {
    billing: authorizer.authorize({ billing: ['manage'] }).success,
    manageMembers: authorizer.authorize({ invitation: ['create'], member: ['delete'] }).success,
    changeMemberRoles: authorizer.authorize({ member: ['update'] }).success,
    transferOwnership: authorizer.authorize({ ownership: ['transfer'] }).success,
    writeProjects: authorizer.authorize({ project: ['create', 'edit'] }).success,
    submitProjects: authorizer.authorize({ project: ['submit'] }).success,
    archiveProjects: authorizer.authorize({ project: ['archive'] }).success,
    deleteProjects: authorizer.authorize({ project: ['delete'] }).success,
    leadScope,
    analyticsScope,
    editOrganization: authorizer.authorize({ organization: ['update'] }).success,
    manageVerification: authorizer.authorize({ verification: ['manage'] }).success,
  };
}
