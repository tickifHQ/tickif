import { db, schema, eq, and, asc, isNotNull, sql } from '@repo/db';
import type {
  AdminCorrectProjectInput,
  AdminModerationQueueQuery,
  ModerationFieldDiff,
} from '@repo/contracts';

export type AdminProjectRecord = typeof schema.project.$inferSelect & {
  designerName: string;
};

export type AdminQueueRecord = Pick<
  typeof schema.project.$inferSelect,
  | 'id'
  | 'title'
  | 'status'
  | 'submittedAt'
  | 'reviewedBy'
  | 'citySlug'
  | 'propertyTypeSlug'
  | 'scopeSlug'
  | 'budgetBandSlug'
> & {
  designerName: string;
  imageCount: number;
  taggedImageCount: number;
};

export type AdminImageRecord = typeof schema.projectImage.$inferSelect;
export type AdminRoomRecord = typeof schema.projectRoom.$inferSelect;
export type AdminModerationEventRecord = typeof schema.projectModerationEvent.$inferSelect;
export type AdminReviewCommentRecord = typeof schema.projectReviewComment.$inferSelect;
export type AdminReviewCommentMutationResult =
  | AdminReviewCommentRecord
  | 'project_changed'
  | null;

type CorrectionPatch = Omit<AdminCorrectProjectInput, 'featuredAt'> & {
  featuredAt?: Date | null;
};

export const adminProjectsRepository = {
  async list(
    query: AdminModerationQueueQuery,
    reviewerId?: string,
  ): Promise<{ items: AdminQueueRecord[]; total: number }> {
    const where = and(
      eq(schema.project.status, query.status),
      reviewerId ? eq(schema.project.reviewedBy, reviewerId) : undefined,
    );
    const queuePage = db
      .select({
        id: schema.project.id,
        title: schema.project.title,
        status: schema.project.status,
        submittedAt: schema.project.submittedAt,
        reviewedBy: schema.project.reviewedBy,
        citySlug: schema.project.citySlug,
        propertyTypeSlug: schema.project.propertyTypeSlug,
        scopeSlug: schema.project.scopeSlug,
        budgetBandSlug: schema.project.budgetBandSlug,
        designerName: schema.designerProfile.displayName,
      })
      .from(schema.project)
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .where(where)
      .orderBy(sql`${schema.project.submittedAt} asc nulls last`, asc(schema.project.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .as('queue_page');
    const pageImageCounts = db
      .select({
        imageCount: sql<number>`count(*)::int`.as('image_count'),
        taggedImageCount: sql<number>`
          count(*) filter (
            where jsonb_array_length(${schema.projectImage.themeSlugs}) > 0
              and jsonb_array_length(${schema.projectImage.finishSlugs}) > 0
          )::int
        `.as('tagged_image_count'),
      })
      .from(schema.projectImage)
      .where(
        and(
          eq(schema.projectImage.projectId, queuePage.id),
          eq(schema.projectImage.status, 'ready'),
          isNotNull(schema.projectImage.roomId),
        ),
      )
      .as('page_image_counts');

    const [rows, [count]] = await Promise.all([
      db
        .select({
          id: queuePage.id,
          title: queuePage.title,
          status: queuePage.status,
          submittedAt: queuePage.submittedAt,
          reviewedBy: queuePage.reviewedBy,
          citySlug: queuePage.citySlug,
          propertyTypeSlug: queuePage.propertyTypeSlug,
          scopeSlug: queuePage.scopeSlug,
          budgetBandSlug: queuePage.budgetBandSlug,
          designerName: queuePage.designerName,
          imageCount: sql<number>`coalesce(${pageImageCounts.imageCount}, 0)::int`,
          taggedImageCount: sql<number>`coalesce(${pageImageCounts.taggedImageCount}, 0)::int`,
        })
        .from(queuePage)
        .leftJoinLateral(pageImageCounts, sql`true`)
        .orderBy(sql`${queuePage.submittedAt} asc nulls last`, asc(queuePage.id)),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(schema.project)
        .where(where),
    ]);
    return { items: rows, total: count?.value ?? 0 };
  },

  async findById(id: string): Promise<AdminProjectRecord | null> {
    const [row] = await db
      .select({
        project: schema.project,
        designerName: schema.designerProfile.displayName,
      })
      .from(schema.project)
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .where(eq(schema.project.id, id))
      .limit(1);
    return row ? { ...row.project, designerName: row.designerName } : null;
  },

  async listRooms(projectId: string): Promise<AdminRoomRecord[]> {
    return db
      .select()
      .from(schema.projectRoom)
      .where(eq(schema.projectRoom.projectId, projectId))
      .orderBy(asc(schema.projectRoom.sortOrder), asc(schema.projectRoom.createdAt));
  },

  async listImages(projectId: string): Promise<AdminImageRecord[]> {
    return db
      .select()
      .from(schema.projectImage)
      .where(eq(schema.projectImage.projectId, projectId))
      .orderBy(asc(schema.projectImage.sortOrder), asc(schema.projectImage.createdAt));
  },

  async getReadyImageCounts(
    projectId: string,
  ): Promise<{ imageCount: number; taggedImageCount: number }> {
    const [row] = await db
      .select({
        imageCount: sql<number>`count(*)::int`,
        taggedImageCount: sql<number>`
          count(*) filter (
            where jsonb_array_length(${schema.projectImage.themeSlugs}) > 0
              and jsonb_array_length(${schema.projectImage.finishSlugs}) > 0
          )::int
        `,
      })
      .from(schema.projectImage)
      .where(
        and(
          eq(schema.projectImage.projectId, projectId),
          eq(schema.projectImage.status, 'ready'),
          isNotNull(schema.projectImage.roomId),
        ),
      );
    return {
      imageCount: row?.imageCount ?? 0,
      taggedImageCount: row?.taggedImageCount ?? 0,
    };
  },

  async listHistory(projectId: string): Promise<AdminModerationEventRecord[]> {
    return db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, projectId))
      .orderBy(asc(schema.projectModerationEvent.createdAt), asc(schema.projectModerationEvent.id));
  },

  async listReviewComments(projectId: string): Promise<AdminReviewCommentRecord[]> {
    return db
      .select()
      .from(schema.projectReviewComment)
      .where(eq(schema.projectReviewComment.projectId, projectId))
      .orderBy(asc(schema.projectReviewComment.createdAt), asc(schema.projectReviewComment.id));
  },

  async hasUnresolvedReviewComments(projectId: string): Promise<boolean> {
    const [comment] = await db
      .select({ id: schema.projectReviewComment.id })
      .from(schema.projectReviewComment)
      .where(
        and(
          eq(schema.projectReviewComment.projectId, projectId),
          eq(schema.projectReviewComment.status, 'unresolved'),
        ),
      )
      .limit(1);
    return !!comment;
  },

  async createReviewComment(input: {
    projectId: string;
    authorId: string;
    body: string;
    expectedStatus: 'submitted' | 'in_review';
    expectedReviewerId: string | null;
  }): Promise<AdminReviewCommentMutationResult> {
    return db.transaction(async (tx) => {
      const [project] = await tx
        .select({ status: schema.project.status, reviewedBy: schema.project.reviewedBy })
        .from(schema.project)
        .where(eq(schema.project.id, input.projectId))
        .for('update')
        .limit(1);
      if (
        !project ||
        project.status !== input.expectedStatus ||
        project.reviewedBy !== input.expectedReviewerId
      ) {
        return 'project_changed';
      }

      const [comment] = await tx
        .insert(schema.projectReviewComment)
        .values({ projectId: input.projectId, authorId: input.authorId, body: input.body })
        .returning();
      return comment ?? null;
    });
  },

  async updateReviewComment(input: {
    projectId: string;
    commentId: string;
    status: AdminReviewCommentRecord['status'];
    expectedStatus: AdminProjectRecord['status'];
    expectedReviewerId: string | null;
  }): Promise<AdminReviewCommentMutationResult> {
    return db.transaction(async (tx) => {
      const [project] = await tx
        .select({ status: schema.project.status, reviewedBy: schema.project.reviewedBy })
        .from(schema.project)
        .where(eq(schema.project.id, input.projectId))
        .for('update')
        .limit(1);
      if (
        !project ||
        project.status !== input.expectedStatus ||
        project.reviewedBy !== input.expectedReviewerId
      ) {
        return 'project_changed';
      }

      const [comment] = await tx
        .update(schema.projectReviewComment)
        .set({ status: input.status, updatedAt: new Date() })
        .where(
          and(
            eq(schema.projectReviewComment.id, input.commentId),
            eq(schema.projectReviewComment.projectId, input.projectId),
          ),
        )
        .returning();
      return comment ?? null;
    });
  },

  async correctMetadata(input: {
    projectId: string;
    actorUserId: string;
    patch: CorrectionPatch;
    fieldDiff: ModerationFieldDiff;
    expectedRevision: number;
  }): Promise<AdminProjectRecord | null> {
    return db.transaction(async (tx) => {
      const { metadata, ...patch } = input.patch;
      const [updated] = await tx
        .update(schema.project)
        .set({
          ...patch,
          ...(metadata === undefined
            ? {}
            : {
                metadata: sql`coalesce(${schema.project.metadata}, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb`,
              }),
          moderationRevision: sql`${schema.project.moderationRevision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.project.id, input.projectId),
            eq(schema.project.status, 'in_review'),
            eq(schema.project.moderationRevision, input.expectedRevision),
          ),
        )
        .returning();
      if (!updated) return null;

      await tx.insert(schema.projectModerationEvent).values({
        projectId: input.projectId,
        actorUserId: input.actorUserId,
        action: 'metadata_corrected',
        fromStatus: 'in_review',
        toStatus: 'in_review',
        fieldDiff: input.fieldDiff,
      });

      const [designer] = await tx
        .select({ designerName: schema.designerProfile.displayName })
        .from(schema.designerProfile)
        .where(eq(schema.designerProfile.id, updated.designerId))
        .limit(1);
      if (!designer) throw new Error('designer profile not found after project correction');
      return { ...updated, designerName: designer.designerName };
    });
  },
};
