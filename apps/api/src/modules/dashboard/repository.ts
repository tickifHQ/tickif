import { db, schema, eq, and, desc, sql } from '@repo/db';

export type DashboardProfileContext = {
  profileId: string;
  orgId: string;
  orgSlug: string;
  portfolioSlug: string | null;
};

export type ProjectStatusCount = {
  status: (typeof schema.projectStatusEnum.enumValues)[number];
  count: number;
};

export const dashboardRepository = {
  async findProfileContext(input: {
    userId: string;
    orgId: string;
  }): Promise<DashboardProfileContext | null> {
    const [row] = await db
      .select({
        profileId: schema.designerProfile.id,
        orgId: schema.designerProfile.orgId,
        orgSlug: schema.organization.slug,
        portfolioSlug: schema.designerPortfolio.portfolioSlug,
      })
      .from(schema.designerProfile)
      .innerJoin(schema.organization, eq(schema.designerProfile.orgId, schema.organization.id))
      .innerJoin(schema.member, eq(schema.member.organizationId, schema.designerProfile.orgId))
      .leftJoin(
        schema.designerPortfolio,
        eq(schema.designerPortfolio.profileId, schema.designerProfile.id),
      )
      .where(
        and(eq(schema.member.userId, input.userId), eq(schema.designerProfile.orgId, input.orgId)),
      )
      .orderBy(desc(schema.designerProfile.updatedAt))
      .limit(1);

    return row ?? null;
  },

  async countProjectsByStatus(profileId: string): Promise<ProjectStatusCount[]> {
    return db
      .select({
        status: schema.project.status,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.project)
      .where(eq(schema.project.designerId, profileId))
      .groupBy(schema.project.status);
  },
};
