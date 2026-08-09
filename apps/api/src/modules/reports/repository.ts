import { and, db, eq, or, schema, sql } from '@repo/db';
import { INTERACTION_EVENT_TYPE } from '@repo/contracts';

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
    return db
      .select({
        type: schema.interactionEvent.type,
        date: day,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.interactionEvent)
      .leftJoin(schema.project, eq(schema.project.id, schema.interactionEvent.projectId))
      .where(
        and(
          sql<boolean>`${schema.interactionEvent.createdAt} >= ${input.from}`,
          sql<boolean>`${schema.interactionEvent.createdAt} <= ${input.to}`,
          or(
            and(
              eq(schema.interactionEvent.type, INTERACTION_EVENT_TYPE.PROFILE_VIEW),
              eq(schema.interactionEvent.designerProfileId, input.profileId),
            ),
            and(
              eq(schema.interactionEvent.type, INTERACTION_EVENT_TYPE.PROJECT_VIEW),
              eq(schema.project.designerId, input.profileId),
            ),
          ),
        ),
      )
      .groupBy(schema.interactionEvent.type, day)
      .orderBy(day, schema.interactionEvent.type);
  },
};
