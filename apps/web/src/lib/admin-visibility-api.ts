import {
  adminCompanySearchResponseSchema,
  adminEntityResponseSchema,
  adminLeadDetailSchema,
  adminLeadResponseSchema,
  adminReportResponseSchema,
} from '@repo/contracts';
import type {
  AdminCompanySearchQuery,
  AdminEntityQuery,
  AdminLeadQuery,
  AdminReportQuery,
  AdminThreadQuery,
} from '@repo/contracts';
import type { z } from 'zod';
import { api } from '@/lib/api';

export class AdminVisibilityError extends Error {
  constructor(readonly status: number) {
    super(
      status === 403
        ? 'Your account cannot view admin data.'
        : status === 404
          ? 'The requested company, designer or lead was not found.'
          : 'Admin data could not be loaded. Please try again.',
    );
  }
}
async function read<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) throw new AdminVisibilityError(response.status);
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new Error('The admin data response was invalid. Please try again.');
  return parsed.data;
}
const options = (cookie: string) => ({ headers: { cookie }, init: { cache: 'no-store' as const } });
const scope = (query: AdminReportQuery) => ({
  from: query.from,
  to: query.to,
  organizationId: query.organizationId,
  designerId: query.designerId,
});
export async function fetchAdminLeadList(query: AdminLeadQuery, cookie: string) {
  return read(
    await api.api.admin.insights.leads.$get(
      {
        query: {
          ...scope(query),
          page: String(query.page),
          limit: String(query.limit),
          status: query.status,
          q: query.q,
        },
      },
      options(cookie),
    ),
    adminLeadResponseSchema,
  );
}
export async function fetchAdminLeadDetail(id: string, query: AdminThreadQuery, cookie: string) {
  return read(
    await api.api.admin.insights.leads[':id'].$get(
      {
        param: { id },
        query: {
          page: String(query.page),
          limit: String(query.limit),
        },
      },
      options(cookie),
    ),
    adminLeadDetailSchema,
  );
}
export async function fetchAdminReport(query: AdminReportQuery, cookie: string) {
  return read(
    await api.api.admin.insights.report.$get({ query: scope(query) }, options(cookie)),
    adminReportResponseSchema,
  );
}
export async function fetchAdminEntities(query: AdminEntityQuery, cookie: string) {
  return read(
    await api.api.admin.insights.entities.$get(
      {
        query: {
          ...scope(query),
          page: String(query.page),
          limit: String(query.limit),
          groupBy: query.groupBy,
          q: query.q,
        },
      },
      options(cookie),
    ),
    adminEntityResponseSchema,
  );
}
export async function fetchAdminCompanyOptions(
  query: AdminCompanySearchQuery,
  cookie?: string,
  signal?: AbortSignal,
) {
  return read(
    await api.api.admin.insights.companies.$get(
      {
        query: {
          id: query.id,
          q: query.q,
          page: String(query.page),
          limit: String(query.limit),
        },
      },
      { ...(cookie ? { headers: { cookie } } : {}), init: { cache: 'no-store', signal } },
    ),
    adminCompanySearchResponseSchema,
  );
}

/** Preserve reporting scope when drilling into a company, designer, stage or lead. */
export function adminVisibilityHref(
  path: string,
  query: AdminReportQuery & {
    q?: string;
    status?: string;
    groupBy?: string;
    page?: number;
    limit?: number;
  },
  updates: Record<string, string | number | undefined> = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...updates })) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.size ? `${path}?${params.toString()}` : path;
}

export function adminQueryValues(params: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== '' && value !== undefined),
  );
}
