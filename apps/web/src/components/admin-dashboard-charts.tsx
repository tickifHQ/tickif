'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/card';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts';

export type AdminDashboardChartData = {
  projectModeration: number;
  verificationNew: number;
  verificationReReview: number;
  reviewsPending: number;
  reviewsDisputed: number;
};

type QueueDatum = {
  label: string;
  count: number;
  fill: string;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IN').format(value);
}

function formatActiveItems(value: number) {
  return `${formatNumber(value)} active ${value === 1 ? 'item' : 'items'}`;
}

function QueueTooltip({ active, payload }: TooltipContentProps) {
  const datum = payload?.[0]?.payload as QueueDatum | undefined;
  if (!active || !datum) return null;

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
      <div className="text-muted-foreground">{datum.label}</div>
      <div className="mt-1 font-medium">{formatActiveItems(datum.count)}</div>
    </div>
  );
}

export function AdminDashboardCharts({ data }: { data: AdminDashboardChartData }) {
  const profileVerifications = data.verificationNew + data.verificationReReview;
  const reviewModeration = data.reviewsPending + data.reviewsDisputed;
  const total = data.projectModeration + profileVerifications + reviewModeration;
  const followUp = data.verificationReReview + data.reviewsDisputed;
  const firstPass = total - followUp;
  const followUpPercentage = total === 0 ? 0 : Math.round((followUp / total) * 100);
  const queueData: QueueDatum[] = [
    { label: 'Projects', count: data.projectModeration, fill: 'var(--chart-1)' },
    { label: 'Profiles', count: profileVerifications, fill: 'var(--chart-3)' },
    { label: 'Reviews', count: reviewModeration, fill: 'var(--chart-4)' },
  ];
  const pressureData = [
    { name: 'First pass', value: firstPass, fill: 'var(--chart-1)' },
    { name: 'Follow-up', value: followUp, fill: 'var(--chart-4)' },
  ].filter((slice) => slice.value > 0);

  return (
    <section aria-label="Admin queue insights" className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Queue insights</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          A live view of where review work is concentrated and how much needs another pass.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
        <Card role="region" aria-labelledby="queue-workload-heading">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle id="queue-workload-heading" className="font-display text-xl">
                Queue workload
              </CardTitle>
              <CardDescription className="mt-1">Open work grouped by review flow.</CardDescription>
            </div>
            <p className="shrink-0 font-mono text-sm font-medium text-foreground">
              {formatActiveItems(total)}
            </p>
          </CardHeader>
          <CardContent>
            {total > 0 ? (
              <div
                role="img"
                aria-label={`Queue workload: ${data.projectModeration} project moderation, ${profileVerifications} profile verification, and ${reviewModeration} review moderation items`}
                className="h-64 w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={queueData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="4 5" vertical={false} />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: '0.75rem' }}
                    />
                    <YAxis hide allowDecimals={false} domain={[0, 'dataMax + 1']} />
                    <Tooltip cursor={{ fill: 'var(--accent)' }} content={QueueTooltip} />
                    <Bar dataKey="count" isAnimationActive={false}>
                      {queueData.map((queue) => (
                        <Cell key={queue.label} fill={queue.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center border-y border-dashed border-border px-6 text-center text-sm text-muted-foreground">
                All review queues are clear.
              </div>
            )}
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-center">
              {queueData.map((queue) => (
                <div key={queue.label}>
                  <dt className="text-xs text-muted-foreground">{queue.label}</dt>
                  <dd className="mt-1 font-mono text-lg font-semibold">{queue.count}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card role="region" aria-labelledby="follow-up-pressure-heading">
          <CardHeader>
            <CardTitle id="follow-up-pressure-heading" className="font-display text-xl">
              Follow-up pressure
            </CardTitle>
            <CardDescription>
              Re-reviews and disputes compared with first-pass work.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {total > 0 ? (
              <div
                role="img"
                aria-label={`Follow-up pressure: ${followUp} of ${total} active items need follow-up`}
                className="relative mx-auto size-56"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pressureData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="72%"
                      outerRadius="94%"
                      paddingAngle={pressureData.length > 1 ? 2 : 0}
                      stroke={pressureData.length > 1 ? 'var(--card)' : 'none'}
                      strokeWidth={pressureData.length > 1 ? 3 : 0}
                      isAnimationActive={false}
                    >
                      {pressureData.map((slice) => (
                        <Cell key={slice.name} fill={slice.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="font-mono text-3xl font-semibold">{followUpPercentage}%</span>
                  <span className="mt-1 max-w-24 text-xs leading-5 text-muted-foreground">
                    need follow-up
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex h-56 items-center justify-center border-y border-dashed border-border px-6 text-center text-sm text-muted-foreground">
                No follow-up work is waiting.
              </div>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-center">
              <div>
                <dt className="text-xs text-muted-foreground">First pass</dt>
                <dd className="mt-1 font-mono text-lg font-semibold">{firstPass}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Follow-up</dt>
                <dd className="mt-1 font-mono text-lg font-semibold">{followUp}</dd>
              </div>
            </dl>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {formatNumber(followUp)} need follow-up
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
