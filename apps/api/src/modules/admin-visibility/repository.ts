import { db, eq, schema, sql } from '@repo/db';
import type { SQL } from 'drizzle-orm';
import type {
  AdminCompanySearchQuery,
  AdminEntityQuery,
  AdminLeadQuery,
  AdminReportQuery,
  AdminVisibilityMetrics,
} from '@repo/contracts';
import { adminReportWindow } from '@repo/contracts';

export function reportBounds(query: AdminReportQuery) {
  const window = adminReportWindow(query);
  return {
    window,
    // UTC ISO parameters also preserve the UTC convention of legacy timestamp-without-zone columns.
    from: new Date(`${window.from}T00:00:00+05:30`).toISOString(),
    until: new Date(new Date(`${window.to}T00:00:00+05:30`).getTime() + 86_400_000).toISOString(),
  };
}

function search(value: string) {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}
function leadScope(query: AdminLeadQuery, status = true) {
  const bounds = reportBounds(query);
  return sql`l.received_at >= ${bounds.from} and l.received_at < ${bounds.until}
    ${query.organizationId ? sql`and l.organization_id = ${query.organizationId}` : sql``}
    ${query.designerId ? sql`and d.id = ${query.designerId}` : sql``}
    ${status && query.status ? sql`and l.status = ${query.status}` : sql``}
    ${
      query.q
        ? sql`and (l.name ilike ${search(query.q)} or l.contact_number ilike ${search(query.q)}
      or p.title ilike ${search(query.q)} or e.subject ilike ${search(query.q)})`
        : sql``
    }`;
}
const leadJoins = sql`from ${schema.lead} l
  inner join ${schema.organization} o on o.id = l.organization_id
  inner join ${schema.team} t on t.id = l.team_id
  left join ${schema.designerProfile} d on d.team_id = l.team_id
  left join ${schema.project} p on p.id = l.referred_project_id
  left join ${schema.member} m on m.id = l.assigned_member_id
  left join ${schema.user} assignee on assignee.id = m.user_id
  left join lateral (select * from ${schema.enquiry} eq where eq.lead_id = l.id
    order by eq.created_at, eq.id limit 1) e on true
  left join ${schema.user} requester on requester.id = e.requester_id`;
const leadColumns = sql`l.id, l.name, l.contact_number as "contactNumber", l.budget_band_slug as budget,
  l.source, l.status, l.received_at as "receivedAt", l.message, l.notes,
  l.created_at at time zone 'UTC' as "createdAt", l.updated_at at time zone 'UTC' as "updatedAt",
  jsonb_build_object('id', o.id, 'name', o.name) as company,
  jsonb_build_object('id', t.id, 'name', t.name) as branch,
  case when d.id is null then null else jsonb_build_object('id', d.id, 'name', d.display_name) end as designer,
  case when m.id is null then null else jsonb_build_object('id', m.id, 'name', coalesce(assignee.name, 'Deleted account')) end as "assignedMember",
  case when p.id is null then null else jsonb_build_object('id', p.id, 'name', p.title) end as project,
  e.id as "enquiryId"`;
type Identity = { id: string; name: string };
export type LeadRow = {
  id: string;
  name: string;
  contactNumber: string;
  budget: string | null;
  source: string;
  status: 'new' | 'contacted' | 'closed' | 'spam';
  receivedAt: Date | string;
  message: string | null;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  company: Identity;
  branch: Identity;
  designer: Identity | null;
  assignedMember: Identity | null;
  project: Identity | null;
  enquiryId: string | null;
};
type EnquiryRow = typeof schema.enquiry.$inferSelect & {
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string | null;
};
type MessageRow = { id: string; body: string; author: Identity | null; createdAt: Date | string };
type CountMetrics = Omit<AdminVisibilityMetrics, 'responseRate' | 'conversionRate'>;
export type EntityRow = CountMetrics & {
  id: string;
  name: string;
  organizationId: string;
  companyName: string;
  status: string | null;
};

/** Aggregate each fact independently before joining; never multiply views by leads/messages. */
function measurementCtes(query: AdminReportQuery, groupBy: 'company' | 'designer') {
  const { from, until } = reportBounds(query);
  const key = (org: SQL, designer: SQL) => (groupBy === 'company' ? org : designer);
  const orgFilter = (column: SQL) =>
    query.organizationId ? sql`and ${column} = ${query.organizationId}` : sql``;
  const designerFilter = (column: SQL) =>
    query.designerId ? sql`and ${column} = ${query.designerId}` : sql``;
  return sql`with
    lead_counts as (
      select ${key(sql`l.organization_id`, sql`d.id`)} as group_id,
        count(*)::int as leads,
        count(*) filter (where l.status = 'new')::int as new,
        count(*) filter (where l.status = 'contacted')::int as contacted,
        count(*) filter (where l.status = 'closed')::int as closed,
        count(*) filter (where l.status = 'spam')::int as spam
      from ${schema.lead} l left join ${schema.designerProfile} d on d.team_id = l.team_id
      where l.received_at >= ${from} and l.received_at < ${until}
        ${orgFilter(sql`l.organization_id`)} ${designerFilter(sql`d.id`)} group by 1
    ), enquiry_counts as (
      select ${key(sql`e.organization_id`, sql`e.designer_profile_id`)} as group_id,
        count(*)::int as enquiries,
        count(*) filter (where e.status = 'open')::int as "openEnquiries",
        count(*) filter (where e.status = 'closed')::int as "closedEnquiries",
        count(*) filter (where e.contacted_at is not null)::int as "respondedEnquiries",
        count(*) filter (where l.status in ('contacted', 'closed'))::int as "progressedEnquiries"
      from ${schema.enquiry} e left join ${schema.lead} l on l.id = e.lead_id
      where e.created_at >= ${from} and e.created_at < ${until}
        ${orgFilter(sql`e.organization_id`)} ${designerFilter(sql`e.designer_profile_id`)} group by 1
    ), view_counts as (
      select ${key(sql`d.org_id`, sql`d.id`)} as group_id,
        count(*) filter (where v.type = 'project_view')::int as "projectViews",
        count(*) filter (where v.type = 'profile_view')::int as "profileViews"
      from ${schema.interactionEvent} v
      left join ${schema.project} p on p.id = v.project_id
      inner join ${schema.designerProfile} d on d.id = coalesce(v.designer_profile_id, p.designer_id)
      where v.created_at >= ${from} and v.created_at < ${until}
        ${orgFilter(sql`d.org_id`)} ${designerFilter(sql`d.id`)} group by 1
    ), project_counts as (
      select ${key(sql`d.org_id`, sql`d.id`)} as group_id, count(*)::int as "projectsCreated"
      from ${schema.project} p inner join ${schema.designerProfile} d on d.id = p.designer_id
      where p.created_at >= ${from} and p.created_at < ${until}
        ${orgFilter(sql`d.org_id`)} ${designerFilter(sql`d.id`)} group by 1
    ), entities as (
      ${
        groupBy === 'company'
          ? sql`select o.id, o.name, o.id as "organizationId", o.name as "companyName", null::text as status
        from ${schema.organization} o where true ${orgFilter(sql`o.id`)}`
          : sql`select d.id::text, d.display_name as name, d.org_id as "organizationId", o.name as "companyName", d.status::text
        from ${schema.designerProfile} d inner join ${schema.organization} o on o.id = d.org_id
        where true ${orgFilter(sql`d.org_id`)} ${designerFilter(sql`d.id`)}`
      }
    ), measurements as (
      select entities.*,
        coalesce(l.leads, 0)::int as leads, coalesce(l.new, 0)::int as new,
        coalesce(l.contacted, 0)::int as contacted, coalesce(l.closed, 0)::int as closed,
        coalesce(l.spam, 0)::int as spam, coalesce(e.enquiries, 0)::int as enquiries,
        coalesce(e."openEnquiries", 0)::int as "openEnquiries",
        coalesce(e."closedEnquiries", 0)::int as "closedEnquiries",
        coalesce(e."respondedEnquiries", 0)::int as "respondedEnquiries",
        coalesce(e."progressedEnquiries", 0)::int as "progressedEnquiries",
        coalesce(v."projectViews", 0)::int as "projectViews",
        coalesce(v."profileViews", 0)::int as "profileViews",
        coalesce(p."projectsCreated", 0)::int as "projectsCreated"
      from entities left join lead_counts l on l.group_id::text = entities.id
      left join enquiry_counts e on e.group_id::text = entities.id
      left join view_counts v on v.group_id::text = entities.id
      left join project_counts p on p.group_id::text = entities.id
    )`;
}
const metricKeys = [
  'leads',
  'new',
  'contacted',
  'closed',
  'spam',
  'enquiries',
  'openEnquiries',
  'closedEnquiries',
  'respondedEnquiries',
  'progressedEnquiries',
  'projectViews',
  'profileViews',
  'projectsCreated',
] as const;

export const adminVisibilityRepository = {
  async scopeExists(query: AdminReportQuery) {
    if (query.designerId) {
      const result =
        await db.execute(sql`select 1 from ${schema.designerProfile} where id = ${query.designerId}
        ${query.organizationId ? sql`and org_id = ${query.organizationId}` : sql``}`);
      return result.rows.length > 0;
    }
    if (query.organizationId) {
      const result = await db.execute(
        sql`select 1 from ${schema.organization} where id = ${query.organizationId}`,
      );
      return result.rows.length > 0;
    }
    return true;
  },
  async companies(query: AdminCompanySearchQuery) {
    const where = sql`where true ${query.id ? sql`and id = ${query.id}` : sql``}
      ${query.q ? sql`and name ilike ${search(query.q)}` : sql``}`;
    const [items, counts] = await Promise.all([
      db.execute<Identity>(sql`select id, name from ${schema.organization} ${where} order by name, id
        limit ${query.limit} offset ${(query.page - 1) * query.limit}`),
      db.execute<{ total: number }>(
        sql`select count(*)::int as total from ${schema.organization} ${where}`,
      ),
    ]);
    return { items: items.rows, total: counts.rows[0]?.total ?? 0 };
  },
  async leads(query: AdminLeadQuery) {
    const [items, counts, pipeline] = await Promise.all([
      db.execute<LeadRow>(sql`select ${leadColumns} ${leadJoins} where ${leadScope(query)}
        order by l.received_at desc, l.id limit ${query.limit} offset ${(query.page - 1) * query.limit}`),
      db.execute<{ total: number }>(
        sql`select count(*)::int as total ${leadJoins} where ${leadScope(query)}`,
      ),
      db.execute<{
        status: LeadRow['status'];
        count: number;
      }>(sql`select l.status, count(*)::int as count
        ${leadJoins} where ${leadScope(query, false)} group by l.status`),
    ]);
    return { items: items.rows, total: counts.rows[0]?.total ?? 0, pipeline: pipeline.rows };
  },
  async lead(id: string) {
    const result = await db.execute<LeadRow>(
      sql`select ${leadColumns} ${leadJoins} where l.id = ${id}`,
    );
    return result.rows[0] ?? null;
  },
  async enquiry(id: string) {
    // Drizzle owns timestamp and camelCase mapping on this full record.
    const rows = await db
      .select({
        enquiry: schema.enquiry,
        requesterName: schema.user.name,
        requesterEmail: schema.user.email,
        requesterPhone: schema.user.phoneNumber,
      })
      .from(schema.enquiry)
      .innerJoin(schema.user, eq(schema.user.id, schema.enquiry.requesterId))
      .where(eq(schema.enquiry.id, id))
      .limit(1);
    const row = rows[0];
    return row
      ? ({
          ...row.enquiry,
          requesterName: row.requesterName,
          requesterEmail: row.requesterEmail,
          requesterPhone: row.requesterPhone,
        } satisfies EnquiryRow)
      : null;
  },
  async messages(enquiryId: string, page: number, limit: number) {
    const [items, counts] = await Promise.all([
      db.execute<MessageRow>(sql`select m.id, m.body, m.created_at as "createdAt",
        case when u.id is null then null else jsonb_build_object('id', u.id, 'name', u.name) end as author
        from ${schema.enquiryMessage} m left join ${schema.user} u on u.id = m.author_id
        where m.enquiry_id = ${enquiryId} order by m.created_at, m.id
        limit ${limit} offset ${(page - 1) * limit}`),
      db.execute<{ total: number }>(
        sql`select count(*)::int as total from ${schema.enquiryMessage} where enquiry_id = ${enquiryId}`,
      ),
    ]);
    return { items: items.rows, total: counts.rows[0]?.total ?? 0 };
  },
  async entities(query: AdminEntityQuery) {
    const ctes = measurementCtes(query, query.groupBy);
    const where = query.q
      ? sql`where name ilike ${search(query.q)} or "companyName" ilike ${search(query.q)}`
      : sql``;
    const [items, counts] = await Promise.all([
      db.execute<EntityRow>(sql`${ctes} select * from measurements ${where} order by enquiries desc, name, id
        limit ${query.limit} offset ${(query.page - 1) * query.limit}`),
      db.execute<{ total: number }>(
        sql`${ctes} select count(*)::int as total from measurements ${where}`,
      ),
    ]);
    return { items: items.rows, total: counts.rows[0]?.total ?? 0 };
  },
  async report(query: AdminReportQuery) {
    const { from, until } = reportBounds(query);
    const projection = sql.join(
      metricKeys.map(
        (key) => sql`coalesce(sum(${sql.identifier(key)}), 0)::int as ${sql.identifier(key)}`,
      ),
      sql`, `,
    );
    const [metrics, activity] = await Promise.all([
      db.execute<CountMetrics>(
        sql`${measurementCtes(query, 'company')} select ${projection} from measurements`,
      ),
      db.execute<{ date: string; enquiries: number; responded: number; progressed: number }>(sql`
        select to_char((e.created_at at time zone 'UTC') at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as date,
          count(*)::int as enquiries, count(*) filter (where e.contacted_at is not null)::int as responded,
          count(*) filter (where l.status in ('contacted', 'closed'))::int as progressed
        from ${schema.enquiry} e left join ${schema.lead} l on l.id = e.lead_id
        where e.created_at >= ${from} and e.created_at < ${until}
          ${query.organizationId ? sql`and e.organization_id = ${query.organizationId}` : sql``}
          ${query.designerId ? sql`and e.designer_profile_id = ${query.designerId}` : sql``}
        group by 1 order by 1`),
    ]);
    return { metrics: metrics.rows[0]!, activity: activity.rows };
  },
};
