import { and, db, desc, eq, schema, sql } from '@repo/db';
import type {
  AdminReviewsQuery,
  ListPublishedReviewsQuery,
  ReviewModerationAction,
  ReviewStatus,
} from '@repo/contracts';
import { recordSearchProjectionEvents } from '../search-index/repository.js';

export type ReviewRecord = typeof schema.review.$inferSelect;

export type ReviewViewRecord = ReviewRecord & {
  designerOrgId: string;
  authorName: string;
  authorImage: string | null;
  projectTitle: string | null;
  projectSlug: string | null;
};

export type ReviewAggregateRecord = {
  averageRating: number;
  reviewCount: number;
  histogram: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
};

export type CreateReviewParams = {
  designerProfileId: string;
  authorUserId: string;
  projectId?: string | null;
  bookingId?: string | null;
  rating: number;
  body?: string | null;
};

export type CreateReviewResult =
  | { kind: 'created'; review: ReviewViewRecord }
  | { kind: 'designer_not_found' }
  | { kind: 'phone_unverified' }
  | { kind: 'self_review' }
  | { kind: 'invalid_project' }
  | { kind: 'invalid_booking' }
  | { kind: 'duplicate' };

export type TransitionReviewParams = {
  id: string;
  designerProfileId: string;
  fromStatus: ReviewStatus;
  toStatus: ReviewStatus;
  expectedRevision: number;
  actorUserId: string;
  action: ReviewModerationAction;
  note?: string | null;
  reasonCode?: string | null;
  requiredWriter?: {
    organizationId: string;
    userId: string;
  };
};

export type UpdateReviewResult =
  | { kind: 'updated'; review: ReviewViewRecord }
  | { kind: 'conflict' }
  | { kind: 'phone_unverified' }
  | { kind: 'self_review' };

export type TransitionReviewResult =
  | { kind: 'updated'; review: ReviewViewRecord }
  | { kind: 'conflict' }
  | { kind: 'forbidden' };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Handle = typeof db | Tx;

function reviewProjection() {
  return {
    id: schema.review.id,
    designerProfileId: schema.review.designerProfileId,
    authorUserId: schema.review.authorUserId,
    projectId: schema.review.projectId,
    bookingId: schema.review.bookingId,
    rating: schema.review.rating,
    body: schema.review.body,
    status: schema.review.status,
    publishedAt: schema.review.publishedAt,
    disputedAt: schema.review.disputedAt,
    moderatedAt: schema.review.moderatedAt,
    moderationRevision: schema.review.moderationRevision,
    createdAt: schema.review.createdAt,
    updatedAt: schema.review.updatedAt,
    designerOrgId: schema.designerProfile.orgId,
    authorName: schema.user.name,
    authorImage: schema.user.image,
    projectTitle: schema.project.title,
    projectSlug: schema.project.slug,
  };
}

function reviewViewQuery(handle: Handle) {
  return handle
    .select(reviewProjection())
    .from(schema.review)
    .innerJoin(
      schema.designerProfile,
      eq(schema.review.designerProfileId, schema.designerProfile.id),
    )
    .innerJoin(schema.user, eq(schema.review.authorUserId, schema.user.id))
    .leftJoin(schema.project, eq(schema.review.projectId, schema.project.id));
}

async function findByIdWith(handle: Handle, id: string): Promise<ReviewViewRecord | null> {
  const [row] = await reviewViewQuery(handle).where(eq(schema.review.id, id)).limit(1);
  return row ?? null;
}

async function recomputeDesignerAggregate(
  tx: Tx,
  designerProfileId: string,
  sourceUpdatedAt: Date,
): Promise<void> {
  const [aggregate] = await tx
    .select({
      averageRating: sql<string>`coalesce(round(avg(${schema.review.rating})::numeric, 2), 0)::text`,
      reviewCount: sql<number>`count(*)::int`,
    })
    .from(schema.review)
    .where(
      and(
        eq(schema.review.designerProfileId, designerProfileId),
        eq(schema.review.status, 'published'),
      ),
    );

  await tx
    .update(schema.designerProfile)
    .set({
      avgRating: aggregate?.averageRating ?? '0',
      reviewCount: aggregate?.reviewCount ?? 0,
      updatedAt: sourceUpdatedAt,
    })
    .where(eq(schema.designerProfile.id, designerProfileId));

  await recordSearchProjectionEvents(tx, [
    {
      entityKind: 'designer',
      entityId: designerProfileId,
      operation: 'index',
      sourceUpdatedAt,
    },
  ]);
}

async function aggregatePublished(
  handle: Handle,
  designerProfileId: string,
): Promise<ReviewAggregateRecord> {
  const [row] = await handle
    .select({
      averageRating: sql<number>`coalesce(round(avg(${schema.review.rating})::numeric, 2), 0)::float8`,
      reviewCount: sql<number>`count(*)::int`,
      one: sql<number>`count(*) filter (where ${schema.review.rating} = 1)::int`,
      two: sql<number>`count(*) filter (where ${schema.review.rating} = 2)::int`,
      three: sql<number>`count(*) filter (where ${schema.review.rating} = 3)::int`,
      four: sql<number>`count(*) filter (where ${schema.review.rating} = 4)::int`,
      five: sql<number>`count(*) filter (where ${schema.review.rating} = 5)::int`,
    })
    .from(schema.review)
    .innerJoin(
      schema.designerProfile,
      eq(schema.review.designerProfileId, schema.designerProfile.id),
    )
    .where(
      and(
        eq(schema.review.designerProfileId, designerProfileId),
        eq(schema.review.status, 'published'),
        eq(schema.designerProfile.status, 'active'),
      ),
    );

  return {
    averageRating: row?.averageRating ?? 0,
    reviewCount: row?.reviewCount ?? 0,
    histogram: {
      1: row?.one ?? 0,
      2: row?.two ?? 0,
      3: row?.three ?? 0,
      4: row?.four ?? 0,
      5: row?.five ?? 0,
    },
  };
}

export const reviewsRepository = {
  async findById(id: string): Promise<ReviewViewRecord | null> {
    return findByIdWith(db, id);
  },

  async create(params: CreateReviewParams): Promise<CreateReviewResult> {
    const result = await db.transaction(async (tx) => {
      const [author] = await tx
        .select({ phoneNumberVerified: schema.user.phoneNumberVerified })
        .from(schema.user)
        .where(eq(schema.user.id, params.authorUserId))
        .limit(1)
        .for('update');
      if (author?.phoneNumberVerified !== true) return { kind: 'phone_unverified' } as const;

      const [designer] = await tx
        .select({
          id: schema.designerProfile.id,
          orgId: schema.designerProfile.orgId,
          ownerUserId: schema.designerProfile.userId,
        })
        .from(schema.designerProfile)
        .where(
          and(
            eq(schema.designerProfile.id, params.designerProfileId),
            eq(schema.designerProfile.status, 'active'),
          ),
        )
        .limit(1)
        .for('update');
      if (!designer) return { kind: 'designer_not_found' } as const;

      await tx
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .where(eq(schema.organization.id, designer.orgId))
        .for('update');

      const [membership] = await tx
        .select({ id: schema.member.id })
        .from(schema.member)
        .where(
          and(
            eq(schema.member.organizationId, designer.orgId),
            eq(schema.member.userId, params.authorUserId),
          ),
        )
        .limit(1);
      if (designer.ownerUserId === params.authorUserId || membership) {
        return { kind: 'self_review' } as const;
      }

      if (params.projectId) {
        const [project] = await tx
          .select({ id: schema.project.id })
          .from(schema.project)
          .where(
            and(
              eq(schema.project.id, params.projectId),
              eq(schema.project.designerId, designer.id),
              eq(schema.project.status, 'published'),
            ),
          )
          .limit(1);
        if (!project) return { kind: 'invalid_project' } as const;
      }

      if (params.bookingId) {
        const [booking] = await tx
          .select({ referredProjectId: schema.consultationBooking.referredProjectId })
          .from(schema.consultationBooking)
          .where(
            and(
              eq(schema.consultationBooking.id, params.bookingId),
              eq(schema.consultationBooking.designerProfileId, designer.id),
              eq(schema.consultationBooking.requesterId, params.authorUserId),
              eq(schema.consultationBooking.status, 'completed'),
            ),
          )
          .limit(1);
        if (
          !booking ||
          (params.projectId &&
            booking.referredProjectId !== null &&
            booking.referredProjectId !== params.projectId)
        ) {
          return { kind: 'invalid_booking' } as const;
        }
      }

      const [inserted] = await tx
        .insert(schema.review)
        .values({
          designerProfileId: designer.id,
          authorUserId: params.authorUserId,
          projectId: params.projectId ?? null,
          bookingId: params.bookingId ?? null,
          rating: params.rating,
          body: params.body ?? null,
        })
        .onConflictDoNothing()
        .returning({ id: schema.review.id });
      if (!inserted) return { kind: 'duplicate' } as const;

      await tx.insert(schema.reviewModerationEvent).values({
        reviewId: inserted.id,
        actorUserId: params.authorUserId,
        action: 'submit',
        fromStatus: null,
        toStatus: 'pending',
      });
      const review = await findByIdWith(tx, inserted.id);
      if (!review) throw new Error('inserted review not found');
      return { kind: 'created', review } as const;
    });

    return result;
  },

  async update(
    params: {
      id: string;
      authorUserId: string;
      designerProfileId: string;
      fromStatus: 'pending' | 'published';
      expectedRevision: number;
      rating?: number;
      body?: string | null;
    },
  ): Promise<UpdateReviewResult> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const [author] = await tx
        .select({ phoneNumberVerified: schema.user.phoneNumberVerified })
        .from(schema.user)
        .where(eq(schema.user.id, params.authorUserId))
        .limit(1)
        .for('update');
      if (author?.phoneNumberVerified !== true) {
        return { kind: 'phone_unverified' } as const;
      }

      const [designer] = await tx
        .select({
          id: schema.designerProfile.id,
          orgId: schema.designerProfile.orgId,
          ownerUserId: schema.designerProfile.userId,
        })
        .from(schema.designerProfile)
        .where(
          and(
            eq(schema.designerProfile.id, params.designerProfileId),
            eq(schema.designerProfile.status, 'active'),
          ),
        )
        .for('update');
      if (!designer) return { kind: 'conflict' } as const;

      await tx
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .where(eq(schema.organization.id, designer.orgId))
        .for('update');
      const [membership] = await tx
        .select({ id: schema.member.id })
        .from(schema.member)
        .where(
          and(
            eq(schema.member.organizationId, designer.orgId),
            eq(schema.member.userId, params.authorUserId),
          ),
        )
        .limit(1);
      if (designer.ownerUserId === params.authorUserId || membership) {
        return { kind: 'self_review' } as const;
      }

      const stateConditions = [
        eq(schema.review.id, params.id),
        eq(schema.review.authorUserId, params.authorUserId),
        eq(schema.review.status, params.fromStatus),
        eq(schema.review.moderationRevision, params.expectedRevision),
      ];
      if (params.fromStatus === 'published') {
        stateConditions.push(
          sql`${schema.review.publishedAt} >= clock_timestamp() - interval '24 hours'`,
        );
      }

      const [updated] = await tx
        .update(schema.review)
        .set({
          rating: params.rating,
          body: params.body,
          status: 'pending',
          publishedAt: null,
          disputedAt: null,
          moderatedAt: null,
          moderationRevision: sql`${schema.review.moderationRevision} + 1`,
          updatedAt: now,
        })
        .where(and(...stateConditions))
        .returning({ id: schema.review.id });
      if (!updated) return { kind: 'conflict' } as const;

      await tx.insert(schema.reviewModerationEvent).values({
        reviewId: updated.id,
        actorUserId: params.authorUserId,
        action: 'edit',
        fromStatus: params.fromStatus,
        toStatus: 'pending',
      });

      if (params.fromStatus === 'published') {
        await recomputeDesignerAggregate(tx, params.designerProfileId, now);
      }
      const review = await findByIdWith(tx, updated.id);
      if (!review) throw new Error('updated review not found');
      return { kind: 'updated', review } as const;
    });
  },

  async transition(params: TransitionReviewParams): Promise<TransitionReviewResult> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const enteringPublished = params.toStatus === 'published';
      const [designer] = await tx
        .select({
          id: schema.designerProfile.id,
          orgId: schema.designerProfile.orgId,
        })
        .from(schema.designerProfile)
        .where(eq(schema.designerProfile.id, params.designerProfileId))
        .for('update');
      if (!designer) return { kind: 'conflict' } as const;

      if (params.requiredWriter) {
        if (designer.orgId !== params.requiredWriter.organizationId) {
          return { kind: 'forbidden' } as const;
        }
        await tx
          .select({ id: schema.organization.id })
          .from(schema.organization)
          .where(eq(schema.organization.id, designer.orgId))
          .for('update');
        const [membership] = await tx
          .select({ role: schema.member.role })
          .from(schema.member)
          .where(
            and(
              eq(schema.member.organizationId, designer.orgId),
              eq(schema.member.userId, params.requiredWriter.userId),
            ),
          )
          .limit(1)
          .for('update');
        const canWrite = membership?.role
          .split(',')
          .some((role) => role.trim() === 'owner' || role.trim() === 'admin');
        if (!canWrite) return { kind: 'forbidden' } as const;
      }

      const [updated] = await tx
        .update(schema.review)
        .set({
          status: params.toStatus,
          publishedAt:
            params.toStatus === 'published'
              ? sql`coalesce(${schema.review.publishedAt}, ${now})`
              : params.toStatus === 'rejected'
                ? null
                : undefined,
          disputedAt:
            params.toStatus === 'disputed'
              ? now
              : params.toStatus === 'published' || params.toStatus === 'rejected'
                ? null
                : undefined,
          moderatedAt: params.action === 'dispute' ? undefined : now,
          moderationRevision: sql`${schema.review.moderationRevision} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.review.id, params.id),
            eq(schema.review.status, params.fromStatus),
            eq(schema.review.moderationRevision, params.expectedRevision),
          ),
        )
        .returning({ id: schema.review.id });
      if (!updated) return { kind: 'conflict' } as const;

      await tx.insert(schema.reviewModerationEvent).values({
        reviewId: updated.id,
        actorUserId: params.actorUserId,
        action: params.action,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        note: params.note ?? null,
        reasonCode: params.reasonCode ?? null,
      });

      if ((params.fromStatus === 'published') !== enteringPublished) {
        await recomputeDesignerAggregate(tx, params.designerProfileId, now);
      }
      const review = await findByIdWith(tx, updated.id);
      if (!review) throw new Error('transitioned review not found');
      return { kind: 'updated', review } as const;
    });
  },

  async listPublished(
    query: ListPublishedReviewsQuery,
  ): Promise<{ items: ReviewViewRecord[]; aggregate: ReviewAggregateRecord }> {
    return db.transaction(async (tx) => {
      const items = await reviewViewQuery(tx)
        .where(
          and(
            eq(schema.review.designerProfileId, query.designerProfileId),
            eq(schema.review.status, 'published'),
            eq(schema.designerProfile.status, 'active'),
          ),
        )
        .orderBy(desc(schema.review.publishedAt), desc(schema.review.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit);
      const aggregate = await aggregatePublished(tx, query.designerProfileId);
      return { items, aggregate };
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  },

  async listAdmin(
    query: AdminReviewsQuery,
  ): Promise<{ items: ReviewViewRecord[]; total: number }> {
    return db.transaction(async (tx) => {
      const where = eq(schema.review.status, query.status);
      const items = await reviewViewQuery(tx)
        .where(where)
        .orderBy(desc(schema.review.updatedAt), desc(schema.review.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit);
      const [count] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(schema.review)
        .where(where);
      return { items, total: count?.value ?? 0 };
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  },
};
