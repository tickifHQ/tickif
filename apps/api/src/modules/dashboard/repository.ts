import { db, schema, eq, and, desc, sql } from '@repo/db';

/**
 * Data-access for designer dashboard overview. This repository composes existing
 * profile, organization, and project tables without adding new persistence.
 */

export type DashboardProfileContext = {
  profileId: string;
  orgSlug: string;
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
        orgSlug: schema.organization.slug,
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
