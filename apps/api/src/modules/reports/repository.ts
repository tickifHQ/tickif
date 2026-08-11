import { and, db, eq, gte, lte, schema, sql } from '@repo/db';
import { INTERACTION_EVENT_TYPE, type ProjectReportReason } from '@repo/contracts';

export type AnalyticsProfileContext = {
  profileId: string;
  orgId: string;
};

export type AnalyticsProjectStatusCount = {
  status: (typeof schema.projectStatusEnum.enumValues)[number];
  count: number;
};

export type AnalyticsLeadStatusCount = {
  status: (typeof schema.leadStatusEnum.enumValues)[number];
  count: number;
};

export type AnalyticsDailyCount = {
  date: string;
  count: number;
};

export type AnalyticsViewDailyCount = AnalyticsDailyCount & {
  type: (typeof schema.interactionEventTypeEnum.enumValues)[number];
};

export const reportsRepository = {
  async findReportableProject(projectId: string): Promise<{
    orgId: string;
    status: (typeof schema.projectStatusEnum.enumValues)[number];
  } | null> {
    const [row] = await db
      .select({
        orgId: schema.designerProfile.orgId,
        status: schema.project.status,
      })
      .from(schema.project)
      .innerJoin(schema.designerProfile, eq(schema.designerProfile.id, schema.project.designerId))
      .where(eq(schema.project.id, projectId))
      .limit(1);

    return row ?? null;
  },

  async isOrganizationMember(userId: string, orgId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(and(eq(schema.member.userId, userId), eq(schema.member.organizationId, orgId)))
      .limit(1);

    return row !== undefined;
  },

  async upsertProjectReport(input: {
    reporterUserId: string;
    projectId: string;
    reason: ProjectReportReason;
    details: string | null;
  }): Promise<void> {
    await db
      .insert(schema.projectReport)
      .values(input)
      .onConflictDoUpdate({
        target: [schema.projectReport.reporterUserId, schema.projectReport.projectId],
        set: {
          reason: input.reason,
          details: input.details,
          status: 'open',
          updatedAt: new Date(),
        },
      });
  },

  async findProfileContext(input: {
    userId: string;
    orgId: string;
  }): Promise<AnalyticsProfileContext | null> {
    const [row] = await db
      .select({
        profileId: schema.designerProfile.id,
        orgId: schema.designerProfile.orgId,
      })
      .from(schema.designerProfile)
      .innerJoin(schema.member, eq(schema.member.organizationId, schema.designerProfile.orgId))
      .where(
        and(eq(schema.member.userId, input.userId), eq(schema.designerProfile.orgId, input.orgId)),
      )
      .limit(1);

    return row ?? null;
  },

  async countProjectsByStatus(profileId: string): Promise<AnalyticsProjectStatusCount[]> {
    return db
      .select({
        status: schema.project.status,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.project)
      .where(eq(schema.project.designerId, profileId))
      .groupBy(schema.project.status);
  },

  async countLeadsByStatus(orgId: string): Promise<AnalyticsLeadStatusCount[]> {
    return db
      .select({
        status: schema.lead.status,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.lead)
      .where(eq(schema.lead.organizationId, orgId))
      .groupBy(schema.lead.status);
  },

  async countProjectsCreatedByDay(input: {
    profileId: string;
    from: Date;
    to: Date;
  }): Promise<AnalyticsDailyCount[]> {
    const day = sql<string>`to_char(date_trunc('day', ${schema.project.createdAt}), 'YYYY-MM-DD')`;
    return db
      .select({
        date: day,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.project)
      .where(
        and(
          eq(schema.project.designerId, input.profileId),
          sql<boolean>`${schema.project.createdAt} >= ${input.from}`,
          sql<boolean>`${schema.project.createdAt} <= ${input.to}`,
        ),
      )
      .groupBy(day)
      .orderBy(day);
  },

  async countLeadsReceivedByDay(input: {
    orgId: string;
    from: Date;
    to: Date;
  }): Promise<AnalyticsDailyCount[]> {
    const day = sql<string>`to_char(date_trunc('day', ${schema.lead.receivedAt} at time zone 'UTC'), 'YYYY-MM-DD')`;
    return db
      .select({
        date: day,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.lead)
      .where(
        and(
          eq(schema.lead.organizationId, input.orgId),
          sql<boolean>`${schema.lead.receivedAt} >= ${input.from}`,
          sql<boolean>`${schema.lead.receivedAt} <= ${input.to}`,
        ),
      )
      .groupBy(day)
      .orderBy(day);
  },

  async countViewsByDay(input: {
    profileId: string;
    from: Date;
    to: Date;
  }): Promise<AnalyticsViewDailyCount[]> {
    const day = sql<string>`to_char(date_trunc('day', ${schema.interactionEvent.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;
    const [profileViews, projectViews] = await Promise.all([
      db
        .select({
          type: schema.interactionEvent.type,
          date: day,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.interactionEvent)
        .where(
          and(
            eq(schema.interactionEvent.type, INTERACTION_EVENT_TYPE.PROFILE_VIEW),
            eq(schema.interactionEvent.designerProfileId, input.profileId),
            gte(schema.interactionEvent.createdAt, input.from),
            lte(schema.interactionEvent.createdAt, input.to),
          ),
        )
        .groupBy(schema.interactionEvent.type, day)
        .orderBy(day),
      db
        .select({
          type: schema.interactionEvent.type,
          date: day,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.interactionEvent)
        .innerJoin(schema.project, eq(schema.project.id, schema.interactionEvent.projectId))
        .where(
          and(
            eq(schema.interactionEvent.type, INTERACTION_EVENT_TYPE.PROJECT_VIEW),
            eq(schema.project.designerId, input.profileId),
            gte(schema.interactionEvent.createdAt, input.from),
            lte(schema.interactionEvent.createdAt, input.to),
          ),
        )
        .groupBy(schema.interactionEvent.type, day)
        .orderBy(day),
    ]);
    return [...profileViews, ...projectViews];
  },
};
