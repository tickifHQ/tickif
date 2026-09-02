import { inArray } from 'drizzle-orm';
import { and, db, desc, eq, gte, lte, schema, sql } from '@repo/db';
import { INTERACTION_EVENT_TYPE } from '@repo/contracts';

export type AnalyticsProfileContext = {
  profileId: string;
  teamId: string;
  teamName: string;
};

export type AnalyticsAccessContext = {
  memberId: string;
  role: string;
  frozen: boolean;
  tier: (typeof schema.planTierEnum.enumValues)[number] | null;
  lifecycleState: (typeof schema.subscriptionStateEnum.enumValues)[number] | null;
  currentPeriodEnd: Date | null;
};

export type AnalyticsDataScope = {
  orgId: string;
  profileIds: string[];
  teamIds: string[];
  responsibleMemberId?: string;
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

export type BillingCurrencyAnalyticsRecord = {
  currency: string;
  capturedAmount: number;
  failedAmount: number;
  transactionCount: number;
  capturedTransactions: number;
  failedTransactions: number;
};

export type FrozenBranchRecord = {
  branchId: string;
  name: string;
  frozenAt: Date;
  freezeRank: number;
};

export type BranchAnalyticsRecord = {
  branchId: string;
  name: string;
  projects: number;
  enquiries: number;
  conversions: number;
  projectViews: number;
  profileViews: number;
};

function projectScope(input: AnalyticsDataScope) {
  return and(
    inArray(schema.project.designerId, input.profileIds),
    input.responsibleMemberId
      ? eq(schema.project.responsibleMemberId, input.responsibleMemberId)
      : undefined,
  );
}

export const reportsRepository = {
  async findAccessContext(input: {
    userId: string;
    orgId: string;
  }): Promise<AnalyticsAccessContext | null> {
    const [row] = await db
      .select({
        memberId: schema.member.id,
        role: schema.member.role,
        frozen: schema.member.frozen,
        tier: schema.subscription.planTier,
        lifecycleState: schema.subscription.subscriptionState,
        currentPeriodEnd: schema.subscription.currentPeriodEnd,
      })
      .from(schema.member)
      .leftJoin(
        schema.subscription,
        eq(schema.subscription.organizationId, schema.member.organizationId),
      )
      .where(
        and(eq(schema.member.userId, input.userId), eq(schema.member.organizationId, input.orgId)),
      )
      .limit(1);

    return row ?? null;
  },

  async listActiveProfiles(orgId: string): Promise<AnalyticsProfileContext[]> {
    return db
      .select({
        profileId: schema.designerProfile.id,
        teamId: schema.team.id,
        teamName: schema.team.name,
      })
      .from(schema.designerProfile)
      .innerJoin(schema.team, eq(schema.team.id, schema.designerProfile.teamId))
      .where(and(eq(schema.designerProfile.orgId, orgId), eq(schema.team.frozen, false)))
      .orderBy(schema.team.createdAt, schema.team.id);
  },

  async listFrozenBranches(orgId: string): Promise<FrozenBranchRecord[]> {
    const rows = await db
      .select({
        branchId: schema.team.id,
        name: schema.team.name,
        frozenAt: schema.team.frozenAt,
        freezeRank: schema.team.freezeRank,
      })
      .from(schema.team)
      .where(and(eq(schema.team.organizationId, orgId), eq(schema.team.frozen, true)))
      .orderBy(schema.team.freezeRank, schema.team.createdAt, schema.team.id);
    return rows.filter(
      (row): row is FrozenBranchRecord => row.frozenAt !== null && row.freezeRank !== null,
    );
  },

  async countProjectsByStatus(input: AnalyticsDataScope): Promise<AnalyticsProjectStatusCount[]> {
    return db
      .select({
        status: schema.project.status,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.project)
      .where(projectScope(input))
      .groupBy(schema.project.status);
  },

  async countLeadsByStatus(input: {
    scope: AnalyticsDataScope;
    from: Date;
    to: Date;
  }): Promise<AnalyticsLeadStatusCount[]> {
    const query = db
      .select({
        status: schema.lead.status,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.lead);
    const scoped = input.scope.responsibleMemberId
      ? query.innerJoin(schema.project, eq(schema.project.id, schema.lead.referredProjectId))
      : query;
    return scoped
      .where(
        and(
          eq(schema.lead.organizationId, input.scope.orgId),
          inArray(schema.lead.teamId, input.scope.teamIds),
          input.scope.responsibleMemberId ? projectScope(input.scope) : undefined,
          gte(schema.lead.receivedAt, input.from),
          lte(schema.lead.receivedAt, input.to),
        ),
      )
      .groupBy(schema.lead.status);
  },

  async countProjectsCreatedByDay(input: {
    scope: AnalyticsDataScope;
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
          projectScope(input.scope),
          sql<boolean>`${schema.project.createdAt} >= ${input.from}`,
          sql<boolean>`${schema.project.createdAt} <= ${input.to}`,
        ),
      )
      .groupBy(day)
      .orderBy(day);
  },

  async countLeadsReceivedByDay(input: {
    scope: AnalyticsDataScope;
    from: Date;
    to: Date;
  }): Promise<AnalyticsDailyCount[]> {
    const day = sql<string>`to_char(date_trunc('day', ${schema.lead.receivedAt} at time zone 'Asia/Kolkata'), 'YYYY-MM-DD')`;
    const query = db
      .select({
        date: day,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.lead);
    const scoped = input.scope.responsibleMemberId
      ? query.innerJoin(schema.project, eq(schema.project.id, schema.lead.referredProjectId))
      : query;
    return scoped
      .where(
        and(
          eq(schema.lead.organizationId, input.scope.orgId),
          inArray(schema.lead.teamId, input.scope.teamIds),
          input.scope.responsibleMemberId ? projectScope(input.scope) : undefined,
          sql<boolean>`${schema.lead.receivedAt} >= ${input.from}`,
          sql<boolean>`${schema.lead.receivedAt} <= ${input.to}`,
        ),
      )
      .groupBy(day)
      .orderBy(day);
  },

  async countViewsByDay(input: {
    scope: AnalyticsDataScope;
    from: Date;
    to: Date;
  }): Promise<AnalyticsViewDailyCount[]> {
    const day = sql<string>`to_char(date_trunc('day', ${schema.interactionEvent.createdAt} at time zone 'Asia/Kolkata'), 'YYYY-MM-DD')`;
    const [profileViews, projectViews] = await Promise.all([
      input.scope.responsibleMemberId
        ? Promise.resolve([])
        : db
            .select({
              type: schema.interactionEvent.type,
              date: day,
              count: sql<number>`count(*)::int`,
            })
            .from(schema.interactionEvent)
            .where(
              and(
                eq(schema.interactionEvent.type, INTERACTION_EVENT_TYPE.PROFILE_VIEW),
                inArray(schema.interactionEvent.designerProfileId, input.scope.profileIds),
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
            projectScope(input.scope),
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
    scope: AnalyticsDataScope;
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
            projectScope(input.scope),
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
            projectScope(input.scope),
            eq(schema.lead.organizationId, input.scope.orgId),
            inArray(schema.lead.teamId, input.scope.teamIds),
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
    scope: AnalyticsDataScope;
    from: Date;
    to: Date;
  }): Promise<AnalyticsAcquisitionSource[]> {
    const query = db
      .select({
        source: schema.lead.source,
        enquiries: sql<number>`count(*)::int`,
        conversions: sql<number>`count(*) filter (where ${schema.lead.status} in ('contacted', 'closed'))::int`,
      })
      .from(schema.lead);
    const scoped = input.scope.responsibleMemberId
      ? query.innerJoin(schema.project, eq(schema.project.id, schema.lead.referredProjectId))
      : query;
    return scoped
      .where(
        and(
          eq(schema.lead.organizationId, input.scope.orgId),
          inArray(schema.lead.teamId, input.scope.teamIds),
          input.scope.responsibleMemberId ? projectScope(input.scope) : undefined,
          gte(schema.lead.receivedAt, input.from),
          lte(schema.lead.receivedAt, input.to),
        ),
      )
      .groupBy(schema.lead.source)
      .orderBy(desc(sql`count(*)`))
      .limit(4);
  },

  async getBillingAnalytics(input: {
    orgId: string;
    from: Date;
    to: Date;
  }): Promise<BillingCurrencyAnalyticsRecord[]> {
    return db
      .select({
        currency: schema.paymentTransaction.currency,
        capturedAmount: sql<number>`coalesce(sum(${schema.paymentTransaction.amount}) filter (where ${schema.paymentTransaction.status} = 'captured'), 0)::double precision`,
        failedAmount: sql<number>`coalesce(sum(${schema.paymentTransaction.amount}) filter (where ${schema.paymentTransaction.status} = 'failed'), 0)::double precision`,
        transactionCount: sql<number>`count(*)::int`,
        capturedTransactions: sql<number>`count(*) filter (where ${schema.paymentTransaction.status} = 'captured')::int`,
        failedTransactions: sql<number>`count(*) filter (where ${schema.paymentTransaction.status} = 'failed')::int`,
      })
      .from(schema.paymentTransaction)
      .innerJoin(
        schema.subscription,
        eq(schema.subscription.id, schema.paymentTransaction.subscriptionId),
      )
      .where(
        and(
          eq(schema.subscription.organizationId, input.orgId),
          gte(schema.paymentTransaction.createdAt, input.from),
          lte(schema.paymentTransaction.createdAt, input.to),
        ),
      )
      .groupBy(schema.paymentTransaction.currency)
      .orderBy(schema.paymentTransaction.currency);
  },

  async getBranchBreakdown(input: {
    orgId: string;
    from: Date;
    to: Date;
  }): Promise<BranchAnalyticsRecord[]> {
    return db
      .select({
        branchId: schema.team.id,
        name: schema.team.name,
        projects: sql<number>`(
          select count(*)::int from project p
          where p.designer_id = ${schema.designerProfile.id}
        )`,
        enquiries: sql<number>`(
          select count(*)::int from lead l
          where l.team_id = ${schema.team.id}
            and l.received_at >= ${input.from}
            and l.received_at <= ${input.to}
        )`,
        conversions: sql<number>`(
          select count(*)::int from lead l
          where l.team_id = ${schema.team.id}
            and l.status in ('contacted', 'closed')
            and l.received_at >= ${input.from}
            and l.received_at <= ${input.to}
        )`,
        projectViews: sql<number>`(
          select count(*)::int
          from interaction_event ie
          inner join project p on p.id = ie.project_id
          where p.designer_id = ${schema.designerProfile.id}
            and ie.type = ${INTERACTION_EVENT_TYPE.PROJECT_VIEW}
            and ie.created_at >= ${input.from}
            and ie.created_at <= ${input.to}
        )`,
        profileViews: sql<number>`(
          select count(*)::int from interaction_event ie
          where ie.designer_profile_id = ${schema.designerProfile.id}
            and ie.type = ${INTERACTION_EVENT_TYPE.PROFILE_VIEW}
            and ie.created_at >= ${input.from}
            and ie.created_at <= ${input.to}
        )`,
      })
      .from(schema.team)
      .innerJoin(schema.designerProfile, eq(schema.designerProfile.teamId, schema.team.id))
      .where(and(eq(schema.team.organizationId, input.orgId), eq(schema.team.frozen, false)))
      .orderBy(schema.team.createdAt, schema.team.id);
  },
};
