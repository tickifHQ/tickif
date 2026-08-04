import { headers } from 'next/headers';
import {
  leadDetailResponseSchema,
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

const leadCountStatuses: LeadListStatus[] = ['all', 'new', 'contacted', 'closed', 'spam'];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseLeadQuery(
  searchParams: Record<string, string | string[] | undefined>,
): ListLeadsQuery {
  const raw = {
    status: firstParam(searchParams.status),
    q: firstParam(searchParams.q) || undefined,
    sortBy: firstParam(searchParams.sortBy) || undefined,
    sortOrder: firstParam(searchParams.sortOrder) || undefined,
    page: firstParam(searchParams.page),
    limit: firstParam(searchParams.limit),
  };
  const parsed = listLeadsQuerySchema.safeParse(raw);
  return parsed.success ? parsed.data : listLeadsQuerySchema.parse({});
}

async function fetchLeads(query: ListLeadsQuery, cookie: string | null) {
  if (!cookie) return { ok: false as const, data: emptyLeads, message: 'Could not load leads.' };

  try {
    const response = await api.api.leads.$get({ query }, { headers: { cookie } });
    if (!response.ok)
      return { ok: false as const, data: emptyLeads, message: 'Could not load leads.' };

    const payload = await response.json();
    const parsed = listLeadsResponseSchema.safeParse(payload);
    if (!parsed.success)
      return { ok: false as const, data: emptyLeads, message: 'Could not load leads.' };

    return { ok: true as const, data: parsed.data };
  } catch {
    return { ok: false as const, data: emptyLeads, message: 'Could not load leads.' };
  }
}

async function getLeads(query: ListLeadsQuery) {
  const reqHeaders = await headers();
  return fetchLeads(query, reqHeaders.get('cookie'));
}

async function getLeadTabCounts(query: ListLeadsQuery) {
  const reqHeaders = await headers();
  const cookie = reqHeaders.get('cookie');
  const entries = await Promise.all(
    leadCountStatuses.map(async (status) => {
      const result = await fetchLeads(
        {
          ...query,
          status,
          page: 1,
          limit: 1,
        },
        cookie,
      );
      return [status, result.ok ? result.data.total : undefined] as const;
    }),
  );

  return Object.fromEntries(entries) as Partial<Record<LeadListStatus, number>>;
}

async function getLeadDetail(leadId: string | undefined) {
  if (!leadId) return { ok: true as const, data: null };

  const reqHeaders = await headers();
  const cookie = reqHeaders.get('cookie');
  if (!cookie) return { ok: false as const, data: null, message: 'Could not load lead details.' };

  try {
    const response = await api.api.leads[':id'].$get(
      { param: { id: leadId } },
      { headers: { cookie } },
    );
    if (!response.ok)
      return { ok: false as const, data: null, message: 'Could not load lead details.' };

    const payload = await response.json();
    const parsed = leadDetailResponseSchema.safeParse(payload);
    if (!parsed.success)
      return { ok: false as const, data: null, message: 'Could not load lead details.' };

    return { ok: true as const, data: parsed.data };
  } catch {
    return { ok: false as const, data: null, message: 'Could not load lead details.' };
  }
}

export default async function DesignerLeadsPage({ searchParams }: DesignerLeadsPageProps) {
  await requireAuth({ requiredRole: 'designer' });
  const params = await searchParams;
  const query = parseLeadQuery(params);
  const [leads, tabCounts, selectedLead] = await Promise.all([
    getLeads(query),
    getLeadTabCounts(query),
    getLeadDetail(firstParam(params.leadId)),
  ]);

  return (
    <DesignerLeadsList
      leads={leads.data}
      tabCounts={tabCounts}
      selectedLead={selectedLead.data}
      selectedLeadError={selectedLead.ok ? undefined : selectedLead.message}
      activeStatus={query.status as LeadListStatus}
      query={query.q}
      sortBy={query.sortBy}
      sortOrder={query.sortOrder}
      error={leads.ok ? undefined : leads.message}
    />
  );
}
