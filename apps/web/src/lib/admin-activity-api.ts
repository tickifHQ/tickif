import { adminActivitySummarySchema, type AdminActivitySummary } from '@repo/contracts';
import { api } from '@/lib/api';

export class AdminActivityAccessError extends Error {
  constructor() {
    super('Your admin access has expired. Sign in again.');
    this.name = 'AdminActivityAccessError';
  }
}

export async function fetchAdminActivitySummary(cookie: string): Promise<AdminActivitySummary> {
  const response = await api.api.admin.activity.summary.$get(
    {},
    { headers: { cookie }, init: { cache: 'no-store' } },
  );

  if (response.status === 401 || response.status === 403) {
    throw new AdminActivityAccessError();
  }
  if (!response.ok) throw new Error('Could not load the platform summary.');

  const parsed = adminActivitySummarySchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('The platform summary response was invalid.');
  return parsed.data;
}
