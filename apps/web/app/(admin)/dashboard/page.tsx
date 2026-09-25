import { headers } from 'next/headers';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/card';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { ArrowRight, MessageSquareWarning, ShieldUser, SquareChartGantt } from 'lucide-react';
import { fetchAdminModerationQueue } from '@/lib/admin-moderation-api';
import { fetchAdminReviews } from '@/lib/admin-review-api';
import { fetchAdminVerificationQueue } from '@/lib/admin-verification-api';
import {
  AdminDashboardCharts,
  type AdminDashboardChartData,
} from '@/components/admin-dashboard-charts';
import { AdminPlatformSummary } from '@/components/admin-platform-summary';
import { AdminSummaryLoadError } from '@/components/admin-summary-load-error';
import { AdminActivityAccessError, fetchAdminActivitySummary } from '@/lib/admin-activity-api';

export const metadata = {
  title: 'Admin dashboard · Tickif',
};

type QueueLink = { label: string; href: string; count: number };

type DashboardQueue = {
  title: string;
  description: string;
  href: string;
  count: number;
  icon: typeof SquareChartGantt;
  links: QueueLink[];
};

type DashboardData = {
  queues: DashboardQueue[];
  charts: AdminDashboardChartData;
};

async function loadDashboardData(cookie: string): Promise<DashboardData> {
  const [projects, newVerifications, reReviews, pendingReviews, disputedReviews] =
    await Promise.all([
      fetchAdminModerationQueue('submitted', 1, { headers: { cookie } }),
      fetchAdminVerificationQueue('new', 1, { headers: { cookie } }),
      fetchAdminVerificationQueue('re_review', 1, { headers: { cookie } }),
      fetchAdminReviews({ status: 'pending', page: 1, limit: 20 }, cookie),
      fetchAdminReviews({ status: 'disputed', page: 1, limit: 20 }, cookie),
    ]);

  return {
    queues: [
      {
        title: 'Project moderation',
        description: 'New project submissions waiting for an initial review.',
        href: '/moderation?status=submitted&page=1',
        count: projects.total,
        icon: SquareChartGantt,
        links: [
          {
            label: 'Awaiting review',
            href: '/moderation?status=submitted&page=1',
            count: projects.total,
          },
        ],
      },
      {
        title: 'Profile verification',
        description: 'Designer applications requiring an approval decision.',
        href: '/verifications',
        count: newVerifications.total + reReviews.total,
        icon: ShieldUser,
        links: [
          { label: 'New', href: '/verifications', count: newVerifications.total },
          {
            label: 'Re-review',
            href: '/verifications?tab=re_review',
            count: reReviews.total,
          },
        ],
      },
      {
        title: 'Review moderation',
        description: 'Community reviews and disputes that need attention.',
        href: '/review-moderation?status=pending&page=1',
        count: pendingReviews.total + disputedReviews.total,
        icon: MessageSquareWarning,
        links: [
          {
            label: 'Pending',
            href: '/review-moderation?status=pending&page=1',
            count: pendingReviews.total,
          },
          {
            label: 'Disputed',
            href: '/review-moderation?status=disputed&page=1',
            count: disputedReviews.total,
          },
        ],
      },
    ],
    charts: {
      projectModeration: projects.total,
      verificationNew: newVerifications.total,
      verificationReReview: reReviews.total,
      reviewsPending: pendingReviews.total,
      reviewsDisputed: disputedReviews.total,
    },
  };
}

export default async function AdminDashboardPage() {
  const cookie = (await headers()).get('cookie');

  if (!cookie) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <Alert variant="destructive">
          <AlertDescription>
            Your admin session could not be found. Please sign in again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const [dashboardResult, summaryResult] = await Promise.allSettled([
    loadDashboardData(cookie),
    fetchAdminActivitySummary(cookie),
  ]);
  const dashboard = dashboardResult.status === 'fulfilled' ? dashboardResult.value : null;
  const summary = summaryResult.status === 'fulfilled' ? summaryResult.value : null;
  const summaryError =
    summaryResult.status === 'rejected' && summaryResult.reason instanceof AdminActivityAccessError
      ? summaryResult.reason.message
      : 'Could not load the current platform totals. Retry without leaving the dashboard.';

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-primary">
          Tickif operations
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Admin dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Monitor platform activity, see the queues that need attention, and move into the next
          review.
        </p>
      </header>

      {summary ? (
        <AdminPlatformSummary summary={summary} />
      ) : (
        <AdminSummaryLoadError message={summaryError} />
      )}

      {dashboard ? (
        <>
          <section aria-label="Admin review queues" className="grid gap-4 md:grid-cols-3">
            {dashboard.queues.map((queue) => {
              const Icon = queue.icon;
              return (
                <Card key={queue.title} className="flex min-h-64 flex-col">
                  <CardHeader className="flex-row items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-5" aria-hidden="true" />
                      </div>
                      <CardTitle className="font-display text-xl">{queue.title}</CardTitle>
                    </div>
                    <span className="font-mono text-3xl font-semibold text-foreground">
                      {queue.count}
                    </span>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-between gap-5">
                    <div>
                      <p className="text-sm leading-6 text-muted-foreground">{queue.description}</p>
                      <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
                        {queue.links.map((link) => (
                          <li key={link.label}>
                            <Link
                              href={link.href}
                              className="flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                              <span>{link.label}</span>
                              <span className="font-mono text-muted-foreground">{link.count}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Link
                      href={queue.href}
                      className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                    >
                      Open queue
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </section>
          <AdminDashboardCharts data={dashboard.charts} />
        </>
      ) : (
        <Alert variant="destructive">
          <AlertDescription>
            Could not load the current queue totals. Open a queue directly or refresh the page.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
