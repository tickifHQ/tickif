import type { AnalyticsQuery, AnalyticsResponse } from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import {
  reportsRepository,
  type AnalyticsDailyCount,
  type AnalyticsLeadStatusCount,
  type AnalyticsProjectStatusCount,
} from './repository.js';

type AnalyticsInput = {
  userId: string;
  orgId: string | null;
  query: AnalyticsQuery;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function countStatus<T extends { status: string; count: number }>(counts: T[], status: string) {
  return counts.find((item) => item.status === status)?.count ?? 0;
}

function totalCounts(counts: Array<{ count: number }>) {
  return counts.reduce((sum, item) => sum + item.count, 0);
}

function utcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function activitySeries(input: {
  days: number;
  from: Date;
  projects: AnalyticsDailyCount[];
  leads: AnalyticsDailyCount[];
}): AnalyticsResponse['activity'] {
  const projectsByDate = new Map(input.projects.map((item) => [item.date, item.count]));
  const leadsByDate = new Map(input.leads.map((item) => [item.date, item.count]));

  return Array.from({ length: input.days }, (_, index) => {
    const date = utcDateKey(new Date(input.from.getTime() + index * DAY_MS));
    return {
      date,
      projectsCreated: projectsByDate.get(date) ?? 0,
      leadsReceived: leadsByDate.get(date) ?? 0,
    };
  });
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
    const from = startOfUtcDay(new Date(to.getTime() - (input.query.days - 1) * DAY_MS));
    const [projectCounts, leadCounts, projectActivity, leadActivity] = await Promise.all([
      reportsRepository.countProjectsByStatus(profile.profileId),
      reportsRepository.countLeadsByStatus(profile.orgId),
      reportsRepository.countProjectsCreatedByDay({ profileId: profile.profileId, from, to }),
      reportsRepository.countLeadsReceivedByDay({ orgId: profile.orgId, from, to }),
    ]);

    return {
      window: {
        days: input.query.days,
        from: from.toISOString(),
        to: to.toISOString(),
      },
      projects: projectMetrics(projectCounts),
      leads: leadMetrics(leadCounts),
      activity: activitySeries({
        days: input.query.days,
        from,
        projects: projectActivity,
        leads: leadActivity,
      }),
      deferredMetrics: [
        {
          key: 'profileViews',
          label: 'Profile views',
          reason: 'Requires the Phase 3 interaction event pipeline.',
        },
        {
          key: 'projectViews',
          label: 'Project views',
          reason: 'Requires the Phase 3 interaction event pipeline.',
        },
      ],
    };
  },
};
