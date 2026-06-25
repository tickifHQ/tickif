import { db, schema, eq, and, desc, sql } from '@repo/db';

/**
 * Data-access for designer dashboard overview. This repository composes existing
 * profile, organization, and project tables without adding new persistence.
 */

export type DashboardProfileContext = {
  profileId: string;
  orgId: string;
  orgSlug: string;
  displayName: string;
  location: string | null;
  logoImageId: string | null;
  status: string;
  projectCount: number;
  shareCount: number;
  avgRating: string;
  reviewCount: number;
};

export type DashboardProjectSummary = {
  id: string;
  title: string;
  status: (typeof schema.projectStatusEnum.enumValues)[number];
  submittedAt: Date | null;
  updatedAt: Date;
};

export type ProjectStatusCount = {
  status: (typeof schema.projectStatusEnum.enumValues)[number];
  count: number;
};

export const dashboardRepository = {
  async findProfileContext(input: {
    userId: string;
    orgId: string | null;
  }): Promise<DashboardProfileContext | null> {
    const filters = [
      eq(schema.member.userId, input.userId),
      input.orgId ? eq(schema.designerProfile.orgId, input.orgId) : undefined,
    ].filter((filter) => filter !== undefined);

    const [row] = await db
      .select({
        profileId: schema.designerProfile.id,
        orgId: schema.designerProfile.orgId,
        orgSlug: schema.organization.slug,
        displayName: schema.designerProfile.displayName,
        location: schema.designerProfile.address,
        logoImageId: schema.designerProfile.logoImageId,
        status: schema.designerProfile.status,
        projectCount: schema.designerProfile.projectCount,
        shareCount: schema.designerProfile.shareCount,
        avgRating: schema.designerProfile.avgRating,
        reviewCount: schema.designerProfile.reviewCount,
      })
      .from(schema.designerProfile)
      .innerJoin(schema.organization, eq(schema.designerProfile.orgId, schema.organization.id))
      .innerJoin(
        schema.member,
        eq(schema.member.organizationId, schema.designerProfile.orgId),
      )
      .where(and(...filters))
      .orderBy(desc(schema.designerProfile.updatedAt))
      .limit(1);

    return row ?? null;
  },

  async listRecentProjects(profileId: string): Promise<DashboardProjectSummary[]> {
    return db
      .select({
        id: schema.project.id,
        title: schema.project.title,
        status: schema.project.status,
        submittedAt: schema.project.submittedAt,
        updatedAt: schema.project.updatedAt,
      })
      .from(schema.project)
      .where(eq(schema.project.designerId, profileId))
      .orderBy(desc(schema.project.updatedAt))
      .limit(20);
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

  async incrementShareCount(profileId: string): Promise<number | null> {
    const [row] = await db
      .update(schema.designerProfile)
      .set({
        shareCount: sql`${schema.designerProfile.shareCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.designerProfile.id, profileId))
      .returning({ shareCount: schema.designerProfile.shareCount });
    return row?.shareCount ?? null;
  },
};
