import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AnalyticsResponse, ProfileCompletionResponse } from '@repo/contracts';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/table';
import { cn } from '@repo/ui/lib/utils';
import {
  ArrowRight,
  CircleAlert,
  Ellipsis,
  Eye,
  Minus,
  Moon,
  TrendingDown,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { AnalyticsDataTable } from '@/components/analytics-data-table';
import { AnalyticsDateRangeControl } from '@/components/analytics-date-range-control';
import {
  EnquiryFunnelChart,
  ProfileStrengthChart,
  ProjectViewsChart,
} from '@/components/designer-analytics-charts';

type DesignerAnalyticsDashboardProps = {
  analytics: AnalyticsResponse | null;
  error?: string | null;
  profileCompletion?: ProfileCompletionResponse | null;
};

type MetricCardProps = {
  label: ReactNode;
  value: string;
  current: number;
  previous: number;
  days: number;
  comparisonUnit?: 'count' | 'percentage-points';
  icon: typeof Eye;
};

type EngagementMetric = {
  label: string;
  value: number;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IN').format(value);
}

function formatSigned(value: number, maximumFractionDigits = 0) {
  const formatted = new Intl.NumberFormat('en-IN', { maximumFractionDigits }).format(
    Math.abs(value),
  );
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function MetricCard({
  label,
  value,
  current,
  previous,
  days,
  comparisonUnit = 'count',
  icon: Icon,
}: MetricCardProps) {
  const delta = current - previous;
  const percentageChange = previous === 0 ? null : (delta / previous) * 100;
  const TrendIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const helper =
    previous === 0
      ? current === 0
        ? `No activity in either ${days}-day period`
        : `No activity in the prior ${days} days`
      : `${formatSigned(delta, comparisonUnit === 'percentage-points' ? 1 : 0)} compared to prior ${days} days`;

  return (
    <Card radius="lg" className="min-w-0 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 font-mono text-xs font-medium tracking-tight text-muted-foreground uppercase">
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex min-w-0 items-center gap-1 truncate">{label}</span>
        </div>
        <span
          className={cn(
            'flex shrink-0 items-center gap-1 text-xs',
            delta > 0 && 'text-success',
            delta < 0 && 'text-destructive',
            delta === 0 && 'text-muted-foreground',
          )}
        >
          <TrendIcon className="size-3" aria-hidden="true" />
          {percentageChange === null
            ? current === 0
              ? '—'
              : 'New'
            : `${formatSigned(percentageChange)}%`}
        </span>
      </div>
      <div className="mt-2 text-2xl leading-tight font-medium tracking-tight text-foreground">
        {value}
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">{helper}</p>
    </Card>
  );
}

function AnalyticsControls({ analytics }: { analytics: AnalyticsResponse }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <AnalyticsDateRangeControl {...analytics.window} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="More analytics options"
          >
            <Ellipsis className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href="/designer/projects">View projects</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/designer/leads">View enquiries</Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function formatSlug(value: string) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function TopConvertingProjects({
  projects,
}: {
  projects: AnalyticsResponse['topConvertingProjects'];
}) {
  return (
    <Card radius="lg" className="h-full px-4 py-5">
      <h2 className="font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Top converting projects
      </h2>
      <div className="mt-3">
        <AnalyticsDataTable>
          <colgroup>
            <col />
            <col className="w-16" />
            <col className="w-20" />
            <col className="w-24" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead className="text-right">Views</TableHead>
              <TableHead className="text-right">Enquiries</TableHead>
              <TableHead className="text-right">Conversions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-52 px-6 text-center text-xs leading-5 text-muted-foreground"
                >
                  Project performance will appear here after projects receive views and enquiries.
                </TableCell>
              </TableRow>
            ) : (
              projects.map((project) => {
                const location = [project.localitySlug, project.citySlug]
                  .filter((value): value is string => Boolean(value))
                  .map(formatSlug)
                  .join(', ');

                return (
                  <TableRow key={project.projectId}>
                    <TableCell>
                      <div className="min-w-0 space-y-0.5">
                        <Link
                          href={`/projects/${project.projectId}`}
                          className="block truncate text-sm leading-tight font-medium text-foreground hover:underline"
                        >
                          {project.title}
                        </Link>
                        {location ? (
                          <span className="block truncate text-xs leading-relaxed text-muted-foreground">
                            {location}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs leading-5 font-medium text-muted-foreground">
                      {formatNumber(project.views)}
                    </TableCell>
                    <TableCell className="text-right text-xs leading-5 font-medium text-muted-foreground">
                      {formatNumber(project.enquiries)}
                    </TableCell>
                    <TableCell className="text-right text-xs leading-5 font-medium text-success">
                      {formatNumber(project.conversions)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </AnalyticsDataTable>
      </div>
    </Card>
  );
}

function EngagementBreakdown({ metrics }: { metrics: EngagementMetric[] }) {
  const maximum = Math.max(...metrics.map((metric) => metric.value), 1);

  return (
    <Card radius="lg" className="px-4 py-5">
      <h2 className="font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Engagement breakdown
      </h2>
      <div className="mt-4 space-y-3">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="grid grid-cols-[8rem_minmax(0,1fr)_3rem] items-center gap-3"
          >
            <span className="text-xs text-muted-foreground">{metric.label}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${Math.max((metric.value / maximum) * 100, metric.value > 0 ? 3 : 0)}%`,
                }}
              />
            </div>
            <span className="text-right text-sm font-medium text-foreground">
              {formatNumber(metric.value)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

const acquisitionSourceLabels: Record<string, string> = {
  profile: 'Profile page',
  'project-enquiry': 'Project enquiry',
  referral: 'Referral',
  website: 'Website',
};

function AcquisitionSources({ sources }: { sources: AnalyticsResponse['acquisitionSources'] }) {
  const totalEnquiries = sources.reduce((total, source) => total + source.enquiries, 0);

  return (
    <Card radius="lg" className="px-4 py-5">
      <h2 className="font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase">
        How they found you
      </h2>
      <div className="mt-3">
        <AnalyticsDataTable>
          <colgroup>
            <col />
            <col className="w-24" />
            <col className="w-24" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Enquiry share</TableHead>
              <TableHead className="text-right">Conversion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="h-32 px-6 text-center text-xs leading-5 text-muted-foreground"
                >
                  Acquisition sources will appear here after enquiries arrive.
                </TableCell>
              </TableRow>
            ) : (
              sources.map((source) => {
                const enquiryShare =
                  totalEnquiries === 0 ? 0 : (source.enquiries / totalEnquiries) * 100;
                const conversionRate =
                  source.enquiries === 0 ? 0 : (source.conversions / source.enquiries) * 100;

                return (
                  <TableRow key={source.source}>
                    <TableCell className="truncate text-sm text-foreground">
                      {acquisitionSourceLabels[source.source] ?? formatSlug(source.source)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {enquiryShare.toFixed(0)}%
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium text-success">
                      {conversionRate.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </AnalyticsDataTable>
      </div>
    </Card>
  );
}

export function DesignerAnalyticsDashboard({
  analytics,
  error,
  profileCompletion = null,
}: DesignerAnalyticsDashboardProps) {
  if (!analytics) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-medium text-foreground">Analytics</h1>
        <Alert variant="destructive" className="mt-6 max-w-3xl">
          <CircleAlert />
          <AlertTitle>Could not load analytics</AlertTitle>
          <AlertDescription>
            <p>{error ?? 'Refresh the page and try again.'}</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href="/designer/analytics">Try again</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const respondedLeads = analytics.leads.contacted + analytics.leads.closed;
  const responseRate =
    analytics.leads.total === 0 ? 0 : (respondedLeads / analytics.leads.total) * 100;
  const enquiryRate =
    analytics.engagement.projectViews === 0
      ? 0
      : (analytics.leads.total / analytics.engagement.projectViews) * 100;
  const engagementMetrics: EngagementMetric[] = [
    { label: 'Project views', value: analytics.engagement.projectViews },
    { label: 'Profile views', value: analytics.engagement.profileViews },
    { label: 'Enquiries', value: analytics.leads.total },
    { label: 'Responded', value: respondedLeads },
  ];

  return (
    <div className="p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl leading-tight font-medium tracking-tight text-foreground">
            Analytics
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            How homeowners are discovering and engaging with your studio.
          </p>
        </div>
        <AnalyticsControls analytics={analytics} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Project views"
          value={formatNumber(analytics.engagement.projectViews)}
          current={analytics.engagement.projectViews}
          previous={analytics.previousPeriod.projectViews}
          days={analytics.window.days}
          icon={Eye}
        />
        <MetricCard
          label="Enquiries received"
          value={formatNumber(analytics.leads.total)}
          current={analytics.leads.total}
          previous={analytics.previousPeriod.enquiries}
          days={analytics.window.days}
          icon={UserRound}
        />
        <MetricCard
          label={
            <>
              <span>View</span>
              <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
              <span>Enquiry rate</span>
            </>
          }
          value={`${enquiryRate.toFixed(1)}%`}
          current={enquiryRate}
          previous={analytics.previousPeriod.viewToEnquiryRate}
          days={analytics.window.days}
          comparisonUnit="percentage-points"
          icon={UserRound}
        />
        <MetricCard
          label="Response rate"
          value={`${Math.round(responseRate)}%`}
          current={responseRate}
          previous={analytics.previousPeriod.responseRate}
          days={analytics.window.days}
          comparisonUnit="percentage-points"
          icon={UserRound}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card radius="lg" className="min-h-80 px-4 py-5">
          <ProjectViewsChart
            activity={analytics.activity}
            projectViews={analytics.engagement.projectViews}
          />
        </Card>
        <TopConvertingProjects projects={analytics.topConvertingProjects} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.82fr)]">
        <Card radius="lg" className="px-4 py-4">
          <div className="flex items-center gap-2 font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <Moon className="size-4 text-success" aria-hidden="true" />
            Insight
          </div>
          <p className="mt-2 text-lg leading-relaxed font-medium text-muted-foreground">
            Keep new enquiries moving by reviewing and responding from your lead inbox.
          </p>
          <div className="mt-4 border-t border-border pt-4">
            <EnquiryFunnelChart leads={analytics.leads} />
          </div>
        </Card>
        <Card radius="lg" className="px-4 py-5">
          <ProfileStrengthChart profileCompletion={profileCompletion} />
        </Card>
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,1fr)]">
        <EngagementBreakdown metrics={engagementMetrics} />
        <AcquisitionSources sources={analytics.acquisitionSources} />
      </div>
    </div>
  );
}
