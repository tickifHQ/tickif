import Link from 'next/link';
import type { AdminActivitySummary } from '@repo/contracts';
import { Card, CardContent, CardHeader } from '@repo/ui/components/card';
import {
  ArrowUpRight,
  CircleUserRound,
  Eye,
  FolderSearch2,
  MessageSquareText,
  Search,
  UserCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

type SummaryMetric = {
  label: string;
  description: string;
  value: number;
  icon: LucideIcon;
  href?: string;
};

function formatCount(value: number) {
  return new Intl.NumberFormat('en-IN').format(value);
}

export function AdminPlatformSummary({ summary }: { summary: AdminActivitySummary }) {
  const metrics: SummaryMetric[] = [
    {
      label: 'Total accounts',
      description: 'All registered Tickif accounts.',
      value: summary.users,
      icon: UsersRound,
      href: '/users',
    },
    {
      label: 'Active accounts',
      description: 'Accounts currently marked with active status.',
      value: summary.activeUsers,
      icon: UserCheck,
      href: '/users?status=active',
    },
    {
      label: 'Total enquiries',
      description: 'All enquiries received across the platform.',
      value: summary.enquiries,
      icon: MessageSquareText,
      href: '/admin-enquiries',
    },
    {
      label: 'Open enquiries',
      description: 'Enquiries still awaiting resolution.',
      value: summary.openEnquiries,
      icon: CircleUserRound,
      href: '/admin-enquiries?status=open',
    },
    {
      label: 'Project views',
      description: 'Recorded views of published projects.',
      value: summary.projectViews,
      icon: FolderSearch2,
    },
    {
      label: 'Profile views',
      description: 'Recorded views of public designer profiles.',
      value: summary.profileViews,
      icon: Eye,
    },
    {
      label: 'Recorded searches',
      description: 'Retained authenticated, non-empty searches.',
      value: summary.searches,
      icon: Search,
    },
  ];

  return (
    <section aria-labelledby="platform-summary-heading" className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-primary">
          Platform totals
        </p>
        <h2 id="platform-summary-heading" className="mt-1 font-display text-2xl font-semibold">
          Platform summary
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          Current account, enquiry, view, and retained search totals. These are cumulative totals,
          not time-based trends.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const content = (
            <Card
              className={
                metric.href
                  ? 'h-full transition-colors hover:border-primary/40 hover:bg-accent/30'
                  : 'h-full'
              }
            >
              <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </div>
                {metric.href ? (
                  <ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" />
                ) : null}
              </CardHeader>
              <CardContent>
                <p className="font-mono text-3xl font-semibold text-foreground">
                  {formatCount(metric.value)}
                </p>
                <p className="mt-2 font-display text-base font-semibold leading-none tracking-tight">
                  {metric.label}
                </p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{metric.description}</p>
              </CardContent>
            </Card>
          );

          return metric.href ? (
            <Link
              key={metric.label}
              href={metric.href}
              className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={`${metric.label}: ${formatCount(metric.value)}`}
            >
              {content}
            </Link>
          ) : (
            <div key={metric.label}>{content}</div>
          );
        })}
      </div>
    </section>
  );
}
