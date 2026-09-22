import { and, asc, db, desc, eq, isNotNull, max, schema, sql } from '@repo/db';
import type { AdminEnquiriesQuery, AdminUsersQuery } from '@repo/contracts';
import { alias } from 'drizzle-orm/pg-core';

const page = (value: number, limit: number) => ({ limit, offset: (value - 1) * limit });
const platformUser = alias(schema.user, 'platform_user');

export const adminActivityRepository = {
  async summary() {
    const [[users], [enquiries], [views], [searches]] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${schema.user.status} = 'active')::int`,
        })
        .from(schema.user),
      db
        .select({
          total: sql<number>`count(*)::int`,
          open: sql<number>`count(*) filter (where ${schema.enquiry.status} = 'open')::int`,
        })
        .from(schema.enquiry),
      db
        .select({
          projects: sql<number>`count(*) filter (where ${schema.interactionEvent.type} = 'project_view')::int`,
          profiles: sql<number>`count(*) filter (where ${schema.interactionEvent.type} = 'profile_view')::int`,
        })
        .from(schema.interactionEvent),
      db.select({ total: sql<number>`count(*)::int` }).from(schema.searchActivity),
    ]);
    return {
      users: users?.total ?? 0,
      activeUsers: users?.active ?? 0,
      enquiries: enquiries?.total ?? 0,
      openEnquiries: enquiries?.open ?? 0,
      projectViews: views?.projects ?? 0,
      profileViews: views?.profiles ?? 0,
      searches: searches?.total ?? 0,
    };
  },

  async listUsers(query: AdminUsersQuery) {
    const pagination = page(query.page, query.limit);
    const q = query.q ? `%${query.q.replace(/[\\%_]/g, '\\$&')}%` : null;
    const where = and(
      query.role ? eq(platformUser.role, query.role) : undefined,
      query.status ? eq(platformUser.status, query.status) : undefined,
      q
        ? sql`(${platformUser.name} ilike ${q} escape '\\' or ${platformUser.email} ilike ${q} escape '\\' or coalesce(${platformUser.phoneNumber}, '') ilike ${q} escape '\\')`
        : undefined,
    );
    const viewCounts = db
      .select({
        actorUserId: schema.interactionEvent.actorUserId,
        projectViews:
          sql<number>`count(*) filter (where ${schema.interactionEvent.type} = 'project_view')::int`.as(
            'project_views',
          ),
        profileViews:
          sql<number>`count(*) filter (where ${schema.interactionEvent.type} = 'profile_view')::int`.as(
            'profile_views',
          ),
        lastActiveAt: max(schema.interactionEvent.createdAt).as('view_last_active_at'),
      })
      .from(schema.interactionEvent)
      .where(isNotNull(schema.interactionEvent.actorUserId))
      .groupBy(schema.interactionEvent.actorUserId)
      .as('view_counts');
    const searchCounts = db
      .select({
        actorUserId: schema.searchActivity.actorUserId,
        searches: sql<number>`count(*)::int`.as('searches'),
        lastActiveAt: max(schema.searchActivity.createdAt).as('search_last_active_at'),
      })
      .from(schema.searchActivity)
      .groupBy(schema.searchActivity.actorUserId)
      .as('search_counts');
    const enquiryCounts = db
      .select({
        actorUserId: schema.enquiry.requesterId,
        enquiries: sql<number>`count(*)::int`.as('enquiries'),
        lastActiveAt: max(schema.enquiry.createdAt).as('enquiry_last_active_at'),
      })
      .from(schema.enquiry)
      .groupBy(schema.enquiry.requesterId)
      .as('enquiry_counts');
    const [items, [count]] = await Promise.all([
      db
        .select({
          id: platformUser.id,
          name: platformUser.name,
          email: platformUser.email,
          phoneNumber: platformUser.phoneNumber,
          role: platformUser.role,
          status: platformUser.status,
          banned: platformUser.banned,
          projectViews: sql<number>`coalesce(${viewCounts.projectViews}, 0)`,
          profileViews: sql<number>`coalesce(${viewCounts.profileViews}, 0)`,
          searches: sql<number>`coalesce(${searchCounts.searches}, 0)`,
          enquiries: sql<number>`coalesce(${enquiryCounts.enquiries}, 0)`,
          createdAt: platformUser.createdAt,
          lastActiveAt: sql<Date | null>`greatest(
            ${viewCounts.lastActiveAt},
            ${searchCounts.lastActiveAt},
            ${enquiryCounts.lastActiveAt}
          )`.mapWith(schema.searchActivity.createdAt),
        })
        .from(platformUser)
        .leftJoin(viewCounts, eq(viewCounts.actorUserId, platformUser.id))
        .leftJoin(searchCounts, eq(searchCounts.actorUserId, platformUser.id))
        .leftJoin(enquiryCounts, eq(enquiryCounts.actorUserId, platformUser.id))
        .where(where)
        .orderBy(desc(platformUser.createdAt), asc(platformUser.id))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(platformUser)
        .where(where),
    ]);
    return { items, total: count?.value ?? 0 };
  },

  async listEnquiries(query: AdminEnquiriesQuery) {
    const pagination = page(query.page, query.limit);
    const where = query.status ? eq(schema.enquiry.status, query.status) : undefined;
    const [items, [count]] = await Promise.all([
      db
        .select({
          id: schema.enquiry.id,
          requesterId: schema.user.id,
          requesterName: schema.user.name,
          requesterEmail: schema.user.email,
          designerId: schema.designerProfile.id,
          designerDisplayName: schema.designerProfile.displayName,
          organizationId: schema.enquiry.organizationId,
          referredProjectId: schema.project.id,
          referredProjectTitle: schema.project.title,
          subject: schema.enquiry.subject,
          budget: schema.enquiry.budget,
          timeline: schema.enquiry.timeline,
          status: schema.enquiry.status,
          createdAt: schema.enquiry.createdAt,
          updatedAt: schema.enquiry.updatedAt,
        })
        .from(schema.enquiry)
        .innerJoin(schema.user, eq(schema.enquiry.requesterId, schema.user.id))
        .innerJoin(
          schema.designerProfile,
          eq(schema.enquiry.designerProfileId, schema.designerProfile.id),
        )
        .leftJoin(schema.project, eq(schema.enquiry.referredProjectId, schema.project.id))
        .where(where)
        .orderBy(desc(schema.enquiry.createdAt), asc(schema.enquiry.id))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(schema.enquiry)
        .where(where),
    ]);
    return { items, total: count?.value ?? 0 };
  },

  async userActivity(userId: string) {
    const [searches, projectViews, profileViews] = await Promise.all([
      db
        .select({
          endpoint: schema.searchActivity.endpoint,
          query: schema.searchActivity.query,
          createdAt: schema.searchActivity.createdAt,
        })
        .from(schema.searchActivity)
        .where(eq(schema.searchActivity.actorUserId, userId))
        .orderBy(desc(schema.searchActivity.createdAt))
        .limit(100),
      db
        .select({
          projectId: schema.project.id,
          title: schema.project.title,
          createdAt: schema.interactionEvent.createdAt,
        })
        .from(schema.interactionEvent)
        .innerJoin(schema.project, eq(schema.interactionEvent.projectId, schema.project.id))
        .where(
          and(
            eq(schema.interactionEvent.actorUserId, userId),
            eq(schema.interactionEvent.type, 'project_view'),
          ),
        )
        .orderBy(desc(schema.interactionEvent.createdAt))
        .limit(100),
      db
        .select({
          designerProfileId: schema.designerProfile.id,
          displayName: schema.designerProfile.displayName,
          createdAt: schema.interactionEvent.createdAt,
        })
        .from(schema.interactionEvent)
        .innerJoin(
          schema.designerProfile,
          eq(schema.interactionEvent.designerProfileId, schema.designerProfile.id),
        )
        .where(
          and(
            eq(schema.interactionEvent.actorUserId, userId),
            eq(schema.interactionEvent.type, 'profile_view'),
          ),
        )
        .orderBy(desc(schema.interactionEvent.createdAt))
        .limit(100),
    ]);
    return { searches, projectViews, profileViews };
  },
};
