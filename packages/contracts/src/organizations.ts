import { z } from 'zod';

export const ORGANIZATION_MEMBER_ROLE = {
  OWNER: 'owner',
  ADMIN: 'admin',
  BILLING_ADMIN: 'billing_admin',
  MEMBER: 'member',
  VIEWER: 'viewer',
} as const;

export const ORGANIZATION_MEMBER_ROLE_VALUES = [
  ORGANIZATION_MEMBER_ROLE.OWNER,
  ORGANIZATION_MEMBER_ROLE.ADMIN,
  ORGANIZATION_MEMBER_ROLE.BILLING_ADMIN,
  ORGANIZATION_MEMBER_ROLE.MEMBER,
  ORGANIZATION_MEMBER_ROLE.VIEWER,
] as const;

export const organizationMemberRoleSchema = z
  .enum(ORGANIZATION_MEMBER_ROLE_VALUES)
  .meta({ id: 'OrganizationMemberRole' });
export type OrganizationMemberRole = z.infer<typeof organizationMemberRoleSchema>;

export const ORGANIZATION_CAPABILITY = {
  BILLING: 'billing',
  MANAGE_MEMBERS: 'manage_members',
  CHANGE_MEMBER_ROLES: 'change_member_roles',
  TRANSFER_OWNERSHIP: 'transfer_ownership',
  WRITE_PROJECTS: 'write_projects',
  SUBMIT_PROJECTS: 'submit_projects',
  ARCHIVE_PROJECTS: 'archive_projects',
  DELETE_PROJECTS: 'delete_projects',
  READ_LEADS: 'read_leads',
  READ_ANALYTICS: 'read_analytics',
  EDIT_ORGANIZATION: 'edit_organization',
  MANAGE_VERIFICATION: 'manage_verification',
} as const;

export const ORGANIZATION_CAPABILITY_VALUES = [
  ORGANIZATION_CAPABILITY.BILLING,
  ORGANIZATION_CAPABILITY.MANAGE_MEMBERS,
  ORGANIZATION_CAPABILITY.CHANGE_MEMBER_ROLES,
  ORGANIZATION_CAPABILITY.TRANSFER_OWNERSHIP,
  ORGANIZATION_CAPABILITY.WRITE_PROJECTS,
  ORGANIZATION_CAPABILITY.SUBMIT_PROJECTS,
  ORGANIZATION_CAPABILITY.ARCHIVE_PROJECTS,
  ORGANIZATION_CAPABILITY.DELETE_PROJECTS,
  ORGANIZATION_CAPABILITY.READ_LEADS,
  ORGANIZATION_CAPABILITY.READ_ANALYTICS,
  ORGANIZATION_CAPABILITY.EDIT_ORGANIZATION,
  ORGANIZATION_CAPABILITY.MANAGE_VERIFICATION,
] as const;

export const organizationCapabilitySchema = z
  .enum(ORGANIZATION_CAPABILITY_VALUES)
  .meta({ id: 'OrganizationCapability' });
export type OrganizationCapability = z.infer<typeof organizationCapabilitySchema>;

export const ORGANIZATION_ACCESS_SCOPE = {
  NONE: 'none',
  FULL: 'full',
  ASSIGNED: 'assigned',
  OWN: 'own',
  BILLING: 'billing',
  ORGANIZATION: 'organization',
} as const;

export const organizationAccessScopeSchema = z
  .enum([
    ORGANIZATION_ACCESS_SCOPE.NONE,
    ORGANIZATION_ACCESS_SCOPE.FULL,
    ORGANIZATION_ACCESS_SCOPE.ASSIGNED,
    ORGANIZATION_ACCESS_SCOPE.OWN,
    ORGANIZATION_ACCESS_SCOPE.BILLING,
    ORGANIZATION_ACCESS_SCOPE.ORGANIZATION,
  ])
  .meta({ id: 'OrganizationAccessScope' });

export const organizationCapabilitiesSchema = z
  .object({
    billing: z.boolean(),
    manageMembers: z.boolean(),
    changeMemberRoles: z.boolean(),
    transferOwnership: z.boolean(),
    writeProjects: z.boolean(),
    submitProjects: z.boolean(),
    archiveProjects: z.boolean(),
    deleteProjects: z.boolean(),
    leadScope: organizationAccessScopeSchema,
    analyticsScope: organizationAccessScopeSchema,
    editOrganization: z.boolean(),
    manageVerification: z.boolean(),
  })
  .meta({ id: 'OrganizationCapabilities' });
export type OrganizationCapabilities = z.infer<typeof organizationCapabilitiesSchema>;

export const ORGANIZATION_INVITATION_STATE = {
  PENDING: 'pending',
  ACTIVE: 'active',
  DECLINED: 'declined',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
} as const;

export const ORGANIZATION_INVITATION_STATE_VALUES = [
  ORGANIZATION_INVITATION_STATE.PENDING,
  ORGANIZATION_INVITATION_STATE.ACTIVE,
  ORGANIZATION_INVITATION_STATE.DECLINED,
  ORGANIZATION_INVITATION_STATE.EXPIRED,
  ORGANIZATION_INVITATION_STATE.REVOKED,
] as const;

export const organizationInvitationStateSchema = z
  .enum(ORGANIZATION_INVITATION_STATE_VALUES)
  .meta({ id: 'OrganizationInvitationState' });
export type OrganizationInvitationState = z.infer<typeof organizationInvitationStateSchema>;

export const OWNERSHIP_TRANSFER_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const;

export const OWNERSHIP_TRANSFER_STATUS_VALUES = [
  OWNERSHIP_TRANSFER_STATUS.PENDING,
  OWNERSHIP_TRANSFER_STATUS.ACCEPTED,
  OWNERSHIP_TRANSFER_STATUS.DECLINED,
  OWNERSHIP_TRANSFER_STATUS.CANCELLED,
  OWNERSHIP_TRANSFER_STATUS.EXPIRED,
] as const;

export const ownershipTransferStatusSchema = z
  .enum(OWNERSHIP_TRANSFER_STATUS_VALUES)
  .meta({ id: 'OwnershipTransferStatus' });
export type OwnershipTransferStatus = z.infer<typeof ownershipTransferStatusSchema>;

export const createOwnershipTransferSchema = z
  .object({ targetMemberId: z.string().min(1) })
  .strict()
  .meta({ id: 'CreateOwnershipTransfer' });
export type CreateOwnershipTransfer = z.infer<typeof createOwnershipTransferSchema>;

export const ownershipTransferResponseSchema = z
  .object({
    id: z.uuid(),
    organizationId: z.string().min(1),
    status: ownershipTransferStatusSchema,
    initiator: z.object({
      userId: z.string().min(1),
      name: z.string().min(1),
      email: z.email(),
    }),
    target: z.object({
      memberId: z.string().min(1),
      userId: z.string().min(1),
      name: z.string().min(1),
      email: z.email(),
      role: organizationMemberRoleSchema,
    }),
    expiresAt: z.string().datetime(),
    createdAt: z.string().datetime(),
    resolvedAt: z.string().datetime().nullable(),
  })
  .meta({ id: 'OwnershipTransferResponse' });
export type OwnershipTransferResponse = z.infer<typeof ownershipTransferResponseSchema>;

export const ownershipTransferIdParamSchema = z.object({ id: z.uuid() });

export const organizationMemberSchema = z
  .object({
    id: z.string().min(1),
    userId: z.string().min(1),
    name: z.string().min(1),
    email: z.email(),
    image: z.url().nullable(),
    role: organizationMemberRoleSchema,
    frozen: z.boolean(),
    frozenAt: z.string().datetime().nullable(),
    freezeRank: z.number().int().positive().nullable(),
    joinedAt: z.string().datetime(),
    isCurrentUser: z.boolean(),
  })
  .meta({ id: 'OrganizationMember' });
export type OrganizationMember = z.infer<typeof organizationMemberSchema>;

export const organizationInvitationSchema = z
  .object({
    id: z.string().min(1),
    email: z.email(),
    role: organizationMemberRoleSchema,
    state: organizationInvitationStateSchema,
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .meta({ id: 'OrganizationInvitation' });
export type OrganizationInvitation = z.infer<typeof organizationInvitationSchema>;

export const organizationWorkspaceResponseSchema = z
  .object({
    organization: z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      slug: z.string().min(1),
      logo: z.url().nullable(),
    }),
    currentUserRole: organizationMemberRoleSchema,
    canManage: z.boolean(),
    rbacEnabled: z.boolean(),
    seatUsage: z.number().int().min(0),
    seatLimit: z.number().int(),
    capabilities: organizationCapabilitiesSchema,
    members: z.array(organizationMemberSchema),
    invitations: z.array(organizationInvitationSchema),
    ownershipTransfer: ownershipTransferResponseSchema.nullable(),
  })
  .meta({ id: 'OrganizationWorkspaceResponse' });
export type OrganizationWorkspaceResponse = z.infer<typeof organizationWorkspaceResponseSchema>;

export const organizationBranchMemberSchema = z
  .object({
    userId: z.string().min(1),
    name: z.string().min(1),
    email: z.email(),
    image: z.url().nullable(),
    role: organizationMemberRoleSchema,
  })
  .meta({ id: 'OrganizationBranchMember' });

export const organizationBranchSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    profileId: z.uuid(),
    profileSlug: z.string().min(1),
    projectCount: z.number().int().min(0),
    createdAt: z.string().datetime(),
    members: z.array(organizationBranchMemberSchema),
  })
  .meta({ id: 'OrganizationBranch' });

export const organizationBranchesResponseSchema = z
  .object({
    activeTeamId: z.string().nullable(),
    branchUsage: z.number().int().min(0),
    branchLimit: z.number().int(),
    branches: z.array(organizationBranchSchema),
  })
  .meta({ id: 'OrganizationBranchesResponse' });
export type OrganizationBranchesResponse = z.infer<typeof organizationBranchesResponseSchema>;
