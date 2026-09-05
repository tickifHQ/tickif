import { headers } from 'next/headers';
import {
  ADMIN_VERIFICATION_QUEUE_TAB,
  ADMIN_VERIFICATION_QUEUE_TAB_VALUES,
  type AdminVerificationQueueResponse,
  type AdminVerificationQueueTab,
} from '@repo/contracts';
import { AdminVerificationQueue } from '@/components/admin-verification-queue';
import { requireAuth } from '@/lib/auth-guard';
import { fetchAdminVerificationQueue } from '@/lib/admin-verification-api';

export const metadata = {
  title: 'Profile verification · Tickif',
};

const emptyQueue: AdminVerificationQueueResponse = {
  items: [],
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  tab: ADMIN_VERIFICATION_QUEUE_TAB.NEW,
};

export default async function AdminVerificationsPage() {
  await requireAuth({ requiredRole: 'admin' });
  const cookie = (await headers()).get('cookie');

  let queue = emptyQueue;
  const initialCounts: Record<AdminVerificationQueueTab, number> = {
    new: 0,
    re_review: 0,
    accepted: 0,
    changes_requested: 0,
    expired: 0,
  };
  let error: string | undefined;
  if (cookie) {
    try {
      const queues = await Promise.all(
        ADMIN_VERIFICATION_QUEUE_TAB_VALUES.map(
          async (tab) =>
            [tab, await fetchAdminVerificationQueue(tab, 1, { headers: { cookie } })] as const,
        ),
      );
      for (const [tab, loadedQueue] of queues) {
        initialCounts[tab] = loadedQueue.total;
        if (tab === ADMIN_VERIFICATION_QUEUE_TAB.NEW) queue = loadedQueue;
      }
    } catch {
      error = 'Could not load submitted verifications. Try refreshing the page.';
    }
  } else {
    error = 'Your admin session could not be found. Please sign in again.';
  }

  return (
    <AdminVerificationQueue
      initialQueue={queue}
      initialCounts={initialCounts}
      initialError={error}
    />
  );
}
