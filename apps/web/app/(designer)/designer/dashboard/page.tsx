import { headers } from 'next/headers';
import {
  PLATFORM_ROLE,
  profileDashboardResponseSchema,
  type ProfileDashboardResponse,
} from '@repo/contracts';
import { DesignerDashboardOverview } from '@/components/designer-dashboard-overview';
import { env } from '@/env';
import { requireAuth } from '@/lib/auth-guard';
import { api } from '@/lib/api';
import { getCurrentDesignerProfile, getProfileCompletion } from '@/lib/designer-profile';

export const metadata = {
  title: 'Designer dashboard · Tickif',
};

type DashboardResult =
  | { ok: true; data: ProfileDashboardResponse }
  | { ok: false; data: ProfileDashboardResponse; message: string };

const emptyDashboard: ProfileDashboardResponse = {
  profileCompletion: { score: 0, missing: [] },
  projects: { total: 0, published: 0, inReview: 0, draft: 0 },
  leads: { total: 0, new: 0 },
  shareUrl: new URL('/d/studio', env.NEXT_PUBLIC_WEB_URL).toString(),
};

async function getDashboardSummary(): Promise<DashboardResult> {
  const reqHeaders = await headers();
  const cookie = reqHeaders.get('cookie');

  if (!cookie) {
    return { ok: false, data: emptyDashboard, message: 'Could not load dashboard summary.' };
  }

  try {
    const response = await api.api.profiles.me.dashboard.$get({}, { headers: { cookie } });

    if (!response.ok) {
      return { ok: false, data: emptyDashboard, message: 'Could not load dashboard summary.' };
    }

    const payload = await response.json();
    const parsed = profileDashboardResponseSchema.safeParse(payload);

    if (!parsed.success) {
      return { ok: false, data: emptyDashboard, message: 'Could not load dashboard summary.' };
    }

    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false, data: emptyDashboard, message: 'Could not load dashboard summary.' };
  }
}

export default async function DesignerDashboardPage() {
  const [session, profile, dashboard, completion] = await Promise.all([
    requireAuth({ requiredRole: PLATFORM_ROLE.DESIGNER }),
    getCurrentDesignerProfile(),
    getDashboardSummary(),
    getProfileCompletion(),
  ]);

  const studioName = profile?.displayName.trim() || session.user.name?.trim() || 'Your studio';
  const studioLocation = profile?.address?.trim() || profile?.organization.name.trim() || 'Designer workspace';
  const portfolioUrl = dashboard.ok ? dashboard.data.shareUrl : (profile?.shareUrl ?? dashboard.data.shareUrl);

  return (
    <DesignerDashboardOverview
      studioName={studioName}
      studioLocation={studioLocation}
      portfolioUrl={portfolioUrl}
      dashboard={dashboard.data}
      completion={completion.data}
      dashboardError={dashboard.ok ? null : dashboard.message}
    />
  );
}
