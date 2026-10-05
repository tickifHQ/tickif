import { headers } from 'next/headers';
import {
  listProjectsResponseSchema,
  PLATFORM_ROLE,
  profileDashboardResponseSchema,
  type ProjectListItem,
  type ProfileDashboardResponse,
} from '@repo/contracts';
import { DesignerDashboardOverview } from '@/components/designer-dashboard-overview';
import { env } from '@/env';
import { requireAuth } from '@/lib/auth-guard';
import { api } from '@/lib/api';
import { getCurrentDesignerProfile, getProfileCompletion } from '@/lib/designer-profile';
import { getCurrentOrgCapabilities } from '@/lib/current-org-role';

export const metadata = {
  title: 'Designer dashboard · Tickif',
};

type DashboardResult =
  | { ok: true; data: ProfileDashboardResponse }
  | { ok: false; data: ProfileDashboardResponse; message: string };

type RecentProjectsResult =
  { ok: true; data: ProjectListItem[] } | { ok: false; data: ProjectListItem[]; message: string };

const emptyDashboard: ProfileDashboardResponse = {
  profileCompletion: { score: 0, missing: [] },
  projects: { total: 0, published: 0, inReview: 0, draft: 0 },
  leads: { total: 0, new: 0 },
  heroCoverUrl: null,
  // Placeholder used only when the dashboard fetch fails. `publiclyVisible:false`
  // guarantees the overview never surfaces this non-canonical `/d/studio` URL as
  // a copyable/openable public link (E-278).
  shareUrl: new URL('/d/studio', env.NEXT_PUBLIC_WEB_URL).toString(),
  publiclyVisible: false,
  portfolioBasicsComplete: false,
  verificationStatus: null,
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

async function getRecentProjects(): Promise<RecentProjectsResult> {
  const reqHeaders = await headers();
  const cookie = reqHeaders.get('cookie');

  if (!cookie) {
    return { ok: false, data: [], message: 'Could not load recent projects.' };
  }

  try {
    const response = await api.api.projects.$get(
      { query: { status: 'all', page: 1, limit: 3, sort: '-updatedAt' } },
      { headers: { cookie } },
    );

    if (!response.ok) {
      return { ok: false, data: [], message: 'Could not load recent projects.' };
    }

    const parsed = listProjectsResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { ok: false, data: [], message: 'Could not load recent projects.' };
    }

    return { ok: true, data: parsed.data.items };
  } catch {
    return { ok: false, data: [], message: 'Could not load recent projects.' };
  }
}

export default async function DesignerDashboardPage() {
  const [session, profile, dashboard, completion, capabilities, recentProjects] = await Promise.all(
    [
      requireAuth({ requiredRole: PLATFORM_ROLE.DESIGNER }),
      getCurrentDesignerProfile(),
      getDashboardSummary(),
      getProfileCompletion(),
      getCurrentOrgCapabilities(),
      getRecentProjects(),
    ],
  );

  const studioName = profile?.displayName.trim() || session.user.name?.trim() || 'Your studio';
  const studioLocation =
    profile?.address?.trim() || profile?.organization.name.trim() || 'Designer workspace';
  const portfolioUrl = dashboard.ok
    ? dashboard.data.shareUrl
    : (profile?.shareUrl ?? dashboard.data.shareUrl);
  // E-278: only treat the portfolio as publicly visible when the dashboard
  // fetch succeeded and the backend says so. On a failed fetch we fall back to
  // the placeholder, which is never live — so the share card stays gated.
  const portfolioPubliclyVisible = dashboard.ok && dashboard.data.publiclyVisible;

  return (
    <DesignerDashboardOverview
      studioName={studioName}
      studioLocation={studioLocation}
      logoUrl={profile?.logoUrl ?? null}
      portfolioUrl={portfolioUrl}
      portfolioPubliclyVisible={portfolioPubliclyVisible}
      yearsExperience={profile?.yearsExperience ?? null}
      projectCount={profile?.projectCount ?? 0}
      dashboard={dashboard.data}
      completion={completion.data}
      recentProjects={recentProjects.data}
      recentProjectsError={recentProjects.ok ? null : recentProjects.message}
      canWriteProjects={capabilities?.writeProjects ?? false}
      canEditOrganization={capabilities?.editOrganization ?? false}
      canManageVerification={capabilities?.manageVerification ?? false}
      dashboardError={dashboard.ok ? null : dashboard.message}
      workspaceKey={`${profile?.organization.id ?? 'unknown'}:${session.session.activeTeamId ?? 'no-branch'}`}
    />
  );
}
