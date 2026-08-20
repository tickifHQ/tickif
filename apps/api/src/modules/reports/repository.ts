import { and, db, desc, eq, gte, lte, schema, sql } from '@repo/db';
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

export type AnalyticsTopProject = {
  projectId: string;
  title: string;
  citySlug: string | null;
  localitySlug: string | null;
  views: number;
  enquiries: number;
  conversions: number;
};

export type AnalyticsAcquisitionSource = {
  source: string;
  enquiries: number;
  conversions: number;
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

  async countLeadsByStatus(input: {
    orgId: string;
    from: Date;
    to: Date;
  }): Promise<AnalyticsLeadStatusCount[]> {
    return db
      .select({
        status: schema.lead.status,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.lead)
      .where(
        and(
          eq(schema.lead.organizationId, input.orgId),
          gte(schema.lead.receivedAt, input.from),
          lte(schema.lead.receivedAt, input.to),
        ),
      )
      .groupBy(schema.lead.status);
  },

  async countProjectsCreatedByDay(input: {
    profileId: string;
    from: Date;
    to: Date;
  }): Promise<AnalyticsDailyCount[]> {
    const day = sql<string>`to_char(date_trunc('day', (${schema.project.createdAt} at time zone 'UTC') at time zone 'Asia/Kolkata'), 'YYYY-MM-DD')`;
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
    const day = sql<string>`to_char(date_trunc('day', ${schema.lead.receivedAt} at time zone 'Asia/Kolkata'), 'YYYY-MM-DD')`;
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
    const day = sql<string>`to_char(date_trunc('day', ${schema.interactionEvent.createdAt} at time zone 'Asia/Kolkata'), 'YYYY-MM-DD')`;
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

  async findTopConvertingProjects(input: {
    profileId: string;
    orgId: string;
    from: Date;
    to: Date;
  }): Promise<AnalyticsTopProject[]> {
    const projectSelection = {
      projectId: schema.project.id,
      title: schema.project.title,
      citySlug: schema.project.citySlug,
      localitySlug: schema.project.localitySlug,
    };
    const [viewRows, leadRows] = await Promise.all([
      db
        .select({
          ...projectSelection,
          views: sql<number>`count(${schema.interactionEvent.id})::int`,
        })
        .from(schema.project)
        .innerJoin(
          schema.interactionEvent,
          eq(schema.interactionEvent.projectId, schema.project.id),
        )
        .where(
          and(
            eq(schema.project.designerId, input.profileId),
            eq(schema.interactionEvent.type, INTERACTION_EVENT_TYPE.PROJECT_VIEW),
            gte(schema.interactionEvent.createdAt, input.from),
            lte(schema.interactionEvent.createdAt, input.to),
          ),
        )
        .groupBy(
          schema.project.id,
          schema.project.title,
          schema.project.citySlug,
          schema.project.localitySlug,
        ),
      db
        .select({
          ...projectSelection,
          enquiries: sql<number>`count(*)::int`,
          conversions: sql<number>`count(*) filter (where ${schema.lead.status} in ('contacted', 'closed'))::int`,
        })
        .from(schema.project)
        .innerJoin(schema.lead, eq(schema.lead.referredProjectId, schema.project.id))
        .where(
          and(
            eq(schema.project.designerId, input.profileId),
            eq(schema.lead.organizationId, input.orgId),
            gte(schema.lead.receivedAt, input.from),
            lte(schema.lead.receivedAt, input.to),
          ),
        )
        .groupBy(
          schema.project.id,
          schema.project.title,
          schema.project.citySlug,
          schema.project.localitySlug,
        ),
    ]);
    const projects = new Map<string, AnalyticsTopProject>();

    for (const project of viewRows) {
      projects.set(project.projectId, { ...project, enquiries: 0, conversions: 0 });
    }
    for (const project of leadRows) {
      const existing = projects.get(project.projectId);
      projects.set(project.projectId, {
        ...project,
        views: existing?.views ?? 0,
      });
    }

    return [...projects.values()]
      .filter((project) => project.views > 0 || project.enquiries > 0)
      .sort(
        (left, right) =>
          right.conversions - left.conversions ||
          right.enquiries - left.enquiries ||
          right.views - left.views ||
          left.title.localeCompare(right.title),
      )
      .slice(0, 4);
  },

  async countAcquisitionSources(input: {
    orgId: string;
    from: Date;
    to: Date;
  }): Promise<AnalyticsAcquisitionSource[]> {
    return db
      .select({
        source: schema.lead.source,
        enquiries: sql<number>`count(*)::int`,
        conversions: sql<number>`count(*) filter (where ${schema.lead.status} in ('contacted', 'closed'))::int`,
      })
      .from(schema.lead)
      .where(
        and(
          eq(schema.lead.organizationId, input.orgId),
          gte(schema.lead.receivedAt, input.from),
          lte(schema.lead.receivedAt, input.to),
        ),
      )
      .groupBy(schema.lead.source)
      .orderBy(desc(sql`count(*)`))
      .limit(4);
  },
};
