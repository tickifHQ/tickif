import { headers } from 'next/headers';
import { profileCompletionResponseSchema, type ProfileCompletionResponse } from '@repo/contracts';
import { DesignerDashboardOverview } from '@/components/designer-dashboard-overview';
import { requireAuth } from '@/lib/auth-guard';
import { api } from '@/lib/api';

export const metadata = {
  title: 'Designer dashboard · Tickif',
};

async function getCompletion(): Promise<ProfileCompletionResponse> {
  const reqHeaders = await headers();
  const cookie = reqHeaders.get('cookie');

  if (!cookie) {
    return { steps: [], score: 0, missing: [] };
  }

  try {
    const response = await api.api.profiles.me.completion.$get({}, { headers: { cookie } });

    if (!response.ok) {
      return { steps: [], score: 0, missing: [] };
    }

    const payload = await response.json();
    const parsed = profileCompletionResponseSchema.safeParse(payload);

    if (!parsed.success) {
      return { steps: [], score: 0, missing: [] };
    }

    return parsed.data;
  } catch {
    return { steps: [], score: 0, missing: [] };
  }
}

export default async function DesignerDashboardPage() {
  const [session, completion] = await Promise.all([
    requireAuth({ requiredRole: 'designer' }),
    getCompletion(),
  ]);

  const studioName = session.user.name?.trim() || 'Your studio';
  const studioLocation = session.user.email?.trim() || 'Designer workspace';

  return (
    <DesignerDashboardOverview
      studioName={studioName}
      studioLocation={studioLocation}
      completion={completion}
    />
  );
}
