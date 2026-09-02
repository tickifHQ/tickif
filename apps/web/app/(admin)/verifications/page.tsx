import { headers } from 'next/headers';
import { ADMIN_VERIFICATION_QUEUE_TAB, type AdminVerificationQueueResponse } from '@repo/contracts';
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
  let error: string | undefined;
  if (cookie) {
    try {
      queue = await fetchAdminVerificationQueue(ADMIN_VERIFICATION_QUEUE_TAB.NEW, 1, {
        headers: { cookie },
      });
    } catch {
      error = 'Could not load submitted verifications. Try refreshing the page.';
    }
  } else {
    error = 'Your admin session could not be found. Please sign in again.';
  }

  return <AdminVerificationQueue initialQueue={queue} initialError={error} />;
}
