import { inArray } from 'drizzle-orm';
import { db, schema, eq, and, asc, sql } from '@repo/db';
import { config } from '@repo/config';
import type { UpdateImageMetadataInput } from '@repo/contracts';
import {
  getPendingProject,
  readProjectAggregate,
  mutateProjectAggregate,
  writePendingAggregate,
} from '../project-versions/repository.js';

/**
 * Data-access for media. The ONLY media layer that imports Drizzle.
 */
export type ProjectImageRecord = Omit<typeof schema.projectImage.$inferSelect, 'isLive'>;
export type ProjectImageListItem = Pick<
  ProjectImageRecord,
  | 'id'
  | 'roomId'
  | 'status'
  | 'sortOrder'
  | 'themeSlugs'
  | 'materialSlugs'
  | 'finishSlugs'
  | 'tagSlugs'
  | 'width'
  | 'height'
  | 'derivatives'
>;

export const mediaRepository = {
  /** Owning user of a project, via its designer profile. Null when the project is missing. */
  async findProjectOwner(projectId: string): Promise<{
    ownerUserId: string | null;
    projectStatus: typeof schema.project.$inferSelect.status;
  } | null> {
    const [row] = await db
      .select({
        ownerUserId: schema.designerProfile.userId,
        projectStatus: schema.project.status,
      })
      .from(schema.project)
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .where(eq(schema.project.id, projectId))
      .limit(1);
    const pending = row ? await getPendingProject(projectId) : null;
    return row ? { ...row, projectStatus: pending?.status ?? row.projectStatus } : null;
  },

  async createProcessing(input: {
    projectId: string;
    originalKey: string;
    contentType: string;
  }): Promise<ProjectImageRecord | null> {
    return db.transaction(async (tx) => {
      const [candidate] = await tx
        .select({ organizationId: schema.designerProfile.orgId })
        .from(schema.project)
        .innerJoin(schema.designerProfile, eq(schema.designerProfile.id, schema.project.designerId))
        .where(eq(schema.project.id, input.projectId))
        .limit(1);
      if (!candidate) return null;
      await tx.execute(
        sql`select pg_advisory_xact_lock_shared(hashtextextended(${`organization-retention:${candidate.organizationId}`}, 0))`,
      );
      const [project] = await tx
        .select({
          status: schema.project.status,
          organizationId: schema.designerProfile.orgId,
        })
        .from(schema.project)
        .innerJoin(schema.designerProfile, eq(schema.designerProfile.id, schema.project.designerId))
        .where(eq(schema.project.id, input.projectId))
        .for('update', { of: schema.project })
        .limit(1);
      if (
        !project ||
        !['draft', 'changes_requested', 'rejected', 'published'].includes(project.status)
      ) {
        return null;
      }
      const state =
        project.status === 'published' ? await readProjectAggregate(input.projectId, tx) : null;
      if (state?.pending && !['draft', 'changes_requested'].includes(state.pending.status))
        return null;
      const [retention] = await tx
        .select({ organizationId: schema.organizationRetention.organizationId })
        .from(schema.organizationRetention)
        .where(eq(schema.organizationRetention.organizationId, project.organizationId))
        .limit(1);
      if (retention) return null;
      const [row] = await tx
        .insert(schema.projectImage)
        .values({
          projectId: input.projectId,
          originalKey: input.originalKey,
          contentType: input.contentType,
          isLive: project.status !== 'published',
        })
        .returning();
      if (!row) throw new Error('insert returned no row');
      if (state) {
        const aggregate = state.current;
        aggregate.project.approvedImageIds ??= state.live.images.map((image) => image.id);
        aggregate.images.push(row);
        aggregate.project.status = state.pending?.status ?? 'draft';
        if (!state.pending) {
          aggregate.project.reviewedBy = null;
          aggregate.project.submittedAt = null;
          aggregate.project.reviewStartedAt = null;
          aggregate.project.moderationNote = null;
          aggregate.project.rejectionReasonCode = null;
          aggregate.project.rejectionReasonCodes = [];
        }
        await writePendingAggregate(tx, aggregate, (state.pending?.revision ?? 0) + 1);
      }
      await tx.insert(schema.organizationUploadLease).values({
        resourceKey: input.originalKey,
        organizationId: project.organizationId,
        expiresAt: new Date(Date.now() + config.R2_UPLOAD_URL_EXPIRY_SECONDS * 1_000),
      });
      return row;
    });
  },

  async cancelProcessingReservation(imageId: string, resourceKey: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(schema.projectImage).where(eq(schema.projectImage.id, imageId));
      await tx
        .delete(schema.organizationUploadLease)
        .where(eq(schema.organizationUploadLease.resourceKey, resourceKey));
    });
  },

  /** Image joined to its owning user (via project → designer). Null when the image is missing. */
  async findImageWithOwner(imageId: string): Promise<{
    id: string;
    projectId: string;
    originalKey: string;
    status: ProjectImageRecord['status'];
    projectStatus: typeof schema.project.$inferSelect.status;
    ownerUserId: string | null;
  } | null> {
    const [row] = await db
      .select({
        id: schema.projectImage.id,
        projectId: schema.projectImage.projectId,
        originalKey: schema.projectImage.originalKey,
        status: schema.projectImage.status,
        projectStatus: schema.project.status,
        ownerUserId: schema.designerProfile.userId,
      })
      .from(schema.projectImage)
      .innerJoin(schema.project, eq(schema.projectImage.projectId, schema.project.id))
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .where(eq(schema.projectImage.id, imageId))
      .limit(1);
    const state = row ? await readProjectAggregate(row.projectId) : null;
    if (row && state && !state.current.images.some((image) => image.id === imageId)) return null;
    return row
      ? { ...row, projectStatus: state?.current.project.status ?? row.projectStatus }
      : null;
  },

  async roomBelongsToProject(roomId: string, projectId: string): Promise<boolean> {
    const state = await readProjectAggregate(projectId);
    if (state) return state.current.rooms.some((room) => room.id === roomId);
    const [row] = await db
      .select({ id: schema.projectRoom.id })
      .from(schema.projectRoom)
      .where(and(eq(schema.projectRoom.id, roomId), eq(schema.projectRoom.projectId, projectId)))
      .limit(1);
    return !!row;
  },

  async taxonomySlugsExist(
    kind: (typeof schema.taxonomyKindEnum.enumValues)[number],
    slugs: string[],
  ): Promise<boolean> {
    const uniqueSlugs = [...new Set(slugs)];
    if (uniqueSlugs.length === 0) return true;

    const rows = await db
      .select({ slug: schema.taxonomy.slug })
      .from(schema.taxonomy)
      .where(and(eq(schema.taxonomy.kind, kind), inArray(schema.taxonomy.slug, uniqueSlugs)));
    return rows.length === uniqueSlugs.length;
  },

  async updateMetadata(
    imageId: string,
    input: UpdateImageMetadataInput,
  ): Promise<ProjectImageRecord | null> {
    const [asset] = await db
      .select({ projectId: schema.projectImage.projectId })
      .from(schema.projectImage)
      .where(eq(schema.projectImage.id, imageId))
      .limit(1);
    if (!asset) return null;
    const versioned = await mutateProjectAggregate(asset.projectId, (aggregate) => {
      const image = aggregate.images.find((candidate) => candidate.id === imageId);
      if (!image) return null;
      Object.assign(image, input);
      return image;
    });
    return versioned?.value ?? null;
  },

  async listByProject(
    projectId: string,
    page: { limit: number; offset: number },
  ): Promise<ProjectImageListItem[]> {
    const state = await readProjectAggregate(projectId);
    if (state)
      return state.current.images
        .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime())
        .slice(page.offset, page.offset + page.limit);
    return db
      .select({
        id: schema.projectImage.id,
        roomId: schema.projectImage.roomId,
        status: schema.projectImage.status,
        sortOrder: schema.projectImage.sortOrder,
        themeSlugs: schema.projectImage.themeSlugs,
        materialSlugs: schema.projectImage.materialSlugs,
        finishSlugs: schema.projectImage.finishSlugs,
        tagSlugs: schema.projectImage.tagSlugs,
        width: schema.projectImage.width,
        height: schema.projectImage.height,
        derivatives: schema.projectImage.derivatives,
      })
      .from(schema.projectImage)
      .where(eq(schema.projectImage.projectId, projectId))
      .orderBy(asc(schema.projectImage.sortOrder), asc(schema.projectImage.createdAt))
      .limit(page.limit)
      .offset(page.offset);
  },
};
