import {
  ANALYTICS_SCOPE,
  INTERACTION_EVENT_TYPE,
  ORGANIZATION_ACCESS_SCOPE,
  ORGANIZATION_MEMBER_ROLE,
  analyticsScope,
  rbacEnabled,
  organizationMemberRoleSchema,
  type AnalyticsQuery,
  type AnalyticsResponse,
  type OrganizationAccessScope,
  type OrganizationMemberRole,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import {
  reportsRepository,
  type AnalyticsDailyCount,
  type AnalyticsLeadStatusCount,
  type AnalyticsProjectStatusCount,
  type AnalyticsViewDailyCount,
  type AnalyticsDataScope,
} from './repository.js';

type AnalyticsInput = {
  userId: string;
  orgId: string | null;
  query: AnalyticsQuery;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function countStatus<T extends { status: string; count: number }>(counts: T[], status: string) {
  return counts.find((item) => item.status === status)?.count ?? 0;
}

function totalCounts(counts: Array<{ count: number }>) {
  return counts.reduce((sum, item) => sum + item.count, 0);
}

function istDateKey(date: Date) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function startOfIstDay(date: Date) {
  const dateInIst = new Date(date.getTime() + IST_OFFSET_MS);
  return new Date(
    Date.UTC(dateInIst.getUTCFullYear(), dateInIst.getUTCMonth(), dateInIst.getUTCDate()) -
      IST_OFFSET_MS,
  );
}

function activitySeries(input: {
  days: number;
  from: Date;
  projects: AnalyticsDailyCount[];
  leads: AnalyticsDailyCount[];
  views: AnalyticsViewDailyCount[];
}): AnalyticsResponse['activity'] {
  const projectsByDate = new Map(input.projects.map((item) => [item.date, item.count]));
  const leadsByDate = new Map(input.leads.map((item) => [item.date, item.count]));
  const projectViewsByDate = new Map(
    input.views
      .filter((item) => item.type === INTERACTION_EVENT_TYPE.PROJECT_VIEW)
      .map((item) => [item.date, item.count]),
  );
  const profileViewsByDate = new Map(
    input.views
      .filter((item) => item.type === INTERACTION_EVENT_TYPE.PROFILE_VIEW)
      .map((item) => [item.date, item.count]),
  );

  return Array.from({ length: input.days }, (_, index) => {
    const date = istDateKey(new Date(input.from.getTime() + index * DAY_MS));
    return {
      date,
      projectsCreated: projectsByDate.get(date) ?? 0,
      leadsReceived: leadsByDate.get(date) ?? 0,
      projectViews: projectViewsByDate.get(date) ?? 0,
      profileViews: profileViewsByDate.get(date) ?? 0,
    };
  });
}

function engagementMetrics(counts: AnalyticsViewDailyCount[]): AnalyticsResponse['engagement'] {
  return counts.reduce<AnalyticsResponse['engagement']>(
    (totals, item) => {
      if (item.type === INTERACTION_EVENT_TYPE.PROJECT_VIEW) {
        totals.projectViews += item.count;
      } else {
        totals.profileViews += item.count;
      }
      return totals;
    },
    { projectViews: 0, profileViews: 0 },
  );
}

function projectMetrics(counts: AnalyticsProjectStatusCount[]): AnalyticsResponse['projects'] {
  return {
    total: totalCounts(counts),
    draft: countStatus(counts, 'draft'),
    submitted: countStatus(counts, 'submitted'),
    inReview: countStatus(counts, 'in_review'),
    published: countStatus(counts, 'published'),
    rejected: countStatus(counts, 'rejected'),
    changesRequested: countStatus(counts, 'changes_requested'),
  };
}

function leadMetrics(counts: AnalyticsLeadStatusCount[]): AnalyticsResponse['leads'] {
  return {
    total: totalCounts(counts),
    new: countStatus(counts, 'new'),
    contacted: countStatus(counts, 'contacted'),
    closed: countStatus(counts, 'closed'),
    spam: countStatus(counts, 'spam'),
  };
}

function periodMetrics(input: {
  leads: AnalyticsResponse['leads'];
  engagement: AnalyticsResponse['engagement'];
}): AnalyticsResponse['previousPeriod'] {
  const responded = input.leads.contacted + input.leads.closed;
  return {
    projectViews: input.engagement.projectViews,
    enquiries: input.leads.total,
    viewToEnquiryRate:
      input.engagement.projectViews === 0
        ? 0
        : (input.leads.total / input.engagement.projectViews) * 100,
    responseRate: input.leads.total === 0 ? 0 : (responded / input.leads.total) * 100,
  };
}

const EMPTY_PROJECTS = {
  total: 0,
  draft: 0,
  submitted: 0,
  inReview: 0,
  published: 0,
  rejected: 0,
  changesRequested: 0,
} as const;
const EMPTY_LEADS = {
  total: 0,
  new: 0,
  contacted: 0,
  closed: 0,
  spam: 0,
} as const;
const EMPTY_ENGAGEMENT = { projectViews: 0, profileViews: 0 } as const;

function roleScope(role: OrganizationMemberRole): OrganizationAccessScope {
  switch (role) {
    case ORGANIZATION_MEMBER_ROLE.BILLING_ADMIN:
      return ORGANIZATION_ACCESS_SCOPE.BILLING;
    case ORGANIZATION_MEMBER_ROLE.MEMBER:
      return ORGANIZATION_ACCESS_SCOPE.OWN;
    case ORGANIZATION_MEMBER_ROLE.VIEWER:
      return ORGANIZATION_ACCESS_SCOPE.ORGANIZATION;
    default:
      return ORGANIZATION_ACCESS_SCOPE.FULL;
  }
}

export const reportsService = {
  async getAnalytics(input: AnalyticsInput): Promise<AnalyticsResponse> {
    if (!input.orgId) {
      throw AppError.unprocessable('No active organization selected');
    }

    const context = await reportsRepository.findAccessContext({
      userId: input.userId,
      orgId: input.orgId,
    });
    if (!context || context.frozen) {
      throw AppError.forbidden('Active organization membership required');
    }

    const parsedRole = organizationMemberRoleSchema.safeParse(context.role);
    if (!parsedRole.success) throw AppError.forbidden('Valid organization role required');
    const role = parsedRole.data;
    const tier = context.tier ?? 'hobby';
    const lifecycleState = context.lifecycleState ?? 'active';
    const tierScope = analyticsScope(tier, lifecycleState);
    const accessScope =
      !rbacEnabled(tier, lifecycleState) && role !== ORGANIZATION_MEMBER_ROLE.OWNER
        ? ORGANIZATION_ACCESS_SCOPE.NONE
        : roleScope(role);
    if (accessScope === ORGANIZATION_ACCESS_SCOPE.NONE) {
      throw AppError.forbidden('Organization role does not allow analytics access');
    }
    const branchAccess =
      lifecycleState === 'locked'
        ? ('suspended' as const)
        : tierScope === ANALYTICS_SCOPE.BRANCH
          ? ('available' as const)
          : ('upgrade_required' as const);

    const to = new Date();
    const from = startOfIstDay(new Date(to.getTime() - (input.query.days - 1) * DAY_MS));
    // Shift both bounds equally to preserve elapsed length. The gap before `from` is intentional:
    // making these windows contiguous would compare a full prior window with a partial current day.
    const previousFrom = new Date(from.getTime() - input.query.days * DAY_MS);
    const previousTo = new Date(to.getTime() - input.query.days * DAY_MS);

    if (input.query.branchId && accessScope !== ORGANIZATION_ACCESS_SCOPE.FULL) {
      throw AppError.forbidden('This organization role only has organization-level analytics');
    }
    if (input.query.branchId && branchAccess === 'suspended') {
      throw AppError.forbidden('Branch analytics are suspended while the organization is locked');
    }
    if (input.query.branchId && branchAccess === 'upgrade_required') {
      throw new AppError(
        'ANALYTICS_BRANCH_REQUIRES_CORPORATE',
        'Upgrade to Corporate to access branch analytics',
        402,
      );
    }

    const accessBase = {
      tier,
      lifecycleState,
      tierScope,
      level: input.query.branchId ? ('branch' as const) : ('organization' as const),
      branchId: input.query.branchId ?? null,
      branchAccess,
    };

    if (accessScope === ORGANIZATION_ACCESS_SCOPE.BILLING) {
      const currencies = await reportsRepository.getBillingAnalytics({
        orgId: input.orgId,
        from,
        to,
      });
      return {
        dataset: 'billing',
        window: { days: input.query.days, from: from.toISOString(), to: to.toISOString() },
        access: {
          ...accessBase,
          role: ORGANIZATION_MEMBER_ROLE.BILLING_ADMIN,
          roleScope: ORGANIZATION_ACCESS_SCOPE.BILLING,
          readOnly: false,
          engagementVisible: false,
        },
        billing: {
          currencies,
          currentPeriodEnd: context.currentPeriodEnd?.toISOString() ?? null,
        },
        branches: [],
        frozenBranches: [],
        projects: EMPTY_PROJECTS,
        leads: EMPTY_LEADS,
        engagement: EMPTY_ENGAGEMENT,
        previousPeriod: {
          projectViews: 0,
          enquiries: 0,
          viewToEnquiryRate: 0,
          responseRate: 0,
        },
        activity: Array.from({ length: input.query.days }, (_, index) => ({
          date: istDateKey(new Date(from.getTime() + index * DAY_MS)),
          projectsCreated: 0 as const,
          leadsReceived: 0 as const,
          projectViews: 0 as const,
          profileViews: 0 as const,
        })),
        topConvertingProjects: [],
        acquisitionSources: [],
        deferredMetrics: [],
      };
    }

    const [activeProfiles, frozenBranchRows] = await Promise.all([
      reportsRepository.listActiveProfiles(input.orgId),
      accessScope === ORGANIZATION_ACCESS_SCOPE.FULL
        ? reportsRepository.listFrozenBranches(input.orgId)
        : Promise.resolve([]),
    ]);
    if (activeProfiles.length === 0) {
      throw AppError.forbidden('Active designer profile required');
    }
    const selectedProfiles = input.query.branchId
      ? activeProfiles.filter(({ teamId }) => teamId === input.query.branchId)
      : activeProfiles;
    if (selectedProfiles.length === 0) {
      throw AppError.notFound('Active branch not found');
    }

    const frozenBranches = frozenBranchRows.map((branch) => ({
      branchId: branch.branchId,
      name: branch.name,
      frozenAt: branch.frozenAt.toISOString(),
      freezeRank: branch.freezeRank,
    }));

    const access = (() => {
      switch (role) {
        case ORGANIZATION_MEMBER_ROLE.OWNER:
          return {
            ...accessBase,
            role,
            roleScope: ORGANIZATION_ACCESS_SCOPE.FULL,
            readOnly: false as const,
            engagementVisible: true as const,
          };
        case ORGANIZATION_MEMBER_ROLE.ADMIN:
          return {
            ...accessBase,
            role,
            roleScope: ORGANIZATION_ACCESS_SCOPE.FULL,
            readOnly: false as const,
            engagementVisible: true as const,
          };
        case ORGANIZATION_MEMBER_ROLE.MEMBER:
          return {
            ...accessBase,
            role,
            roleScope: ORGANIZATION_ACCESS_SCOPE.OWN,
            readOnly: false as const,
            engagementVisible: true as const,
          };
        case ORGANIZATION_MEMBER_ROLE.VIEWER:
          return {
            ...accessBase,
            role,
            roleScope: ORGANIZATION_ACCESS_SCOPE.ORGANIZATION,
            readOnly: true as const,
            engagementVisible: true as const,
          };
        case ORGANIZATION_MEMBER_ROLE.BILLING_ADMIN:
          throw AppError.forbidden('Billing analytics scope required');
      }
    })();

    const scope: AnalyticsDataScope = {
      orgId: input.orgId,
      profileIds: selectedProfiles.map(({ profileId }) => profileId),
      teamIds: selectedProfiles.map(({ teamId }) => teamId),
      ...(accessScope === ORGANIZATION_ACCESS_SCOPE.OWN
        ? { responsibleMemberId: context.memberId }
        : {}),
    };
    const [
      projectCounts,
      leadCounts,
      projectActivity,
      leadActivity,
      viewActivity,
      topConvertingProjects,
      acquisitionSources,
      previousLeadCounts,
      previousViewActivity,
      branches,
    ] = await Promise.all([
      reportsRepository.countProjectsByStatus(scope),
      reportsRepository.countLeadsByStatus({ scope, from, to }),
      reportsRepository.countProjectsCreatedByDay({ scope, from, to }),
      reportsRepository.countLeadsReceivedByDay({ scope, from, to }),
      reportsRepository.countViewsByDay({ scope, from, to }),
      reportsRepository.findTopConvertingProjects({ scope, from, to }),
      reportsRepository.countAcquisitionSources({ scope, from, to }),
      reportsRepository.countLeadsByStatus({
        scope,
        from: previousFrom,
        to: previousTo,
      }),
      reportsRepository.countViewsByDay({
        scope,
        from: previousFrom,
        to: previousTo,
      }),
      accessScope === ORGANIZATION_ACCESS_SCOPE.FULL &&
      branchAccess === 'available' &&
      !input.query.branchId
        ? reportsRepository.getBranchBreakdown({ orgId: input.orgId, from, to })
        : Promise.resolve([]),
    ]);

    const leads = leadMetrics(leadCounts);
    const engagement = engagementMetrics(viewActivity);

    return {
      dataset: 'engagement',
      window: {
        days: input.query.days,
        from: from.toISOString(),
        to: to.toISOString(),
      },
      access,
      billing: null,
      branches,
      frozenBranches,
      projects: projectMetrics(projectCounts),
      leads,
      engagement,
      previousPeriod: periodMetrics({
        leads: leadMetrics(previousLeadCounts),
        engagement: engagementMetrics(previousViewActivity),
      }),
      activity: activitySeries({
        days: input.query.days,
        from,
        projects: projectActivity,
        leads: leadActivity,
        views: viewActivity,
      }),
      topConvertingProjects,
      acquisitionSources,
      deferredMetrics: [],
    };
  },
};
