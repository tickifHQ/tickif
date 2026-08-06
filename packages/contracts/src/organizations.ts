import { z } from 'zod';

export const organizationMemberRoleSchema = z
  .enum(['owner', 'admin', 'member'])
  .meta({ id: 'OrganizationMemberRole' });
export type OrganizationMemberRole = z.infer<typeof organizationMemberRoleSchema>;

export const organizationMemberSchema = z
  .object({
    id: z.string().min(1),
    userId: z.string().min(1),
    name: z.string().min(1),
    email: z.email(),
    image: z.url().nullable(),
    role: organizationMemberRoleSchema,
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
    members: z.array(organizationMemberSchema),
    invitations: z.array(organizationInvitationSchema),
  })
  .meta({ id: 'OrganizationWorkspaceResponse' });
export type OrganizationWorkspaceResponse = z.infer<typeof organizationWorkspaceResponseSchema>;
