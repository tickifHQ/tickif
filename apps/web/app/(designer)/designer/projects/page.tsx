import { headers } from 'next/headers';
import {
  PLATFORM_ROLE,
  listProjectsQuerySchema,
  listProjectsResponseSchema,
  type ListProjectsQuery,
  type ListProjectsResponse,
  type ProjectListStatus,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { requireAuth } from '@/lib/auth-guard';
import { DesignerProjectsList } from '@/components/designer-projects-list';

export const metadata = {
  title: 'Projects · Tickif',
};

type DesignerProjectsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const emptyProjects: ListProjectsResponse = {
  items: [],
  page: 1,
  total: 0,
  limit: 12,
  totalPages: 1,
};

const projectCountStatuses: ProjectListStatus[] = ['all', 'published', 'in_review', 'draft'];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseProjectQuery(searchParams: Record<string, string | string[] | undefined>): ListProjectsQuery {
  const raw = {
    status: firstParam(searchParams.status),
    q: firstParam(searchParams.q) || undefined,
    page: firstParam(searchParams.page),
    limit: firstParam(searchParams.limit),
    sort: firstParam(searchParams.sort),
  };
  const parsed = listProjectsQuerySchema.safeParse(raw);
  return parsed.success ? parsed.data : listProjectsQuerySchema.parse({});
}

async function fetchProjects(query: ListProjectsQuery, cookie: string | null) {
  if (!cookie) return { ok: false as const, data: emptyProjects, message: 'Could not load projects.' };

  try {
    const response = await api.api.projects.$get({ query }, { headers: { cookie } });
    if (!response.ok) return { ok: false as const, data: emptyProjects, message: 'Could not load projects.' };

    const payload = await response.json();
    const parsed = listProjectsResponseSchema.safeParse(payload);
    if (!parsed.success) return { ok: false as const, data: emptyProjects, message: 'Could not load projects.' };

    return { ok: true as const, data: parsed.data };
  } catch {
    return { ok: false as const, data: emptyProjects, message: 'Could not load projects.' };
  }
}

async function getProjects(query: ListProjectsQuery) {
  const reqHeaders = await headers();
  return fetchProjects(query, reqHeaders.get('cookie'));
}

async function getProjectTabCounts(query: ListProjectsQuery) {
  const reqHeaders = await headers();
  const cookie = reqHeaders.get('cookie');
  const entries = await Promise.all(
    projectCountStatuses.map(async (status) => {
      const result = await fetchProjects(
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

  return Object.fromEntries(entries) as Partial<Record<ProjectListStatus, number>>;
}

export default async function DesignerProjectsPage({ searchParams }: DesignerProjectsPageProps) {
  await requireAuth({ requiredRole: PLATFORM_ROLE.DESIGNER });
  const params = await searchParams;
  const query = parseProjectQuery(params);
  const [projects, tabCounts] = await Promise.all([
    getProjects(query),
    getProjectTabCounts(query),
  ]);

  return (
    <DesignerProjectsList
      projects={projects.data}
      tabCounts={tabCounts}
      activeStatus={query.status as ProjectListStatus}
      query={query.q}
      error={projects.ok ? undefined : projects.message}
    />
  );
}
