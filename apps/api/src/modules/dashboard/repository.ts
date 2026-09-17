import { db, schema, eq, and, sql } from '@repo/db';

export type DashboardProfileContext = {
  profileId: string;
  orgId: string;
  orgSlug: string;
  teamId: string;
  profileSlug: string;
  portfolioSlug: string | null;
  logoImageId: string | null;
  displayName: string;
  bio: string | null;
  tagline: string | null;
  // Publication inputs are selected with the dashboard context so the service
  // can use the same completeness gate as the owner and anonymous portfolio
  // endpoints without a second query. `publicLinkEnabled` is null only when the
  // left-joined portfolio row does not exist.
  profileStatus: (typeof schema.profileStatusEnum.enumValues)[number];
  publicLinkEnabled: boolean | null;
  verificationStatus: (typeof schema.verificationApplicationStatusEnum.enumValues)[number] | null;
  verificationExpiresAt: Date | null;
};

export type ProjectStatusCount = {
  status: (typeof schema.projectStatusEnum.enumValues)[number];
  count: number;
};

export const dashboardRepository = {
  async findProfileContext(input: {
    userId: string;
    orgId: string;
    teamId?: string | null;
  }): Promise<DashboardProfileContext | null> {
    const [row] = await db
      .select({
        profileId: schema.designerProfile.id,
        orgId: schema.designerProfile.orgId,
        orgSlug: schema.organization.slug,
        teamId: schema.designerProfile.teamId,
        profileSlug: schema.designerProfile.slug,
        portfolioSlug: schema.designerPortfolio.portfolioSlug,
        logoImageId: schema.designerProfile.logoImageId,
        displayName: schema.designerProfile.displayName,
        bio: schema.designerProfile.bio,
        tagline: schema.designerPortfolio.tagline,
        profileStatus: schema.designerProfile.status,
        publicLinkEnabled: schema.designerPortfolio.publicLinkEnabled,
        verificationStatus: schema.verificationApplication.status,
        verificationExpiresAt: schema.verificationApplication.expiresAt,
      })
      .from(schema.designerProfile)
      .innerJoin(schema.organization, eq(schema.designerProfile.orgId, schema.organization.id))
      .innerJoin(schema.member, eq(schema.member.organizationId, schema.designerProfile.orgId))
      .leftJoin(
        schema.designerPortfolio,
        eq(schema.designerPortfolio.profileId, schema.designerProfile.id),
      )
      .leftJoin(
        schema.verificationApplication,
        eq(schema.verificationApplication.organizationId, schema.designerProfile.orgId),
      )
      .where(
        and(
          eq(schema.member.userId, input.userId),
          eq(schema.designerProfile.orgId, input.orgId),
          input.teamId ? eq(schema.designerProfile.teamId, input.teamId) : undefined,
        ),
      )
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
