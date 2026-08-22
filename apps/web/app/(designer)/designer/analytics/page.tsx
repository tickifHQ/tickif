import { headers } from 'next/headers';
import { analyticsQuerySchema, analyticsResponseSchema } from '@repo/contracts';
import { DesignerAnalyticsDashboard } from '@/components/designer-analytics-dashboard';
import { api } from '@/lib/api';
import { requireAuth } from '@/lib/auth-guard';
import { getProfileCompletion } from '@/lib/designer-profile';

export const metadata = {
  title: 'Analytics · Tickif',
};

type DesignerAnalyticsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseAnalyticsDays(searchParams: Record<string, string | string[] | undefined>) {
  const parsed = analyticsQuerySchema.safeParse({ days: firstParam(searchParams.days) });
  return parsed.success ? parsed.data.days : analyticsQuerySchema.parse({}).days;
}

async function getAnalytics(days: number) {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');
  if (!cookie) {
    return { ok: false as const, data: null, message: 'Your session could not be read.' };
  }

  try {
    const response = await api.api.reports.analytics.$get(
      { query: { days } },
      { headers: { cookie } },
    );
    if (!response.ok) {
      return { ok: false as const, data: null, message: 'Refresh the page and try again.' };
    }

    const parsed = analyticsResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { ok: false as const, data: null, message: 'The analytics response was invalid.' };
    }

    return { ok: true as const, data: parsed.data };
  } catch {
    return { ok: false as const, data: null, message: 'Refresh the page and try again.' };
  }
}

export default async function DesignerAnalyticsPage({ searchParams }: DesignerAnalyticsPageProps) {
  await requireAuth({ requiredRole: 'designer' });
  const days = parseAnalyticsDays(await searchParams);
  const [result, completion] = await Promise.all([getAnalytics(days), getProfileCompletion()]);

  return (
    <DesignerAnalyticsDashboard
      analytics={result.data}
      error={result.ok ? null : result.message}
      profileCompletion={completion.data}
    />
  );
}
