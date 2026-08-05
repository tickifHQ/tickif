import { headers } from 'next/headers';
import { analyticsResponseSchema } from '@repo/contracts';
import { DesignerAnalyticsDashboard } from '@/components/designer-analytics-dashboard';
import { api } from '@/lib/api';
import { requireAuth } from '@/lib/auth-guard';

export const metadata = {
  title: 'Analytics · Tickif',
};

async function getAnalytics() {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');
  if (!cookie) {
    return { ok: false as const, data: null, message: 'Your session could not be read.' };
  }

  try {
    const response = await api.api.reports.analytics.$get(
      { query: { days: 30 } },
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

export default async function DesignerAnalyticsPage() {
  await requireAuth({ requiredRole: 'designer' });
  const result = await getAnalytics();

  return (
    <DesignerAnalyticsDashboard analytics={result.data} error={result.ok ? null : result.message} />
  );
}
