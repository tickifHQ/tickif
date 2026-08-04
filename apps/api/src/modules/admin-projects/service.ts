import type {
  AdminCorrectProjectInput,
  AdminModerationDetailResponse,
  AdminModerationImage,
  AdminModerationProject,
  AdminModerationQueueQuery,
  AdminModerationQueueResponse,
  ModerationFieldDiff,
  ModerationHistoryItem,
  ModerationNoteInput,
  RejectProjectInput,
} from '@repo/contracts';
import { presignDownload } from '@repo/storage';
import { isDeepStrictEqual } from 'node:util';
import { AppError } from '../../lib/errors.js';
import {
  buildCompleteness,
  transitionProject,
  validateProjectTaxonomy,
  type TransitionCaller,
} from '../projects/service.js';
import {
  adminProjectsRepository,
  type AdminImageRecord,
  type AdminModerationEventRecord,
  type AdminProjectRecord,
  type AdminRoomRecord,
} from './repository.js';

export type AdminCaller = TransitionCaller;

function toProject(row: AdminProjectRecord): AdminModerationProject {
  return {
    id: row.id,
    designerId: row.designerId,
    designerName: row.designerName,
    title: row.title,
    slug: row.slug,
    status: row.status,
    description: row.description,
    propertyTypeSlug: row.propertyTypeSlug,
    propertySubtypeSlug: row.propertySubtypeSlug,
    scopeSlug: row.scopeSlug,
    bhkSlug: row.bhkSlug,
    sizeSqft: row.sizeSqft,
    citySlug: row.citySlug,
    localitySlug: row.localitySlug,
    buildingName: row.buildingName,
    budgetBandSlug: row.budgetBandSlug,
    coverImageId: row.coverImageId,
    completedMonth: row.completedMonth,
    durationMonths: row.durationMonths,
    metadata: row.metadata ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    reviewedBy: row.reviewedBy,
    reviewStartedAt: row.reviewStartedAt?.toISOString() ?? null,
    rejectionReasonCode: row.rejectionReasonCode,
    moderationNote: row.moderationNote,
    featuredAt: row.featuredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRoom(row: AdminRoomRecord): AdminModerationDetailResponse['rooms'][number] {
  return {
    id: row.id,
    projectId: row.projectId,
    roomTypeId: row.roomTypeId,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toHistory(row: AdminModerationEventRecord): ModerationHistoryItem {
  return {
    id: row.id,
    action: row.action,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    actorLabel: 'Tickif Review Team',
    note: row.note,
    reasonCode: row.reasonCode,
    fieldDiff: row.fieldDiff,
    createdAt: row.createdAt.toISOString(),
  };
}

async function toImage(row: AdminImageRecord): Promise<AdminModerationImage> {
  const originalUrl =
    row.status === 'failed'
      ? null
      : await presignDownload({ key: row.originalKey }).catch(() => null);
  return {
    id: row.id,
    roomId: row.roomId,
    originalUrl,
    status: row.status,
    themeSlugs: row.themeSlugs,
    materialSlugs: row.materialSlugs,
    finishSlugs: row.finishSlugs,
    tagSlugs: row.tagSlugs,
    width: row.width,
    height: row.height,
    sortOrder: row.sortOrder,
    duplicate:
      row.duplicateOfImageId && row.duplicateDistance !== null
        ? { imageId: row.duplicateOfImageId, distance: row.duplicateDistance }
        : null,
  };
}

function correctionPatch(
  input: AdminCorrectProjectInput,
): Omit<AdminCorrectProjectInput, 'featuredAt'> & { featuredAt?: Date | null } {
  const { featuredAt, ...patch } = input;
  if (featuredAt === undefined) return patch;
  return { ...patch, featuredAt: featuredAt === null ? null : new Date(featuredAt) };
}

function correctionDiff(
  existing: AdminProjectRecord,
  input: AdminCorrectProjectInput,
): ModerationFieldDiff {
  const diff: ModerationFieldDiff = {};
  for (const [field, nextValue] of Object.entries(input)) {
    const previousValue =
      field === 'featuredAt'
        ? (existing.featuredAt?.toISOString() ?? null)
        : existing[field as keyof AdminProjectRecord];
    const correctedValue =
      field === 'metadata'
        ? { ...(existing.metadata ?? {}), ...(nextValue as Record<string, unknown>) }
        : nextValue;
    if (!isDeepStrictEqual(previousValue, correctedValue)) {
      diff[field] = { from: previousValue, to: correctedValue };
    }
  }
  return diff;
}

function assertReviewOwner(project: AdminProjectRecord, caller: AdminCaller): void {
  if (project.status !== 'in_review') throw AppError.invalidTransition();
  if (caller.userRole === 'superadmin') return;
  if (project.reviewedBy !== caller.userId) {
    throw AppError.forbidden('Project is assigned to another reviewer');
  }
}

export const adminProjectsService = {
  async list(
    query: AdminModerationQueueQuery,
    caller: AdminCaller,
  ): Promise<AdminModerationQueueResponse> {
    const reviewerId =
      query.status === 'in_review' && caller.userRole !== 'superadmin' ? caller.userId : undefined;
    const { items, total } = await adminProjectsRepository.list(query, reviewerId);
    return {
      items: items.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status as 'submitted' | 'in_review' | 'published',
        designerName: row.designerName,
        submittedAt: row.submittedAt?.toISOString() ?? null,
        reviewedBy: row.reviewedBy,
        imageCount: row.imageCount,
        completeness: buildCompleteness(row, {
          imageCount: row.imageCount,
          taggedImageCount: row.taggedImageCount,
        }),
      })),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
    };
  },

  async getById(projectId: string): Promise<AdminModerationDetailResponse> {
    const project = await adminProjectsRepository.findById(projectId);
    if (!project) throw AppError.notFound('Project not found');
    // Admin completeness is ready-only so it matches the publish gate, unlike designer grace.
    const [rooms, images, readyImageCounts, history] = await Promise.all([
      adminProjectsRepository.listRooms(projectId),
      adminProjectsRepository.listImages(projectId),
      adminProjectsRepository.getReadyImageCounts(projectId),
      adminProjectsRepository.listHistory(projectId),
    ]);
    return {
      project: toProject(project),
      rooms: rooms.map(toRoom),
      images: await Promise.all(images.map(toImage)),
      completeness: buildCompleteness(project, readyImageCounts),
      history: history.map(toHistory),
    };
  },

  async startReview(
    projectId: string,
    caller: AdminCaller,
  ): Promise<AdminModerationDetailResponse> {
    const project = await adminProjectsRepository.findById(projectId);
    if (!project) throw AppError.notFound('Project not found');
    if (project.status !== 'submitted') throw AppError.invalidTransition();
    await transitionProject(
      {
        projectId,
        toStatus: 'in_review',
        patch: {
          reviewedBy: caller.userId,
          reviewStartedAt: new Date(),
          moderationNote: null,
          rejectionReasonCode: null,
        },
        expectedModerationRevision: project.moderationRevision,
      },
      caller,
    );
    return this.getById(projectId);
  },

  async publish(projectId: string, caller: AdminCaller): Promise<AdminModerationDetailResponse> {
    const project = await adminProjectsRepository.findById(projectId);
    if (!project) throw AppError.notFound('Project not found');
    assertReviewOwner(project, caller);
    const completeness = buildCompleteness(
      project,
      await adminProjectsRepository.getReadyImageCounts(projectId),
    );
    if (!completeness.complete) {
      throw AppError.conflict('Project is incomplete and cannot be published', completeness);
    }
    await transitionProject(
      {
        projectId,
        toStatus: 'published',
        patch: {
          publishedAt: project.publishedAt ?? new Date(),
          moderationNote: null,
          rejectionReasonCode: null,
        },
        expectedModerationRevision: project.moderationRevision,
      },
      caller,
    );
    return this.getById(projectId);
  },

  async requestChanges(
    projectId: string,
    input: ModerationNoteInput,
    caller: AdminCaller,
  ): Promise<AdminModerationDetailResponse> {
    const project = await adminProjectsRepository.findById(projectId);
    if (!project) throw AppError.notFound('Project not found');
    assertReviewOwner(project, caller);
    await transitionProject(
      {
        projectId,
        toStatus: 'changes_requested',
        note: input.note,
        patch: { moderationNote: input.note, rejectionReasonCode: null },
      },
      caller,
    );
    return this.getById(projectId);
  },

  async reject(
    projectId: string,
    input: RejectProjectInput,
    caller: AdminCaller,
  ): Promise<AdminModerationDetailResponse> {
    const project = await adminProjectsRepository.findById(projectId);
    if (!project) throw AppError.notFound('Project not found');
    assertReviewOwner(project, caller);
    await transitionProject(
      {
        projectId,
        toStatus: 'rejected',
        note: input.note,
        reasonCode: input.reasonCode,
        patch: {
          moderationNote: input.note,
          rejectionReasonCode: input.reasonCode,
        },
      },
      caller,
    );
    return this.getById(projectId);
  },

  async unpublish(
    projectId: string,
    input: ModerationNoteInput,
    caller: AdminCaller,
  ): Promise<AdminModerationDetailResponse> {
    const project = await adminProjectsRepository.findById(projectId);
    if (!project) throw AppError.notFound('Project not found');
    if (project.status !== 'published') throw AppError.invalidTransition();
    await transitionProject(
      {
        projectId,
        toStatus: 'in_review',
        note: input.note,
        patch: {
          reviewedBy: caller.userId,
          reviewStartedAt: new Date(),
          moderationNote: input.note,
        },
        expectedModerationRevision: project.moderationRevision,
      },
      caller,
    );
    return this.getById(projectId);
  },

  async correct(
    projectId: string,
    input: AdminCorrectProjectInput,
    caller: AdminCaller,
  ): Promise<AdminModerationDetailResponse> {
    const existing = await adminProjectsRepository.findById(projectId);
    if (!existing) throw AppError.notFound('Project not found');
    assertReviewOwner(existing, caller);
    await validateProjectTaxonomy(input, existing);
    const fieldDiff = correctionDiff(existing, input);
    if (Object.keys(fieldDiff).length === 0) return this.getById(projectId);

    const updated = await adminProjectsRepository.correctMetadata({
      projectId,
      actorUserId: caller.userId,
      patch: correctionPatch(input),
      fieldDiff,
      expectedRevision: existing.moderationRevision,
    });
    if (!updated) throw AppError.invalidTransition();
    return this.getById(projectId);
  },
};
