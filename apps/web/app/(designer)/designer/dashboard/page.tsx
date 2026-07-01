import { headers } from 'next/headers';
import {
  profileCompletionResponseSchema,
  profileDashboardResponseSchema,
  type ProfileCompletionResponse,
  type ProfileDashboardResponse,
} from '@repo/contracts';
import { DesignerDashboardOverview } from '@/components/designer-dashboard-overview';
import { requireAuth } from '@/lib/auth-guard';
import { api } from '@/lib/api';
import { getCurrentDesignerProfile } from '@/lib/designer-profile';

export const metadata = {
  title: 'Designer dashboard · Tickif',
};

type DashboardResult =
  | { ok: true; data: ProfileDashboardResponse }
  | { ok: false; data: ProfileDashboardResponse; message: string };

type CompletionResult =
  | { ok: true; data: ProfileCompletionResponse }
  | { ok: false; data: null; message: string };

const emptyDashboard: ProfileDashboardResponse = {
  profileCompletion: { score: 0, missing: [] },
  projects: { total: 0, published: 0, inReview: 0, draft: 0 },
  leads: { total: 0, new: 0 },
  shareUrl: 'https://tickif.com/d/studio',
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

async function getProfileCompletion(): Promise<CompletionResult> {
  const reqHeaders = await headers();
  const cookie = reqHeaders.get('cookie');

  if (!cookie) {
    return { ok: false, data: null, message: 'Could not load profile completion.' };
  }

  try {
    const response = await api.api.profiles.me.completion.$get({}, { headers: { cookie } });

    if (!response.ok) {
      return { ok: false, data: null, message: 'Could not load profile completion.' };
    }

    const payload = await response.json();
    const parsed = profileCompletionResponseSchema.safeParse(payload);

    if (!parsed.success) {
      return { ok: false, data: null, message: 'Could not load profile completion.' };
    }

    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false, data: null, message: 'Could not load profile completion.' };
  }
}

export default async function DesignerDashboardPage() {
  const [session, profile, dashboard, completion] = await Promise.all([
    requireAuth({ requiredRole: 'designer' }),
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
