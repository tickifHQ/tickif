'use client';

import type { AnalyticsResponse, ProfileCompletionResponse } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { ArrowRight, Shield } from 'lucide-react';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  PolarGrid,
  ResponsiveContainer,
  Surface,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts';

type AnalyticsChartsProps = {
  activity: AnalyticsResponse['activity'];
  projectViews: number;
  leads: AnalyticsResponse['leads'];
  profileCompletion: ProfileCompletionResponse | null;
};

const PROFILE_STRENGTH_SEGMENTS = 50;
const PROFILE_STRENGTH_ARC_DEGREES = 320;
const PROFILE_STRENGTH_START_ANGLE = 250;
const PROFILE_STRENGTH_ANGLES = Array.from(
  { length: PROFILE_STRENGTH_SEGMENTS },
  (_, index) =>
    PROFILE_STRENGTH_START_ANGLE -
    index * (PROFILE_STRENGTH_ARC_DEGREES / (PROFILE_STRENGTH_SEGMENTS - 1)),
);

const enquiryStages = [
  { key: 'new', label: 'New', color: 'var(--foreground)', markerClass: 'bg-foreground' },
  {
    key: 'contacted',
    label: 'Contacted',
    color: 'var(--chart-3)',
    markerClass: 'bg-chart-3',
  },
  { key: 'closed', label: 'Closed', color: 'var(--primary)', markerClass: 'bg-primary' },
  {
    key: 'spam',
    label: 'Spam',
    color: 'var(--muted-foreground)',
    markerClass: 'bg-muted-foreground',
  },
] as const;

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IN').format(value);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function ProjectViewsTooltip({ active, label, payload }: TooltipContentProps) {
  const value = payload?.[0]?.value;
  const viewCount = Number(value);
  if (!active || !label || !Number.isFinite(viewCount)) return null;

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
      <div className="text-muted-foreground">{formatDate(String(label))}</div>
      <div className="mt-1 font-medium">{formatNumber(viewCount)} project views</div>
    </div>
  );
}

function sampledLabels(activity: AnalyticsResponse['activity']) {
  const visibleCount = Math.min(8, activity.length);
  if (visibleCount === 0) return [];

  return Array.from({ length: visibleCount }, (_, index) => {
    const activityIndex =
      visibleCount === 1 ? 0 : Math.round((index * (activity.length - 1)) / (visibleCount - 1));
    const point = activity[activityIndex];
    return point ? formatDate(point.date) : '';
  });
}

export function ProjectViewsChart({
  activity,
  projectViews,
}: Pick<AnalyticsChartsProps, 'activity' | 'projectViews'>) {
  const hasViews = activity.some((point) => point.projectViews > 0);
  const labels = sampledLabels(activity);

  return (
    <section aria-labelledby="project-views-heading" className="h-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-2xl leading-tight font-medium tracking-tight text-foreground">
            {formatNumber(projectViews)}
          </div>
          <h2 id="project-views-heading" className="text-sm font-medium text-muted-foreground">
            Project views
          </h2>
        </div>
      </div>

      {hasViews ? (
        <div
          role="img"
          aria-label="Project views during the selected period"
          className="mt-5 h-44 w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={activity} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="project-views-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="4 5" vertical={false} />
              <XAxis dataKey="date" hide />
              <YAxis hide domain={[0, 'dataMax + 1']} />
              <Tooltip cursor={false} content={ProjectViewsTooltip} />
              <Area
                type="monotone"
                dataKey="projectViews"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#project-views-fill)"
                activeDot={{ r: 4, fill: 'var(--primary)', stroke: 'var(--card)', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-5 flex h-44 items-center justify-center border-y border-dashed border-border px-6 text-center text-xs text-muted-foreground">
          Project views will appear here as visitors explore your published work.
        </div>
      )}

      <div
        className="mt-4 grid text-center text-xs leading-relaxed text-muted-foreground"
        style={{ gridTemplateColumns: `repeat(${Math.max(labels.length, 1)}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {labels.map((label, index) => (
          <span key={`${label}-${index}`} className="truncate">
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}

export function ProfileStrengthChart({
  profileCompletion,
}: Pick<AnalyticsChartsProps, 'profileCompletion'>) {
  if (!profileCompletion) {
    return (
      <section aria-labelledby="profile-strength-heading" className="flex h-full flex-col">
        <h2
          id="profile-strength-heading"
          className="font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          Profile strength
        </h2>
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-muted-foreground">
          Profile strength is unavailable right now.
        </div>
      </section>
    );
  }

  const completedSegments = Math.round((profileCompletion.score / 100) * PROFILE_STRENGTH_SEGMENTS);
  const completedAngles = PROFILE_STRENGTH_ANGLES.slice(0, completedSegments);

  return (
    <section aria-labelledby="profile-strength-heading" className="flex h-full flex-col">
      <h2
        id="profile-strength-heading"
        className="font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        Profile strength
      </h2>
      <div
        role="img"
        aria-label={`Profile strength ${profileCompletion.score} out of 100`}
        className="relative mx-auto mt-2 size-52"
      >
        <ResponsiveContainer width="100%" height="100%">
          <Surface width={200} height={200} viewBox={{ x: 0, y: 0, width: 200, height: 200 }}>
            <PolarGrid
              cx={100}
              cy={100}
              innerRadius={70}
              outerRadius={84}
              polarAngles={PROFILE_STRENGTH_ANGLES}
              polarRadius={[]}
              stroke="var(--muted)"
              strokeWidth={6}
              strokeLinecap="round"
            />
            <PolarGrid
              cx={100}
              cy={100}
              innerRadius={70}
              outerRadius={84}
              polarAngles={completedAngles}
              polarRadius={[]}
              stroke="var(--primary)"
              strokeWidth={6}
              strokeLinecap="round"
            />
          </Surface>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Shield className="size-4" aria-hidden="true" />
          </span>
          <span className="mt-3 text-2xl font-medium tracking-tight text-foreground">
            {profileCompletion.score}/100
          </span>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm bg-primary" /> Complete
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm bg-muted" /> Needs attention
        </span>
      </div>
      <Button asChild variant="neutral" size="compact" className="mt-4 w-full">
        <Link href="/designer/profile">
          View checklist <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}

export function EnquiryFunnelChart({ leads }: Pick<AnalyticsChartsProps, 'leads'>) {
  const hasEnquiries = leads.total > 0;
  let precedingEnquiries = 0;
  const positionedStages = enquiryStages.map((stage) => {
    const value = leads[stage.key];
    const startPercentage = (precedingEnquiries / Math.max(leads.total, 1)) * 100;
    precedingEnquiries += value;
    return { ...stage, value, startPercentage };
  });

  return (
    <section aria-labelledby="enquiry-funnel-heading">
      <h2
        id="enquiry-funnel-heading"
        className="font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        Enquiry funnel
      </h2>
      <div className="mt-1 text-2xl leading-tight font-medium tracking-tight text-foreground">
        {formatNumber(leads.total)} total enquiries
      </div>

      {hasEnquiries ? (
        <>
          <div className="relative mt-5 h-10" aria-hidden="true">
            {positionedStages
              .filter((stage) => stage.value > 0)
              .map((stage) => (
                <div
                  key={stage.key}
                  data-enquiry-stage={stage.key}
                  className="absolute top-0 text-xs text-muted-foreground"
                  style={{ left: `${stage.startPercentage}%` }}
                >
                  <div>{stage.value}</div>
                  <div className="mt-2 h-5 border-l border-border" />
                </div>
              ))}
          </div>
          <div
            role="img"
            aria-label={`Enquiry funnel: ${leads.new} new, ${leads.contacted} contacted, ${leads.closed} closed, and ${leads.spam} spam`}
            className="h-4 w-full overflow-hidden rounded-sm"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[leads]}
                layout="vertical"
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                barGap={2}
              >
                <XAxis type="number" hide domain={[0, Math.max(leads.total, 1)]} />
                <YAxis type="category" hide />
                {enquiryStages.map((stage) => (
                  <Bar
                    key={stage.key}
                    dataKey={stage.key}
                    stackId="enquiries"
                    fill={stage.color}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {enquiryStages.map((stage) => (
              <span key={stage.key} className="inline-flex items-center gap-1">
                <span className={`size-2 rounded-sm ${stage.markerClass}`} />
                {stage.label}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-5 flex h-24 items-center justify-center border-y border-dashed border-border px-6 text-center text-xs text-muted-foreground">
          Enquiries will appear here when homeowners contact your studio.
        </div>
      )}
    </section>
  );
}
