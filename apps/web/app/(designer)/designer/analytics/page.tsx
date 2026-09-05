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

function parseAnalyticsQuery(searchParams: Record<string, string | string[] | undefined>) {
  const parsed = analyticsQuerySchema.safeParse({
    days: firstParam(searchParams.days),
    branchId: firstParam(searchParams.branchId),
    dataset: firstParam(searchParams.dataset),
  });
  if (parsed.success) return parsed.data;
  return { days: analyticsQuerySchema.parse({}).days } as {
    days: number;
    branchId?: string;
    dataset?: 'engagement' | 'billing';
  };
}

async function getAnalytics(query: {
  days: number;
  branchId?: string;
  dataset?: 'engagement' | 'billing';
}) {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');
  if (!cookie) {
    return { ok: false as const, data: null, message: 'Your session could not be read.' };
  }

  try {
    const response = await api.api.reports.analytics.$get(
      { query: { days: query.days, branchId: query.branchId, dataset: query.dataset } },
      { headers: { cookie } },
    );
    if (response.status === 402) {
      return {
        ok: false as const,
        data: null,
        message: 'Branch analytics need Corporate. Upgrade to unlock them.',
      };
    }
    if (response.status === 403) {
      return {
        ok: false as const,
        data: null,
        message: 'Your role does not allow this analytics view.',
      };
    }
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
  const query = parseAnalyticsQuery(await searchParams);
  const [result, completion] = await Promise.all([getAnalytics(query), getProfileCompletion()]);

  return (
    <DesignerAnalyticsDashboard
      analytics={result.data}
      error={result.ok ? null : result.message}
      profileCompletion={completion.data}
    />
  );
}
