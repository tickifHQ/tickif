import type { AdminEnquiriesQuery, AdminEnquiriesResponse } from '@repo/contracts';
import { adminEnquiriesResponseSchema } from '@repo/contracts';
import { api } from '@/lib/api';

type ServerRequestInit = { headers: { cookie: string } };

export class AdminEnquiriesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AdminEnquiriesApiError';
  }
}

export async function fetchAdminEnquiries(
  query: AdminEnquiriesQuery,
  requestInit?: ServerRequestInit,
): Promise<AdminEnquiriesResponse> {
  const response = await api.api.admin.activity.enquiries.$get(
    {
      query: {
        page: String(query.page),
        limit: String(query.limit),
        ...(query.status ? { status: query.status } : {}),
      },
    },
    { ...requestInit, init: { cache: 'no-store' } },
  );

  if (!response.ok) {
    throw new AdminEnquiriesApiError('Could not load platform enquiries.', response.status);
  }

  const parsed = adminEnquiriesResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('The admin enquiries response was invalid.');
  return parsed.data;
}
