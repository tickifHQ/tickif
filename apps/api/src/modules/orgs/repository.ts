import { and, desc, eq, gt } from 'drizzle-orm';
import { db, schema } from '@repo/db';

export type OrganizationSummaryRecord = Pick<
  typeof schema.organization.$inferSelect,
  'id' | 'name' | 'slug' | 'logo'
>;

export type OrganizationMemberRecord = Pick<
  typeof schema.member.$inferSelect,
  'id' | 'userId' | 'role' | 'createdAt'
> &
  Pick<typeof schema.user.$inferSelect, 'name' | 'email' | 'image'>;

export type OrganizationInvitationRecord = Pick<
  typeof schema.invitation.$inferSelect,
  'id' | 'email' | 'role' | 'createdAt' | 'expiresAt'
>;

export const orgsRepository = {
  async hasMembership(userId: string, organizationId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(
        and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)),
      )
      .limit(1);
    return !!row;
  },

  async findSoleOrganizationForUser(userId: string): Promise<string | null> {
    const rows = await db
      .selectDistinct({ organizationId: schema.member.organizationId })
      .from(schema.member)
      .where(eq(schema.member.userId, userId))
      .limit(2);
    return rows.length === 1 ? (rows[0]?.organizationId ?? null) : null;
  },

  async findMembershipRole(userId: string, organizationId: string): Promise<string | null> {
    const [row] = await db
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(
        and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)),
      )
      .limit(1);
    return row?.role ?? null;
  },

  async findWorkspaceMembership(
    userId: string,
    organizationId: string,
  ): Promise<{ organization: OrganizationSummaryRecord; role: string } | null> {
    const [row] = await db
      .select({
        organization: {
          id: schema.organization.id,
          name: schema.organization.name,
          slug: schema.organization.slug,
          logo: schema.organization.logo,
        },
        role: schema.member.role,
      })
      .from(schema.member)
      .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
      .where(
        and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)),
      )
      .limit(1);
    return row ?? null;
  },

  async listMembers(organizationId: string): Promise<OrganizationMemberRecord[]> {
    return db
      .select({
        id: schema.member.id,
        userId: schema.member.userId,
        role: schema.member.role,
        createdAt: schema.member.createdAt,
        name: schema.user.name,
        email: schema.user.email,
        image: schema.user.image,
      })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
      .where(eq(schema.member.organizationId, organizationId));
  },

  async listPendingInvitations(organizationId: string): Promise<OrganizationInvitationRecord[]> {
    return db
      .select({
        id: schema.invitation.id,
        email: schema.invitation.email,
        role: schema.invitation.role,
        createdAt: schema.invitation.createdAt,
        expiresAt: schema.invitation.expiresAt,
      })
      .from(schema.invitation)
      .where(
        and(
          eq(schema.invitation.organizationId, organizationId),
          eq(schema.invitation.status, 'pending'),
          gt(schema.invitation.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(schema.invitation.createdAt));
  },
};
