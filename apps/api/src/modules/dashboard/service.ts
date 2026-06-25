import type {
  DashboardOverviewAction,
  DashboardOverviewResponse,
  DashboardOverviewShareResponse,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { profilesService } from '../profiles/service.js';
import {
  dashboardRepository,
  type DashboardProfileContext,
  type DashboardProjectSummary,
  type ProjectStatusCount,
} from './repository.js';

const PUBLIC_PROFILE_PREFIX = '/d';
const REVIEW_SLA = '24-48 hours';

type OverviewInput = {
  userId: string;
  orgId: string | null;
};

function publicPath(orgSlug: string): string {
  return `${PUBLIC_PROFILE_PREFIX}/${orgSlug}`;
}

function copyText(orgSlug: string): string {
  return `tickif.in${publicPath(orgSlug)}`;
}

function hasProjectStatus(
  counts: ProjectStatusCount[],
  status: DashboardProjectSummary['status'],
): boolean {
  return counts.some((count) => count.status === status && count.count > 0);
}

function selectReviewProject(
  projects: DashboardProjectSummary[],
): DashboardProjectSummary | null {
  const priority: DashboardProjectSummary['status'][] = [
    'changes_requested',
    'submitted',
    'in_review',
    'rejected',
    'published',
    'draft',
  ];

  for (const status of priority) {
    const match = projects.find((project) => project.status === status);
    if (match) return match;
  }
  return null;
}

function buildProjectReview(
  projects: DashboardProjectSummary[],
  counts: ProjectStatusCount[],
): DashboardOverviewResponse['projectReview'] {
  const project = selectReviewProject(projects);

  if (!project) {
    return {
      status: 'no_project',
      title: 'We review your project',
      description: 'Upload your first project to start the human review.',
      sla: null,
      project: null,
    };
  }

  if (project.status === 'changes_requested') {
    return {
      status: 'changes_requested',
      title: 'Changes requested',
      description: 'Make the requested edits and resubmit your project.',
      sla: null,
      project: serializeProject(project),
    };
  }

  if (project.status === 'submitted') {
    return {
      status: 'pending_review',
      title: 'We review your project',
      description: 'A human check, usually within 24-48 hours.',
      sla: REVIEW_SLA,
      project: serializeProject(project),
    };
  }

  if (project.status === 'in_review') {
    return {
      status: 'in_review',
      title: 'Review in progress',
      description: 'A human check is underway, usually within 24-48 hours.',
      sla: REVIEW_SLA,
      project: serializeProject(project),
    };
  }

  if (project.status === 'rejected') {
    return {
      status: 'rejected',
      title: 'Project not approved',
      description: 'Review the project status and upload a stronger portfolio piece.',
      sla: null,
      project: serializeProject(project),
    };
  }

  if (project.status === 'published' || hasProjectStatus(counts, 'published')) {
    const published = projects.find((item) => item.status === 'published') ?? project;
    return {
      status: 'published',
      title: 'Project reviewed',
      description: 'Your portfolio has at least one reviewed project.',
      sla: null,
      project: serializeProject(published),
    };
  }

  return {
    status: 'draft',
    title: 'We review your project',
    description: 'Submit your draft when the project details and images are ready.',
    sla: null,
    project: serializeProject(project),
  };
}

function serializeProject(
  project: DashboardProjectSummary,
): NonNullable<DashboardOverviewResponse['projectReview']['project']> {
  return {
    id: project.id,
    title: project.title,
    status: project.status,
    submittedAt: project.submittedAt?.toISOString() ?? null,
    updatedAt: project.updatedAt.toISOString(),
  };
}

function buildActions(input: {
  completion: DashboardOverviewResponse['profileCompletion'];
  review: DashboardOverviewResponse['projectReview'];
}): DashboardOverviewAction[] {
  const reviewStatus: DashboardOverviewAction['status'] =
    input.review.status === 'published'
      ? 'complete'
      : input.review.status === 'changes_requested' || input.review.status === 'rejected'
        ? 'attention'
        : input.review.status === 'pending_review' || input.review.status === 'in_review'
          ? 'current'
          : 'pending';

  return [
    {
      key: 'project-review',
      title: input.review.title,
      description: input.review.description,
      status: reviewStatus,
      href: input.review.project ? `/dashboard/projects/${input.review.project.id}` : '/dashboard/projects/new',
    },
    {
      key: 'complete-profile',
      title: 'Round out your profile',
      description: input.completion.score >= 100
        ? 'Your profile is ready for discovery.'
        : 'Add a bio and tags while you wait.',
      status: input.completion.score >= 100 ? 'complete' : 'current',
      href: '/dashboard/profile',
    },
  ];
}

function buildOverviewResponse(input: {
  profile: DashboardProfileContext;
  completion: DashboardOverviewResponse['profileCompletion'];
  projects: DashboardProjectSummary[];
  counts: ProjectStatusCount[];
}): DashboardOverviewResponse {
  const review = buildProjectReview(input.projects, input.counts);

  return {
    header: {
      title: `Welcome, ${input.profile.displayName}`,
      subtitle: "Let's get your profile ready to go live.",
    },
    studio: {
      profileId: input.profile.profileId,
      orgId: input.profile.orgId,
      orgSlug: input.profile.orgSlug,
      displayName: input.profile.displayName,
      location: input.profile.location,
      logoImageId: input.profile.logoImageId,
      status: input.profile.status,
      projectCount: input.profile.projectCount,
      avgRating: input.profile.avgRating,
      reviewCount: input.profile.reviewCount,
    },
    profileCompletion: input.completion,
    projectReview: review,
    actions: buildActions({ completion: input.completion, review }),
    portfolio: {
      eyebrow: 'One link. Everywhere.',
      title: 'A portfolio worth sharing.',
      description:
        "This is your living portfolio - every project, review, and profile signal in one shareable place.",
      displayName: input.profile.displayName,
      location: input.profile.location,
      publicPath: publicPath(input.profile.orgSlug),
      copyText: copyText(input.profile.orgSlug),
      shareCount: input.profile.shareCount,
    },
  };
}

export const dashboardService = {
  async getOverview(input: OverviewInput): Promise<DashboardOverviewResponse> {
    const profile = await dashboardRepository.findProfileContext(input);
    if (!profile) {
      throw AppError.forbidden('Designer profile required');
    }

    const [completion, projects, counts] = await Promise.all([
      profilesService.getCompletion(input),
      dashboardRepository.listRecentProjects(profile.profileId),
      dashboardRepository.countProjectsByStatus(profile.profileId),
    ]);

    return buildOverviewResponse({ profile, completion, projects, counts });
  },

  async recordPortfolioShare(input: OverviewInput): Promise<DashboardOverviewShareResponse> {
    const profile = await dashboardRepository.findProfileContext(input);
    if (!profile) {
      throw AppError.forbidden('Designer profile required');
    }

    const shareCount = await dashboardRepository.incrementShareCount(profile.profileId);
    if (shareCount === null) {
      throw AppError.notFound('Profile not found');
    }

    return {
      publicPath: publicPath(profile.orgSlug),
      copyText: copyText(profile.orgSlug),
      shareCount,
    };
  },
};
