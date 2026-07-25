import { and, eq } from 'drizzle-orm';
import { db, schema } from '@repo/db';

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
};
