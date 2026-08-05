import { headers } from 'next/headers';
import type { AdminModerationQueueResponse } from '@repo/contracts';
import { AdminModerationQueue } from '@/components/admin-moderation-queue';
import { requireAuth } from '@/lib/auth-guard';
import { fetchAdminModerationQueue } from '@/lib/admin-moderation-api';

export const metadata = {
  title: 'Moderation queue · Tickif',
};

const emptyQueue: AdminModerationQueueResponse = {
  items: [],
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

export default async function AdminModerationPage() {
  const session = await requireAuth({ requiredRole: 'admin' });
  const cookie = (await headers()).get('cookie');

  let queue = emptyQueue;
  let error: string | undefined;
  if (cookie) {
    try {
      queue = await fetchAdminModerationQueue('submitted', { headers: { cookie } });
    } catch {
      error = 'Could not load the moderation queue. Try refreshing the page.';
    }
  } else {
    error = 'Your admin session could not be found. Please sign in again.';
  }

  return (
    <AdminModerationQueue
      initialQueue={queue}
      currentUserId={session.user.id}
      currentUserRole={session.user.role ?? 'admin'}
      initialError={error}
    />
  );
}
