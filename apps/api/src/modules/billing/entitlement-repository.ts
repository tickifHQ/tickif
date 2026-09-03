import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@repo/db';

export const entitlementRepository = {
  async findSubscription(organizationId: string) {
    const [subscription] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, organizationId))
      .limit(1);
    return subscription ?? null;
  },

  async countSeats(organizationId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.member)
      .where(eq(schema.member.organizationId, organizationId));
    return result?.count ?? 0;
  },

  async countBranches(organizationId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.team)
      .where(and(eq(schema.team.organizationId, organizationId), eq(schema.team.frozen, false)));
    return result?.count ?? 0;
  },

  async countFrozenSeats(organizationId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.member)
      .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.frozen, true)));
    return result?.count ?? 0;
  },

  async countFrozenBranches(organizationId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.team)
      .where(and(eq(schema.team.organizationId, organizationId), eq(schema.team.frozen, true)));
    return result?.count ?? 0;
  },

  async isOrganizationVerified(organizationId: string): Promise<boolean> {
    const [application] = await db
      .select({ status: schema.verificationApplication.status })
      .from(schema.verificationApplication)
      .where(
        and(
          eq(schema.verificationApplication.organizationId, organizationId),
          eq(schema.verificationApplication.status, 'verified'),
          sql`${schema.verificationApplication.expiresAt} > NOW()`,
        ),
      )
      .limit(1);
    return !!application;
  },
};
