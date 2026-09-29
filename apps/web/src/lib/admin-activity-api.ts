import {
  adminUserActivityResponseSchema,
  adminUsersResponseSchema,
  type AdminUserActivityResponse,
  type AdminUsersQuery,
  type AdminUsersResponse,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { handleApiResponse } from '@/lib/api-response';

type ServerRequestInit = { headers: { cookie: string } };

const USERS_ERROR = 'Could not load the user directory.';
const ACTIVITY_ERROR = 'Could not load this user activity.';

export async function fetchAdminUsers(
  query: AdminUsersQuery,
  requestInit?: ServerRequestInit,
): Promise<AdminUsersResponse> {
  const response = await api.api.admin.activity.users.$get(
    {
      query: {
        page: String(query.page),
        limit: String(query.limit),
        ...(query.q ? { q: query.q } : {}),
        ...(query.role ? { role: query.role } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
    },
    requestInit,
  );

  return handleApiResponse(response, adminUsersResponseSchema, USERS_ERROR);
}

export async function fetchAdminUserActivity(userId: string): Promise<AdminUserActivityResponse> {
  const response = await api.api.admin.activity.users[':id'].activity.$get({
    param: { id: userId },
  });

  return handleApiResponse(response, adminUserActivityResponseSchema, ACTIVITY_ERROR);
}
