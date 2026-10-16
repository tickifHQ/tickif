'use client';
import type { AdminReportResponse } from '@repo/contracts';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export function AdminEnquiryCohortChart({
  activity,
}: {
  activity: AdminReportResponse['activity'];
}) {
  if (!activity.some((day) => day.enquiries > 0))
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No enquiries were submitted in this reporting window.
      </p>
    );
  return (
    <div
      role="img"
      aria-label="Daily enquiry submission cohorts with recorded studio responses and pipeline progression. Exact values are in the daily report below."
      className="h-72 w-full min-w-0"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={activity}
          margin={{ top: 12, right: 8, bottom: 8, left: 0 }}
          accessibilityLayer
        >
          <CartesianGrid stroke="var(--border)" strokeDasharray="4 5" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(value: string) => value.slice(5)}
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            minTickGap={32}
          />
          <YAxis
            allowDecimals={false}
            width={36}
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--popover)',
              color: 'var(--popover-foreground)',
              borderColor: 'var(--border)',
              borderRadius: 'var(--radius)',
            }}
            cursor={{ fill: 'var(--accent)' }}
          />
          <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
          <Bar
            dataKey="enquiries"
            name="Submitted"
            fill="var(--chart-1)"
            isAnimationActive={false}
          />
          <Bar
            dataKey="responded"
            name="Studio response"
            fill="var(--chart-3)"
            isAnimationActive={false}
          />
          <Bar
            dataKey="progressed"
            name="Pipeline progressed"
            fill="var(--chart-4)"
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
