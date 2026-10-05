import Image from 'next/image';
import Link from 'next/link';
import type {
  CompletionStep,
  ProjectListItem,
  ProfileCompletionResponse,
  ProfileDashboardResponse,
} from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import { CopyLinkButton } from '@/components/copy-link-button';
import { DashboardRightRailTransition } from '@/components/dashboard-right-rail-transition';
import { DesignerLogoAvatar } from '@/components/designer-logo-avatar';
import { InitialsAvatar } from '@/components/initials-avatar';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CircleCheck,
  Clock3,
  Copy,
  ExternalLink,
  Folders,
  ImagePlus,
  MessagesSquare,
  Plus,
  Shield,
  ShieldPlus,
  User,
} from 'lucide-react';

type OverviewChecklistItem = {
  key: string;
  title: string;
  description: string;
  done: boolean;
  action?: React.ReactNode;
};

type VerificationPrompt = {
  title: string;
  description: string;
};

type DashboardMetricCardProps = {
  label: string;
  value: number;
  href: string;
  metricKey: string;
  icon: React.ReactNode;
};

function DashboardMetricCard({ label, value, href, metricKey, icon }: DashboardMetricCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card
        radius="2xl"
        className="h-full p-4 transition-[border-color,box-shadow,transform] group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div data-metric={metricKey} className="text-2xl font-semibold text-foreground">
              {value}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">{label}</div>
          </div>
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </span>
        </div>
      </Card>
    </Link>
  );
}

function projectStatusLabel(status: ProjectListItem['status']) {
  switch (status) {
    case 'published':
      return 'Live';
    case 'submitted':
      return 'Submitted';
    case 'in_review':
      return 'In review';
    case 'changes_requested':
      return 'Needs changes';
    case 'rejected':
      return 'Rejected';
    case 'archived':
      return 'Archived';
    case 'delisted':
      return 'Delisted';
    case 'deleted':
      return 'Deleted';
    default:
      return 'Draft';
  }
}

function projectStatusVariant(status: ProjectListItem['status']) {
  if (status === 'published') return 'success' as const;
  if (status === 'submitted' || status === 'in_review') return 'warning' as const;
  if (status === 'changes_requested' || status === 'rejected' || status === 'deleted') {
    return 'destructive' as const;
  }
  return 'secondary' as const;
}

function formatProjectUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function canEditProject(status: ProjectListItem['status']) {
  return (
    status === 'published' ||
    status === 'draft' ||
    status === 'changes_requested' ||
    status === 'rejected'
  );
}

function RecentProjectRow({
  project,
  canWriteProjects,
}: {
  project: ProjectListItem;
  canWriteProjects: boolean;
}) {
  const liveWithPendingChanges = project.liveStatus === 'published' && project.pendingChanges;
  const content = (
    <>
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
        {project.coverImageUrl ? (
          <Image
            src={project.coverImageUrl}
            alt=""
            width={48}
            height={48}
            unoptimized
            className="size-full object-cover"
          />
        ) : (
          <ImagePlus className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{project.title}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {[project.locality, project.city, project.propertyType].filter(Boolean).join(' · ') ||
            'Project details pending'}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Badge
          variant={projectStatusVariant(liveWithPendingChanges ? 'published' : project.status)}
          size="compact"
        >
          {projectStatusLabel(liveWithPendingChanges ? 'published' : project.status)}
        </Badge>
        {liveWithPendingChanges ? (
          <span className="max-w-32 text-right text-xs text-muted-foreground">
            Pending changes · {projectStatusLabel(project.status)}
          </span>
        ) : null}
        <time dateTime={project.updatedAt} className="text-xs text-muted-foreground">
          {formatProjectUpdatedAt(project.updatedAt)}
        </time>
      </div>
    </>
  );

  if (!canWriteProjects || (!liveWithPendingChanges && !canEditProject(project.status))) {
    return <div className="flex items-center gap-3 px-4 py-3">{content}</div>;
  }

  return (
    <Link
      href={`/designer/projects/${project.id}/edit`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {content}
    </Link>
  );
}

function verificationPrompt(
  status: ProfileDashboardResponse['verificationStatus'],
): VerificationPrompt | null {
  switch (status) {
    case 'verified':
      return null;
    case 'pending':
      return {
        title: 'Verification in review',
        description: 'Track the review of your submitted documents.',
      };
    case 'rejected':
      return {
        title: 'Update verification',
        description: 'Review the requested changes and resubmit.',
      };
    case 'expired':
      return {
        title: 'Renew verification',
        description: 'Update your documents to restore verification.',
      };
    case 'draft':
      return {
        title: 'Continue verification',
        description: 'Finish preparing your verification application.',
      };
    default:
      return {
        title: 'Start verification',
        description: 'Get a head start on your KYC.',
      };
  }
}

function ChecklistStep({ item, isLast }: { item: OverviewChecklistItem; isLast: boolean }) {
  return (
    <li className="flex gap-3 py-4 last:pb-0">
      <div className="relative flex w-8 shrink-0 justify-center">
        {!isLast ? (
          <span
            aria-hidden="true"
            className="absolute top-8 -bottom-4 left-1/2 w-px -translate-x-1/2 bg-border"
          />
        ) : null}
        <span className="relative z-10 mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-border bg-background">
          {item.done ? (
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-success text-success-foreground">
              <Check className="size-3" />
            </span>
          ) : (
            <span className="size-2 rounded-full bg-muted-foreground/30" />
          )}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0 flex-1">
          <div
            className={
              item.done
                ? 'text-base font-semibold text-muted-foreground line-through'
                : 'text-base font-semibold text-foreground'
            }
          >
            {item.title}
          </div>
          <p className="mt-0.5 max-w-xl text-sm leading-5 text-muted-foreground">
            {item.description}
          </p>
        </div>
        {item.action ? <div className="sm:ml-auto sm:pt-1">{item.action}</div> : null}
      </div>
    </li>
  );
}

function RightRailInfoRow({
  icon,
  title,
  description,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="text-xs leading-4 text-muted-foreground">{description}</div>
      </div>
      {href ? <ArrowRight className="size-4 shrink-0 text-muted-foreground" /> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/50"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      {content}
    </div>
  );
}

export function DesignerDashboardOverview({
  studioName,
  studioLocation,
  logoUrl,
  portfolioUrl,
  portfolioPubliclyVisible = false,
  yearsExperience = null,
  projectCount = 0,
  dashboard,
  completion,
  recentProjects = [],
  recentProjectsError,
  dashboardError,
  workspaceKey,
  canWriteProjects = false,
  canEditOrganization = false,
  canManageVerification = false,
}: {
  studioName: string;
  studioLocation: string;
  logoUrl?: string | null;
  portfolioUrl: string;
  /**
   * E-278: whether `/d/{slug}` serves the portfolio right now (backend
   * `publiclyVisible`). The share card only exposes `portfolioUrl` as a
   * copyable/openable link when this is true; otherwise it shows a readiness
   * prompt so an unpublished/placeholder URL is never surfaced.
   */
  portfolioPubliclyVisible?: boolean;
  /**
   * E-324: proof stats surfaced on the dashboard portfolio card. Both are the
   * authoritative denormalized counters read from the `designer_profile` row
   * (via the already-fetched CurrentProfile) — never recomputed here.
   */
  yearsExperience?: number | null;
  projectCount?: number;
  dashboard: ProfileDashboardResponse;
  completion?: ProfileCompletionResponse | null;
  recentProjects?: ProjectListItem[];
  recentProjectsError?: string | null;
  dashboardError?: string | null;
  workspaceKey?: string;
  canWriteProjects?: boolean;
  canEditOrganization?: boolean;
  canManageVerification?: boolean;
}) {
  const portfolioBasicsDone = dashboard.portfolioBasicsComplete;
  const projectDone = completion
    ? completion.steps.some((step) => step.key === 'first-project-uploaded' && step.done)
    : dashboard.projects.total > 0;
  const verification = verificationPrompt(dashboard.verificationStatus);
  const nextStepsDone = portfolioBasicsDone && verification === null;

  function checklistDescription(step: CompletionStep) {
    if (step.key === 'signed-in-with-google')
      return 'Use Google SSO so your designer workspace stays secure.';
    if (step.key === 'org-created') return 'Set up your workspace on Tickif.';
    if (step.key === 'profile-completed')
      return 'Add a cover, logo, display name, tagline, and bio to complete your portfolio.';
    if (step.key === 'first-project-uploaded')
      return 'Upload your first project to make your profile live and present it as a portfolio.';
    return 'Complete this step to keep your designer workspace moving.';
  }

  function checklistAction(step: CompletionStep) {
    if (step.done) return null;
    if (step.key === 'profile-completed' && canEditOrganization) {
      return (
        <Button asChild variant="outline" size="compact">
          <Link href="/designer/portfolio">
            Manage portfolio
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      );
    }
    if (step.key === 'first-project-uploaded' && canWriteProjects) {
      return (
        <Button asChild variant="outline" size="compact">
          <Link href="/designer/projects/new">
            <Plus className="size-4" />
            Add new project
          </Link>
        </Button>
      );
    }
    return null;
  }

  const trackedChecklistItems: OverviewChecklistItem[] = completion
    ? completion.steps.map((step) => {
        const dashboardStep =
          step.key === 'profile-completed'
            ? { ...step, label: 'Complete portfolio basics', done: portfolioBasicsDone }
            : step;
        return {
          key: dashboardStep.key,
          title: dashboardStep.label,
          description: checklistDescription(dashboardStep),
          done: dashboardStep.done,
          action: checklistAction(dashboardStep),
        };
      })
    : [
        {
          key: 'account-creation',
          title: 'Account creation',
          description: 'Set up your workspace on Tickif.',
          done: true,
        },
        {
          key: 'first-project',
          title: 'Upload your first project',
          description:
            'Upload your first project to Tickif to make your profile live and present it as a portfolio.',
          done: projectDone,
          action:
            projectDone || !canWriteProjects ? null : (
              <Button asChild variant="outline" size="compact">
                <Link href="/designer/projects/new">
                  <Plus className="size-4" />
                  Add new project
                </Link>
              </Button>
            ),
        },
        {
          key: 'profile',
          title: 'Complete portfolio basics',
          description:
            'Add a cover, logo, display name, tagline, and bio to complete your portfolio.',
          done: portfolioBasicsDone,
          action:
            portfolioBasicsDone || !canEditOrganization ? null : (
              <Button asChild variant="outline" size="compact">
                <Link href="/designer/portfolio">
                  Manage portfolio
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ),
        },
      ];
  const hasTrackedSteps = trackedChecklistItems.length > 0;
  const trackedChecklistComplete =
    hasTrackedSteps && trackedChecklistItems.every((item) => item.done);
  const checklistProgressScore = hasTrackedSteps
    ? Math.round(
        (trackedChecklistItems.filter((item) => item.done).length / trackedChecklistItems.length) *
          100,
      )
    : dashboard.profileCompletion.score;

  const portfolioShareCard = (
    <Card variant="accent" radius="2xl" className="overflow-hidden">
      <div className="px-4 pt-4">
        <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm -rotate-2">
          <div className="relative h-24 overflow-hidden bg-[linear-gradient(135deg,var(--muted),var(--background))]">
            {dashboard.heroCoverUrl ? (
              <Image
                src={dashboard.heroCoverUrl}
                alt={`${studioName} portfolio cover`}
                fill
                unoptimized
                loading="eager"
                sizes="(max-width: 1024px) 100vw, 22rem"
                className="object-cover"
              />
            ) : null}
          </div>
          <div className="space-y-2 px-4 py-3 text-center">
            <DesignerLogoAvatar
              testId="dashboard-preview-logo"
              logoUrl={logoUrl}
              alt={`${studioName} logo`}
              sizePx={48}
              className="relative z-10 mx-auto -mt-8 size-12 bg-primary/10 shadow-sm"
              fallback={
                <InitialsAvatar
                  seed={studioName}
                  fallbackSeed={studioLocation}
                  alt={`${studioName} generated profile initials`}
                  size={48}
                />
              }
            />
            <div>
              <div className="text-base font-medium text-foreground">{studioName}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{studioLocation}</div>
            </div>
            {portfolioPubliclyVisible ? (
              <dl className="grid grid-cols-2 divide-x divide-border rounded-lg border border-border bg-background/60 px-2 py-2.5">
                <div>
                  <dd className="text-lg font-semibold tabular-nums text-foreground">
                    {yearsExperience ?? '—'}
                  </dd>
                  <dt className="mt-1 text-[11px] text-muted-foreground">
                    {yearsExperience === 1 ? 'Year experience' : 'Years experience'}
                  </dt>
                </div>
                <div>
                  <dd className="text-lg font-semibold tabular-nums text-foreground">
                    {projectCount}
                  </dd>
                  <dt className="mt-1 text-[11px] text-muted-foreground">
                    {projectCount === 1 ? 'Project' : 'Projects'}
                  </dt>
                </div>
              </dl>
            ) : null}
            {portfolioPubliclyVisible ? (
              <div className="mx-auto inline-flex max-w-full items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
                <Copy className="size-3.5 shrink-0" />
                <span className="truncate">{portfolioUrl.replace('https://', '')}</span>
              </div>
            ) : (
              <div className="mx-auto inline-flex max-w-full items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                <span className="truncate">Not public yet</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="px-4 py-4">
        <div className="font-mono text-xs font-medium tracking-widest text-muted-foreground">
          ONE LINK. EVERYWHERE.
        </div>
        <div className="mt-2 text-2xl font-medium tracking-tight text-foreground">
          A portfolio worth <span className="text-primary">sharing.</span>
        </div>
        {portfolioPubliclyVisible ? (
          <>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Send it on WhatsApp, drop it in your Instagram bio, or print it on a card.
            </p>
            <Button asChild variant="fancy" size="fancy" className="mt-4 w-full">
              <a href={portfolioUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" />
                View portfolio
              </a>
            </Button>
            <CopyLinkButton
              value={portfolioUrl}
              variant="outline"
              size="fancy"
              className="mt-2 w-full cursor-pointer"
            />
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Finish your portfolio to unlock a public link you can share anywhere. We&apos;ll show
              it here the moment your page goes live.
            </p>
            {canEditOrganization ? (
              <Button asChild variant="fancy" size="fancy" className="mt-4 w-full">
                <Link href="/designer/portfolio">
                  Complete your portfolio
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );

  const rightRailSetupCard = canWriteProjects ? (
    <Card variant="accent" radius="2xl" className="relative overflow-visible">
      <div className="relative px-4 pt-4 pb-4">
        <Badge
          variant="outline"
          className="h-5 rounded-sm border-transparent bg-primary/10 px-1.5 py-0 font-mono text-xs font-medium tracking-widest text-primary"
        >
          COMPLETE SETUP
        </Badge>
        <div className="mt-3 text-base font-semibold tracking-normal text-foreground">
          Add your first project
        </div>
        <p className="mt-1.5 text-sm font-medium leading-5 text-muted-foreground">
          It goes public and gets indexed the moment your first project is approved. Usually 24–48
          hours.
        </p>
        <Button
          asChild
          size="compact"
          className="mt-4 w-full rounded-xl text-sm font-medium shadow-md"
        >
          <Link href="/designer/projects/new">
            <Plus className="size-4" />
            Add first project
          </Link>
        </Button>
      </div>
    </Card>
  ) : null;

  const rightRailNextStepsCard = (
    <div>
      <div className="mb-3 flex items-center gap-2 px-3 font-mono text-xs font-medium tracking-widest text-muted-foreground">
        <ShieldPlus className="size-4" />
        WHAT HAPPENS NEXT
      </div>
      <Card radius="2xl" className="overflow-hidden">
        <RightRailInfoRow
          icon={<CalendarDays className="size-4" />}
          title="We review your project"
          description="A human check, usually within 24–48 hours."
        />
        {!portfolioBasicsDone ? (
          <RightRailInfoRow
            icon={<User className="size-4" />}
            title="Round out your profile"
            description="Add a bio and tags while you wait."
            href={canEditOrganization ? '/designer/portfolio' : undefined}
          />
        ) : null}
        {verification ? (
          <RightRailInfoRow
            icon={<Shield className="size-4" />}
            title={verification.title}
            description={verification.description}
            href={canManageVerification ? '/designer/verification' : undefined}
          />
        ) : null}
      </Card>
    </div>
  );

  return (
    <div data-testid="designer-dashboard-overview" className="p-4 sm:p-5 lg:p-6">
      <div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Welcome, <span className="text-muted-foreground">{studioName}</span>
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {trackedChecklistComplete
              ? 'Manage your projects, enquiries, and portfolio performance.'
              : "Let's get your portfolio ready to go live."}
          </p>
        </div>
      </div>

      {dashboardError ? (
        <Card radius="2xl" className="mt-5 border-destructive/30 bg-destructive/5">
          <div className="px-5 py-4">
            <div className="text-base font-medium text-foreground">
              Could not load dashboard summary
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Refresh the page in a moment to try again.
            </p>
          </div>
        </Card>
      ) : null}

      {trackedChecklistComplete ? (
        <section data-testid="post-setup-overview" className="mt-5">
          <div className="grid gap-5 xl:grid-cols-3">
            <div className="min-w-0 space-y-5 xl:col-span-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <DashboardMetricCard
                  label="Total projects"
                  value={dashboard.projects.total}
                  href="/designer/projects"
                  metricKey="total-projects"
                  icon={<Folders className="size-5" />}
                />
                <DashboardMetricCard
                  label="Live projects"
                  value={dashboard.projects.published}
                  href="/designer/projects?status=published"
                  metricKey="live-projects"
                  icon={<CircleCheck className="size-5" />}
                />
                <DashboardMetricCard
                  label="In review"
                  value={dashboard.projects.inReview}
                  href="/designer/projects?status=in_review"
                  metricKey="in-review-projects"
                  icon={<Clock3 className="size-5" />}
                />
                <DashboardMetricCard
                  label="New enquiries"
                  value={dashboard.leads.new}
                  href="/designer/leads?status=new"
                  metricKey="new-enquiries"
                  icon={<MessagesSquare className="size-5" />}
                />
              </div>

              <Card radius="2xl" className="overflow-hidden">
                <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Recent projects</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Continue working on your latest portfolio updates.
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="compact">
                    <Link href="/designer/projects">
                      View all
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </div>

                {recentProjectsError ? (
                  <div className="px-4 py-8 text-center sm:px-5">
                    <p className="text-sm font-medium text-foreground">
                      Recent projects could not be loaded.
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Your projects are still available from the Projects page.
                    </p>
                  </div>
                ) : recentProjects.length > 0 ? (
                  <div className="divide-y divide-border">
                    {recentProjects.map((project) => (
                      <RecentProjectRow
                        key={project.id}
                        project={project}
                        canWriteProjects={canWriteProjects}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center sm:px-5">
                    <ImagePlus className="mx-auto size-6 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium text-foreground">
                      No recent projects yet
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Add a project to start building your portfolio.
                    </p>
                    {canWriteProjects ? (
                      <Button asChild size="compact" className="mt-4">
                        <Link href="/designer/projects/new">
                          <Plus className="size-4" />
                          Add project
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                )}
              </Card>

              <Card variant="muted" radius="2xl" className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <BarChart3 className="size-5" />
                    </span>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">
                        Understand what is working
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Review portfolio views, project performance, and enquiry trends.
                      </p>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="compact">
                    <Link href="/designer/analytics">
                      View analytics
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              </Card>
            </div>

            <DashboardRightRailTransition
              workspaceKey={workspaceKey ?? portfolioUrl}
              projectDone={projectDone}
              nextStepsDone={nextStepsDone}
              setupCard={rightRailSetupCard}
              nextStepsCard={rightRailNextStepsCard}
              shareCard={portfolioShareCard}
            />
          </div>
        </section>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-3">
          <div className="min-w-0 space-y-4 xl:col-span-2">
            <section
              aria-labelledby="profile-completion-heading"
              className="space-y-3 rounded-3xl bg-profile-completion-background px-2 pt-4 pb-2"
            >
              <div data-testid="profile-completion-progress" className="px-2 pt-1">
                <div className="flex items-end justify-between gap-4">
                  <h2
                    id="profile-completion-heading"
                    className="text-lg font-medium text-muted-foreground"
                  >
                    Complete portfolio
                  </h2>
                  <div className="text-lg font-medium text-primary">{checklistProgressScore}%</div>
                </div>
                <div
                  data-testid="profile-completion-progress-bar"
                  role="progressbar"
                  aria-label="Portfolio setup"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={checklistProgressScore}
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${checklistProgressScore}%` }}
                  />
                </div>
              </div>

              <Card radius="2xl" className="shadow-sm">
                <div className="px-5 pt-2 pb-4 sm:px-7">
                  <ol aria-label="Portfolio setup steps">
                    {trackedChecklistItems.map((item, index) => (
                      <ChecklistStep
                        key={item.key}
                        item={item}
                        isLast={index === trackedChecklistItems.length - 1}
                      />
                    ))}
                  </ol>
                </div>
              </Card>
            </section>
          </div>

          <DashboardRightRailTransition
            workspaceKey={workspaceKey ?? portfolioUrl}
            projectDone={projectDone || !canWriteProjects}
            nextStepsDone={nextStepsDone}
            setupCard={rightRailSetupCard}
            nextStepsCard={rightRailNextStepsCard}
            shareCard={portfolioShareCard}
          />
        </div>
      )}
    </div>
  );
}
