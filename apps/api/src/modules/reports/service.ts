import {
  INTERACTION_EVENT_TYPE,
  type AnalyticsQuery,
  type AnalyticsResponse,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import {
  reportsRepository,
  type AnalyticsDailyCount,
  type AnalyticsLeadStatusCount,
  type AnalyticsProjectStatusCount,
  type AnalyticsViewDailyCount,
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

export const reportsService = {
  async getAnalytics(input: AnalyticsInput): Promise<AnalyticsResponse> {
    if (!input.orgId) {
      throw AppError.unprocessable('No active organization selected');
    }

    const profile = await reportsRepository.findProfileContext({
      userId: input.userId,
      orgId: input.orgId,
    });
    if (!profile) {
      throw AppError.forbidden('Designer profile required');
    }

    const to = new Date();
    const from = startOfIstDay(new Date(to.getTime() - (input.query.days - 1) * DAY_MS));
    // Shift both bounds equally to preserve elapsed length. The gap before `from` is intentional:
    // making these windows contiguous would compare a full prior window with a partial current day.
    const previousFrom = new Date(from.getTime() - input.query.days * DAY_MS);
    const previousTo = new Date(to.getTime() - input.query.days * DAY_MS);
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
    ] = await Promise.all([
      reportsRepository.countProjectsByStatus(profile.profileId),
      reportsRepository.countLeadsByStatus({ orgId: profile.orgId, from, to }),
      reportsRepository.countProjectsCreatedByDay({ profileId: profile.profileId, from, to }),
      reportsRepository.countLeadsReceivedByDay({ orgId: profile.orgId, from, to }),
      reportsRepository.countViewsByDay({ profileId: profile.profileId, from, to }),
      reportsRepository.findTopConvertingProjects({
        profileId: profile.profileId,
        orgId: profile.orgId,
        from,
        to,
      }),
      reportsRepository.countAcquisitionSources({ orgId: profile.orgId, from, to }),
      reportsRepository.countLeadsByStatus({
        orgId: profile.orgId,
        from: previousFrom,
        to: previousTo,
      }),
      reportsRepository.countViewsByDay({
        profileId: profile.profileId,
        from: previousFrom,
        to: previousTo,
      }),
    ]);

    const leads = leadMetrics(leadCounts);
    const engagement = engagementMetrics(viewActivity);

    return {
      window: {
        days: input.query.days,
        from: from.toISOString(),
        to: to.toISOString(),
      },
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
