import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminModerationQueueQuerySchema } from '@repo/contracts';
import type { AdminModerationQueueResponse } from '@repo/contracts';
import { AdminModerationQueue } from '@/components/admin-moderation-queue';
import { requireAuth } from '@/lib/auth-guard';
import {
  ADMIN_MODERATION_QUEUE_TABS,
  fetchAdminModerationQueue,
  type AdminModerationQueueTab,
} from '@/lib/admin-moderation-api';

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

export default async function AdminModerationPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const session = await requireAuth({ requiredRole: 'admin' });
  const params = (await searchParams) ?? {};
  const parsed = adminModerationQueueQuerySchema.safeParse({
    status: params.status,
    page: params.page,
  });
  const { status, page } = parsed.success ? parsed.data : { status: 'submitted' as const, page: 1 };
  const cookie = (await headers()).get('cookie');

  let queue = { ...emptyQueue, page };
  const initialCounts: Record<AdminModerationQueueTab, number> = {
    submitted: 0,
    in_review: 0,
    published: 0,
  };
  let error: string | undefined;
  if (cookie) {
    try {
      const queues = await Promise.all(
        ADMIN_MODERATION_QUEUE_TABS.map(
          async (tab) =>
            [
              tab,
              await fetchAdminModerationQueue(tab, tab === status ? page : 1, {
                headers: { cookie },
              }),
            ] as const,
        ),
      );
      for (const [tab, loadedQueue] of queues) {
        initialCounts[tab] = loadedQueue.total;
        if (tab === status) queue = loadedQueue;
      }
    } catch {
      error = 'Could not load the moderation queue. Try refreshing the page.';
    }
  } else {
    error = 'Your admin session could not be found. Please sign in again.';
  }

  if (!error && page > Math.max(1, queue.totalPages)) {
    redirect(`/moderation?status=${status}&page=${Math.max(1, queue.totalPages)}`);
  }

  return (
    <AdminModerationQueue
      key={`${status}:${page}`}
      initialTab={status}
      initialQueue={queue}
      initialCounts={initialCounts}
      currentUserId={session.user.id}
      currentUserRole={session.user.role ?? 'admin'}
      initialError={error}
    />
  );
}
