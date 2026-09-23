import type {
  AdminActivitySummary,
  AdminEnquiriesQuery,
  AdminEnquiriesResponse,
  AdminUserActivityResponse,
  AdminUsersQuery,
  AdminUsersResponse,
} from '@repo/contracts';
import { adminActivityRepository } from './repository.js';

const iso = (value: Date) => value.toISOString();

export const adminActivityService = {
  summary(): Promise<AdminActivitySummary> {
    return adminActivityRepository.summary();
  },

  async listUsers(query: AdminUsersQuery): Promise<AdminUsersResponse> {
    const result = await adminActivityRepository.listUsers(query);
    return {
      items: result.items.map((item) => ({
        ...item,
        banned: item.banned ?? false,
        createdAt: iso(item.createdAt),
        lastActiveAt: item.lastActiveAt ? iso(item.lastActiveAt) : null,
      })),
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    };
  },

  async listEnquiries(query: AdminEnquiriesQuery): Promise<AdminEnquiriesResponse> {
    const result = await adminActivityRepository.listEnquiries(query);
    return {
      items: result.items.map((item) => ({
        id: item.id,
        requester: { id: item.requesterId, name: item.requesterName, email: item.requesterEmail },
        designer: { id: item.designerId, displayName: item.designerDisplayName },
        organizationId: item.organizationId,
        referredProject:
          item.referredProjectId && item.referredProjectTitle
            ? { id: item.referredProjectId, title: item.referredProjectTitle }
            : null,
        subject: item.subject,
        budget: item.budget,
        timeline: item.timeline,
        status: item.status,
        createdAt: iso(item.createdAt),
        updatedAt: iso(item.updatedAt),
      })),
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    };
  },

  async userActivity(userId: string): Promise<AdminUserActivityResponse> {
    const activity = await adminActivityRepository.userActivity(userId);
    return {
      searches: activity.searches.map((item) => ({ ...item, createdAt: iso(item.createdAt) })),
      projectViews: activity.projectViews.map((item) => ({
        ...item,
        createdAt: iso(item.createdAt),
      })),
      profileViews: activity.profileViews.map((item) => ({
        ...item,
        createdAt: iso(item.createdAt),
      })),
    };
  },
};
