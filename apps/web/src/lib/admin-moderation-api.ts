import type {
  AdminCorrectProjectInput,
  AdminModerationDetailResponse,
  AdminModerationQueueResponse,
  ModerationNoteInput,
  RejectProjectInput,
  CreateProjectReviewCommentInput,
  UpdateProjectReviewCommentInput,
} from '@repo/contracts';
import {
  adminModerationDetailResponseSchema,
  adminModerationQueueResponseSchema,
  projectReviewCommentSchema,
} from '@repo/contracts';
import { api } from '@/lib/api';

type ServerRequestInit = { headers: { cookie: string } };

export const ADMIN_MODERATION_QUEUE_TABS = ['submitted', 'in_review', 'published'] as const;
export type AdminModerationQueueTab = (typeof ADMIN_MODERATION_QUEUE_TABS)[number];

function parseDetail(payload: unknown): AdminModerationDetailResponse {
  const parsed = adminModerationDetailResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error('The moderation detail response was invalid.');
  return parsed.data;
}

export async function fetchAdminModerationQueue(
  status: AdminModerationQueueTab,
  page = 1,
  requestInit?: ServerRequestInit,
): Promise<AdminModerationQueueResponse> {
  const response = await api.api.admin.projects.$get(
    { query: { status, sort: 'oldest', page: String(page), limit: '20' } },
    requestInit,
  );
  if (!response.ok) throw new Error('Could not load the moderation queue.');

  const parsed = adminModerationQueueResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('The moderation queue response was invalid.');
  return parsed.data;
}

function parseComment(payload: unknown) {
  const parsed = projectReviewCommentSchema.safeParse(payload);
  if (!parsed.success) throw new Error('The review comment response was invalid.');
  return parsed.data;
}

export async function createAdminReviewComment(
  projectId: string,
  input: CreateProjectReviewCommentInput,
) {
  const response = await api.api.admin.projects[':id']['review-comments'].$post({
    param: { id: projectId },
    json: input,
  });
  if (!response.ok)
    throw new Error('Could not add the review comment. Refresh the review and try again.');
  return parseComment(await response.json());
}

export async function updateAdminReviewComment(
  projectId: string,
  commentId: string,
  input: UpdateProjectReviewCommentInput,
) {
  const response = await api.api.admin.projects[':id']['review-comments'][':commentId'].$patch({
    param: { id: projectId, commentId },
    json: input,
  });
  if (!response.ok)
    throw new Error('Could not update the review comment. Refresh the review and try again.');
  return parseComment(await response.json());
}

export async function fetchAdminModerationDetail(projectId: string) {
  const response = await api.api.admin.projects[':id'].$get({ param: { id: projectId } });
  if (!response.ok) throw new Error('Could not load this project review.');
  return parseDetail(await response.json());
}

export async function startAdminReview(projectId: string) {
  const response = await api.api.admin.projects[':id']['start-review'].$post({
    param: { id: projectId },
  });
  if (!response.ok) throw new Error('Could not claim this project for review.');
  return parseDetail(await response.json());
}

export async function publishAdminProject(projectId: string) {
  const response = await api.api.admin.projects[':id'].publish.$post({ param: { id: projectId } });
  if (!response.ok) throw new Error('Could not publish this project.');
  return parseDetail(await response.json());
}

export async function requestAdminChanges(projectId: string, input: ModerationNoteInput) {
  const response = await api.api.admin.projects[':id']['request-changes'].$post({
    param: { id: projectId },
    json: input,
  });
  if (!response.ok) throw new Error('Could not request changes.');
  return parseDetail(await response.json());
}

export async function rejectAdminProject(projectId: string, input: RejectProjectInput) {
  const response = await api.api.admin.projects[':id'].reject.$post({
    param: { id: projectId },
    json: input,
  });
  if (!response.ok) throw new Error('Could not reject this project.');
  return parseDetail(await response.json());
}

export async function unpublishAdminProject(projectId: string, input: ModerationNoteInput) {
  const response = await api.api.admin.projects[':id'].unpublish.$post({
    param: { id: projectId },
    json: input,
  });
  if (!response.ok) throw new Error('Could not unpublish this project.');
  return parseDetail(await response.json());
}

export async function correctAdminProject(projectId: string, input: AdminCorrectProjectInput) {
  const response = await api.api.admin.projects[':id'].$patch({
    param: { id: projectId },
    json: input,
  });
  if (!response.ok) throw new Error('Could not save this metadata correction.');
  return parseDetail(await response.json());
}
