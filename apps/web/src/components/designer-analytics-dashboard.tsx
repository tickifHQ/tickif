import Link from 'next/link';
import type { AnalyticsResponse } from '@repo/contracts';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  CircleAlert,
  Eye,
  FileUser,
  FolderCheck,
  RadioTower,
} from 'lucide-react';

type DesignerAnalyticsDashboardProps = {
  analytics: AnalyticsResponse | null;
  error?: string | null;
};

type StatusRow = {
  label: string;
  count: number;
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: number;
  helper: string;
  icon: typeof BriefcaseBusiness;
}) {
  return (
    <Card radius="2xl">
      <div className="flex items-start justify-between gap-4 px-5 py-5">
        <div>
          <div className="text-sm font-medium text-muted-foreground">{label}</div>
          <div className="mt-3 text-3xl font-semibold text-foreground">{value}</div>
          <div className="mt-1 text-sm text-muted-foreground">{helper}</div>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
      </div>
    </Card>
  );
}

function ActivityChart({ activity }: { activity: AnalyticsResponse['activity'] }) {
  const peak = Math.max(
    1,
    ...activity.map((point) => Math.max(point.projectsCreated, point.leadsReceived)),
  );
  const hasActivity = activity.some(
    (point) => point.projectsCreated > 0 || point.leadsReceived > 0,
  );

  if (!hasActivity) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
        <BarChart3 className="size-8 text-muted-foreground" />
        <h3 className="mt-4 text-base font-semibold text-foreground">No activity in this window</h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          New projects and homeowner enquiries will appear here as activity starts coming in.
        </p>
      </div>
    );
  }

  const middle = activity[Math.floor(activity.length / 2)];
  const first = activity[0];
  const last = activity.at(-1);

  return (
    <div
      role="img"
      aria-label="Daily projects created and leads received"
      className="rounded-xl border border-border bg-muted/10 px-4 pt-5 pb-3"
    >
      <div className="flex h-52 items-end gap-1" aria-hidden="true">
        {activity.map((point) => (
          <div
            key={point.date}
            title={`${formatDate(point.date)}: ${point.projectsCreated} projects, ${point.leadsReceived} leads`}
            className="flex h-full min-w-0 flex-1 items-end justify-center gap-px"
          >
            <span
              className="w-1/2 max-w-2 rounded-t-sm bg-chart-1"
              style={{
                height: `${(point.projectsCreated / peak) * 100}%`,
                minHeight: point.projectsCreated > 0 ? '0.25rem' : undefined,
              }}
            />
            <span
              className="w-1/2 max-w-2 rounded-t-sm bg-chart-3"
              style={{
                height: `${(point.leadsReceived / peak) * 100}%`,
                minHeight: point.leadsReceived > 0 ? '0.25rem' : undefined,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between text-xs text-muted-foreground" aria-hidden="true">
        <span>{first ? formatDate(first.date) : null}</span>
        <span>{middle ? formatDate(middle.date) : null}</span>
        <span>{last ? formatDate(last.date) : null}</span>
      </div>
      <ul className="sr-only">
        {activity.map((point) => (
          <li key={point.date}>
            {formatDate(point.date)}: {point.projectsCreated} projects created and{' '}
            {point.leadsReceived} leads received
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusBreakdown({
  title,
  total,
  rows,
}: {
  title: string;
  total: number;
  rows: StatusRow[];
}) {
  return (
    <Card radius="2xl">
      <div className="px-5 py-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <Badge variant="secondary">{total} total</Badge>
        </div>
        <div className="mt-5 space-y-4">
          {rows.map((row) => {
            const percentage = total === 0 ? 0 : Math.round((row.count / total) * 100);
            return (
              <div key={row.label}>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium text-foreground">{row.count}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export function DesignerAnalyticsDashboard({ analytics, error }: DesignerAnalyticsDashboardProps) {
  if (!analytics) {
    return (
      <div className="p-6 md:p-8 xl:p-10">
        <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
          Analytics
        </Badge>
        <h1 className="mt-5 text-3xl font-semibold text-foreground md:text-4xl">
          Understand portfolio performance
        </h1>
        <Alert variant="destructive" className="mt-8 max-w-3xl">
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

  const projectStatuses: StatusRow[] = [
    { label: 'Published', count: analytics.projects.published },
    { label: 'In review', count: analytics.projects.inReview },
    { label: 'Submitted', count: analytics.projects.submitted },
    { label: 'Draft', count: analytics.projects.draft },
    { label: 'Changes requested', count: analytics.projects.changesRequested },
    { label: 'Rejected', count: analytics.projects.rejected },
  ];
  const leadStatuses: StatusRow[] = [
    { label: 'New', count: analytics.leads.new },
    { label: 'Contacted', count: analytics.leads.contacted },
    { label: 'Closed', count: analytics.leads.closed },
    { label: 'Spam', count: analytics.leads.spam },
  ];

  return (
    <div className="p-6 md:p-8 xl:p-10">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
            Analytics
          </Badge>
          <div className="mt-5 flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BarChart3 className="size-6" />
            </span>
            <div>
              <h1 className="text-3xl font-semibold text-foreground md:text-4xl">
                Understand portfolio performance
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
                Track your project publishing and homeowner enquiry activity from real workspace
                data.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/designer/leads">
              View leads <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild>
            <Link href="/designer/projects">
              View projects <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total projects"
          value={analytics.projects.total}
          helper="All project statuses"
          icon={BriefcaseBusiness}
        />
        <MetricCard
          label="Published projects"
          value={analytics.projects.published}
          helper="Live in your portfolio"
          icon={FolderCheck}
        />
        <MetricCard
          label="Total leads"
          value={analytics.leads.total}
          helper="All homeowner enquiries"
          icon={FileUser}
        />
        <MetricCard
          label="New leads"
          value={analytics.leads.new}
          helper="Waiting for a response"
          icon={RadioTower}
        />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card radius="2xl">
            <div className="px-6 py-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Workspace activity</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Projects created and leads received over the last {analytics.window.days} days.
                  </p>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2 rounded-full bg-chart-1" /> Projects
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2 rounded-full bg-chart-3" /> Leads
                  </span>
                </div>
              </div>
              <div className="mt-6">
                <ActivityChart activity={analytics.activity} />
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <StatusBreakdown
              title="Project status"
              total={analytics.projects.total}
              rows={projectStatuses}
            />
            <StatusBreakdown
              title="Lead funnel"
              total={analytics.leads.total}
              rows={leadStatuses}
            />
          </div>
        </div>

        <aside>
          <Card radius="2xl">
            <div className="px-5 py-5">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Eye className="size-4" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Engagement metrics</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    View metrics need interaction events before they can be measured accurately.
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-4">
                {analytics.deferredMetrics.map((metric) => (
                  <div
                    key={metric.key}
                    className="border-t border-border pt-4 first:border-t-0 first:pt-0"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-foreground">{metric.label}</span>
                      <Badge variant="secondary">Coming soon</Badge>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{metric.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
