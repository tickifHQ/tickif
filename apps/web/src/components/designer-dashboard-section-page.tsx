import Link from 'next/link';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Card, CardContent } from '@repo/ui/components/card';
import type { ComponentType, ReactNode } from 'react';
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Star,
  UsersRound,
} from 'lucide-react';

type DashboardMetric = {
  label: string;
  value: string;
  helper: string;
};

type DashboardAction = {
  label: string;
  href: string;
};

type DashboardPageConfig = {
  eyebrow: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  badge: string;
  primaryAction?: DashboardAction;
  secondaryAction?: DashboardAction;
  metrics: DashboardMetric[];
  sections: Array<{
    title: string;
    description: string;
    icon: ComponentType<{ className?: string }>;
  }>;
  timeline: Array<{
    label: string;
    value: string;
  }>;
};

const pageConfigs = {
  consultations: {
    eyebrow: 'Consultations',
    title: 'Manage homeowner consultations',
    description: 'Track booked calls, prepare context before a meeting, and keep consultation follow-ups in one workspace.',
    icon: CalendarClock,
    badge: 'No consultations yet',
    primaryAction: { label: 'View leads', href: '/designer/leads' },
    secondaryAction: { label: 'Add project', href: '/designer/projects/new' },
    metrics: [
      { label: 'Upcoming', value: '0', helper: 'Booked consultations' },
      { label: 'Follow-ups', value: '0', helper: 'Waiting for reply' },
      { label: 'This week', value: '0', helper: 'Scheduled calls' },
    ],
    sections: [
      {
        title: 'Call queue',
        description: 'New homeowner requests will appear here with contact status and preferred timings.',
        icon: UsersRound,
      },
      {
        title: 'Meeting notes',
        description: 'Use lead context and project references to keep every consultation actionable.',
        icon: FileText,
      },
      {
        title: 'Follow-up reminders',
        description: 'Track who needs a callback after the first conversation.',
        icon: MessageSquareText,
      },
    ],
    timeline: [
      { label: 'First consultation source', value: 'Lead inbox' },
      { label: 'Primary next step', value: 'Publish projects' },
      { label: 'Recommended action', value: 'Keep profile complete' },
    ],
  },
  reviews: {
    eyebrow: 'Reviews',
    title: 'Collect and manage client reviews',
    description: 'Review requests, testimonials, and moderation status will be managed from this page.',
    icon: Star,
    badge: 'Reviews pending',
    primaryAction: { label: 'Update profile', href: '/designer/profile' },
    secondaryAction: { label: 'View projects', href: '/designer/projects' },
    metrics: [
      { label: 'Published', value: '0', helper: 'Visible reviews' },
      { label: 'Requests', value: '0', helper: 'Sent to clients' },
      { label: 'Average', value: '-', helper: 'Rating' },
    ],
    sections: [
      {
        title: 'Review requests',
        description: 'Send review links to clients once their projects are complete.',
        icon: MessageSquareText,
      },
      {
        title: 'Moderation',
        description: 'Approved reviews will be shown on your public designer profile.',
        icon: ShieldCheck,
      },
      {
        title: 'Profile proof',
        description: 'Strong testimonials help homeowners trust your studio faster.',
        icon: CheckCircle2,
      },
    ],
    timeline: [
      { label: 'Display surface', value: 'Public profile' },
      { label: 'Review source', value: 'Past clients' },
      { label: 'Status', value: 'Ready for first review' },
    ],
  },
  analytics: {
    eyebrow: 'Analytics',
    title: 'Understand portfolio performance',
    description: 'Monitor profile visits, project interest, and lead activity as your Tickif presence grows.',
    icon: BarChart3,
    badge: 'Early data',
    primaryAction: { label: 'View projects', href: '/designer/projects' },
    secondaryAction: { label: 'Share profile', href: '/designer/dashboard' },
    metrics: [
      { label: 'Profile views', value: '0', helper: 'Last 30 days' },
      { label: 'Project opens', value: '0', helper: 'Last 30 days' },
      { label: 'Leads', value: '0', helper: 'New enquiries' },
    ],
    sections: [
      {
        title: 'Traffic sources',
        description: 'See whether homeowners find you from Tickif discovery, shared links, or project pages.',
        icon: Sparkles,
      },
      {
        title: 'Project interest',
        description: 'Identify which projects are getting opened and shortlisted most often.',
        icon: BarChart3,
      },
      {
        title: 'Lead conversion',
        description: 'Track which profile actions turn into homeowner conversations.',
        icon: UsersRound,
      },
    ],
    timeline: [
      { label: 'Measurement window', value: '30 days' },
      { label: 'Primary signal', value: 'Profile engagement' },
      { label: 'Recommended action', value: 'Add more projects' },
    ],
  },
  'terms-roles': {
    eyebrow: 'Terms & roles',
    title: 'Control studio access and operating terms',
    description: 'Manage internal responsibilities, public-facing terms, and role expectations for your designer workspace.',
    icon: FileText,
    badge: 'Workspace owner',
    primaryAction: { label: 'Update profile', href: '/designer/profile' },
    secondaryAction: { label: 'Contact support', href: 'mailto:support@tickif.in' },
    metrics: [
      { label: 'Admins', value: '1', helper: 'Workspace owner' },
      { label: 'Roles', value: 'Owner', helper: 'Current access' },
      { label: 'Terms', value: 'Draft', helper: 'Profile status' },
    ],
    sections: [
      {
        title: 'Workspace roles',
        description: 'Keep ownership and team responsibilities clear before adding more collaborators.',
        icon: UsersRound,
      },
      {
        title: 'Client terms',
        description: 'Maintain public expectations for consultation, site visits, and project engagement.',
        icon: FileText,
      },
      {
        title: 'Support handoff',
        description: 'Escalate account or policy changes to Tickif support when needed.',
        icon: ShieldCheck,
      },
    ],
    timeline: [
      { label: 'Current role', value: 'Owner' },
      { label: 'Team support', value: 'Phase 2' },
      { label: 'Public terms', value: 'Profile-driven' },
    ],
  },
  'plan-billing': {
    eyebrow: 'Plan & billing',
    title: 'Track plan access and billing readiness',
    description: 'Your subscription, billing status, and plan capabilities will live here as billing rolls into the workspace.',
    icon: CircleDollarSign,
    badge: 'Phase 2 billing',
    primaryAction: { label: 'Contact support', href: 'mailto:support@tickif.in' },
    secondaryAction: { label: 'Back to overview', href: '/designer/dashboard' },
    metrics: [
      { label: 'Plan', value: 'Free', helper: 'Current tier' },
      { label: 'Billing', value: 'Not set', helper: 'Payment method' },
      { label: 'Renewal', value: '-', helper: 'No invoice yet' },
    ],
    sections: [
      {
        title: 'Current plan',
        description: 'See your active tier and the profile features currently available to your studio.',
        icon: CheckCircle2,
      },
      {
        title: 'Billing setup',
        description: 'Payment methods and invoices will be available once subscriptions are enabled.',
        icon: CircleDollarSign,
      },
      {
        title: 'Plan support',
        description: 'Ask Tickif support before making billing or account ownership changes.',
        icon: MessageSquareText,
      },
    ],
    timeline: [
      { label: 'Current tier', value: 'Free' },
      { label: 'Billing module', value: 'Phase 2' },
      { label: 'Upgrade path', value: 'Support assisted' },
    ],
  },
} satisfies Record<string, DashboardPageConfig>;

type DesignerDashboardSectionPageProps = {
  section: keyof typeof pageConfigs;
};

function ActionLink({ action, variant }: { action: DashboardAction; variant: 'default' | 'outline' }) {
  const isMailto = action.href.startsWith('mailto:');
  const content = (
    <>
      {action.label}
      <ArrowRight className="size-4" />
    </>
  );

  if (isMailto) {
    return (
      <Button asChild variant={variant}>
        <a href={action.href}>{content}</a>
      </Button>
    );
  }

  return (
    <Button asChild variant={variant}>
      <Link href={action.href}>{content}</Link>
    </Button>
  );
}

function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-52 items-end gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-4">
      {[38, 52, 44, 68, 58, 74, 63].map((height, index) => (
        <div key={`${height}-${index}`} className="flex h-full flex-1 items-end">
          <div
            className="w-full rounded-t-md bg-primary/25"
            style={{ height: `${height}%` }}
          />
        </div>
      ))}
      <div className="absolute sr-only">{children}</div>
    </div>
  );
}

export function DesignerDashboardSectionPage({ section }: DesignerDashboardSectionPageProps) {
  const config = pageConfigs[section];
  const Icon = config.icon;

  return (
    <div className="p-6 md:p-8 xl:p-10">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
            {config.eyebrow}
          </Badge>
          <div className="mt-5 flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="size-6" />
            </span>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                {config.title}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
                {config.description}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {config.secondaryAction ? <ActionLink action={config.secondaryAction} variant="outline" /> : null}
          {config.primaryAction ? <ActionLink action={config.primaryAction} variant="default" /> : null}
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {config.metrics.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="px-5 py-5">
              <div className="text-sm font-medium text-muted-foreground">{metric.label}</div>
              <div className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{metric.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{metric.helper}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardContent className="px-6 py-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">Workspace snapshot</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    This page is ready for live data once the matching backend surfaces are connected.
                  </p>
                </div>
                <Badge variant="secondary">{config.badge}</Badge>
              </div>
              <div className="relative mt-6">
                <EmptyChart>{config.title}</EmptyChart>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            {config.sections.map((item) => {
              const ItemIcon = item.icon;

              return (
                <Card key={item.title}>
                  <CardContent className="px-5 py-5">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <ItemIcon className="size-5" />
                    </span>
                    <h3 className="mt-4 text-base font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardContent className="px-5 py-5">
              <h2 className="text-base font-semibold text-foreground">Current setup</h2>
              <div className="mt-5 space-y-4">
                {config.timeline.map((item) => (
                  <div key={item.label} className="flex items-start justify-between gap-4 border-b border-border pb-4 last:border-b-0 last:pb-0">
                    <div className="text-sm text-muted-foreground">{item.label}</div>
                    <div className="text-right text-sm font-medium text-foreground">{item.value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary/5">
            <CardContent className="px-5 py-5">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles className="size-4" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Recommended next step</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Keep your portfolio current. The dashboard will become more useful as projects, leads, and profile data build up.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
