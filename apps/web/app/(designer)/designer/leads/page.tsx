import { headers } from 'next/headers';
import {
  listLeadsQuerySchema,
  listLeadsResponseSchema,
  type LeadListStatus,
  type ListLeadsQuery,
  type ListLeadsResponse,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { requireAuth } from '@/lib/auth-guard';
import { DesignerLeadsList } from '@/components/designer-leads-list';

export const metadata = {
  title: 'Leads · Tickif',
};

type DesignerLeadsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const emptyLeads: ListLeadsResponse = {
  items: [],
  page: 1,
  limit: 12,
  total: 0,
  totalPages: 1,
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseLeadQuery(searchParams: Record<string, string | string[] | undefined>): ListLeadsQuery {
  const raw = {
    status: firstParam(searchParams.status),
    q: firstParam(searchParams.q) || undefined,
    page: firstParam(searchParams.page),
    limit: firstParam(searchParams.limit),
  };
  const parsed = listLeadsQuerySchema.safeParse(raw);
  return parsed.success ? parsed.data : listLeadsQuerySchema.parse({});
}

async function getLeads(query: ListLeadsQuery) {
  const reqHeaders = await headers();
  const cookie = reqHeaders.get('cookie');

  if (!cookie) return { ok: false as const, data: emptyLeads, message: 'Could not load leads.' };

  try {
    const response = await api.api.leads.$get({ query }, { headers: { cookie } });
    if (!response.ok) return { ok: false as const, data: emptyLeads, message: 'Could not load leads.' };

    const payload = await response.json();
    const parsed = listLeadsResponseSchema.safeParse(payload);
    if (!parsed.success) return { ok: false as const, data: emptyLeads, message: 'Could not load leads.' };

    return { ok: true as const, data: parsed.data };
  } catch {
    return { ok: false as const, data: emptyLeads, message: 'Could not load leads.' };
  }
}

export default async function DesignerLeadsPage({ searchParams }: DesignerLeadsPageProps) {
  await requireAuth({ requiredRole: 'designer' });
  const params = await searchParams;
  const query = parseLeadQuery(params);
  const leads = await getLeads(query);

  return (
    <DesignerLeadsList
      leads={leads.data}
      activeStatus={query.status as LeadListStatus}
      query={query.q}
      error={leads.ok ? undefined : leads.message}
    />
  );
}
