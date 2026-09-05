import {
  SEARCH_PROJECTION_ADVISORY_LOCK_KEY,
  db,
  schema,
  eq,
  and,
  or,
  ne,
  inArray,
  isNotNull,
  asc,
  sql,
  type DB,
} from '@repo/db';
import { PHASH_HEX_LEN, type PhashCandidate } from './phash.js';

export type ProcessingImage = {
  id: string;
  projectId: string;
  originalKey: string;
  contentType: string;
  derivatives: schema.ProjectImageDerivative[];
  status: (typeof schema.projectImageStatusEnum.enumValues)[number];
};

type Transaction = Parameters<Parameters<DB['transaction']>[0]>[0];

async function findImageForProcessing(
  tx: Transaction,
  imageId: string,
): Promise<(ProcessingImage & { organizationId: string }) | null> {
  const [row] = await tx
    .select({
      id: schema.projectImage.id,
      projectId: schema.projectImage.projectId,
      originalKey: schema.projectImage.originalKey,
      contentType: schema.projectImage.contentType,
      derivatives: schema.projectImage.derivatives,
      status: schema.projectImage.status,
      organizationId: schema.designerProfile.orgId,
    })
    .from(schema.projectImage)
    .innerJoin(schema.project, eq(schema.project.id, schema.projectImage.projectId))
    .innerJoin(schema.designerProfile, eq(schema.designerProfile.id, schema.project.designerId))
    .where(eq(schema.projectImage.id, imageId))
    .limit(1);
  return row ?? null;
}

/** Keep organization purge out until an in-flight media job has finished writing objects. */
export async function withMediaProcessingLease<T>(
  imageId: string,
  task: (image: ProcessingImage) => Promise<T>,
): Promise<T | null> {
  return db.transaction(async (tx) => {
    const candidate = await findImageForProcessing(tx, imageId);
    if (!candidate) return null;
    await tx.execute(
      sql`select pg_advisory_xact_lock_shared(hashtextextended(${`organization-retention:${candidate.organizationId}`}, 0))`,
    );
    const image = await findImageForProcessing(tx, imageId);
    if (!image) return null;
    const [retention] = await tx
      .select({ organizationId: schema.organizationRetention.organizationId })
      .from(schema.organizationRetention)
      .where(eq(schema.organizationRetention.organizationId, image.organizationId))
      .limit(1);
    if (retention) return null;
    return task(image);
  });
}

export async function getImageForProcessing(imageId: string): Promise<ProcessingImage | null> {
  const [row] = await db
    .select({
      id: schema.projectImage.id,
      projectId: schema.projectImage.projectId,
      originalKey: schema.projectImage.originalKey,
      contentType: schema.projectImage.contentType,
      derivatives: schema.projectImage.derivatives,
      status: schema.projectImage.status,
    })
    .from(schema.projectImage)
    .where(eq(schema.projectImage.id, imageId))
    .limit(1);
  return row ?? null;
}

/** Compare-and-swap: only the run that still owns `processing` flips to ready. Returns false if it lost the race. */
export async function markReady(
  imageId: string,
  data: {
    derivatives: schema.ProjectImageDerivative[];
    width: number;
    height: number;
    phash: string;
    duplicateOfImageId: string | null;
    duplicateDistance: number | null;
  },
): Promise<boolean> {
  const rows = await db
    .update(schema.projectImage)
    .set({
      ...data,
      duplicateCheckedAt: new Date(),
      status: 'ready',
      updatedAt: new Date(),
    })
    .where(and(eq(schema.projectImage.id, imageId), eq(schema.projectImage.status, 'processing')))
    .returning({ id: schema.projectImage.id });
  return rows.length > 0;
}

/** Replace public derivatives in place while keeping an already-ready image available. */
export async function refreshReadyDerivatives(
  imageId: string,
  data: {
    derivatives: schema.ProjectImageDerivative[];
    width: number;
    height: number;
  },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [image] = await tx
      .update(schema.projectImage)
      .set({ ...data, updatedAt: now })
      .where(and(eq(schema.projectImage.id, imageId), eq(schema.projectImage.status, 'ready')))
      .returning({
        id: schema.projectImage.id,
        projectId: schema.projectImage.projectId,
      });
    if (!image) return false;

    const [project] = await tx
      .select({ status: schema.project.status })
      .from(schema.project)
      .where(eq(schema.project.id, image.projectId))
      .limit(1);
    if (project?.status === 'published') {
      await tx.execute(
        sql`select pg_advisory_xact_lock_shared(${SEARCH_PROJECTION_ADVISORY_LOCK_KEY})`,
      );
      await tx.insert(schema.searchProjectionOutbox).values({
        entityKind: 'project',
        entityId: image.projectId,
        operation: 'index',
        sourceUpdatedAt: now,
      });
    }
    return true;
  });
}

/** Resolve explicit IDs, or all ready image IDs for a confirmed operational backfill. */
export async function listReadyImageIds(imageIds?: readonly string[]): Promise<string[]> {
  if (imageIds?.length === 0) return [];

  const ready = eq(schema.projectImage.status, 'ready');
  const filter = imageIds ? and(ready, inArray(schema.projectImage.id, [...imageIds])) : ready;
  const rows = await db
    .select({ id: schema.projectImage.id })
    .from(schema.projectImage)
    .where(filter);
  return rows.map((row) => row.id);
}

export async function markFailed(imageId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const now = new Date();
    const [image] = await tx
      .update(schema.projectImage)
      .set({
        status: 'failed',
        duplicateOfImageId: null,
        duplicateDistance: null,
        duplicateCheckedAt: null,
        updatedAt: now,
      })
      .where(and(eq(schema.projectImage.id, imageId), eq(schema.projectImage.status, 'processing')))
      .returning({ id: schema.projectImage.id, projectId: schema.projectImage.projectId });

    if (!image) return;
    const [project] = await tx
      .select({
        id: schema.project.id,
        designerId: schema.project.designerId,
        status: schema.project.status,
      })
      .from(schema.project)
      .where(eq(schema.project.id, image.projectId))
      .for('update')
      .limit(1);
    if (!project) return;

    const failureMetadata = {
      mediaProcessingFailure: {
        imageId: image.id,
        reason:
          'Image processing failed after submission. Please replace or remove the failed image before resubmitting.',
        recordedAt: now.toISOString(),
      },
    };

    const transitioned = await tx
      .update(schema.project)
      .set({
        status: 'changes_requested',
        submittedAt: null,
        publishedAt: null,
        metadata: sql`coalesce(${schema.project.metadata}, '{}'::jsonb) || ${JSON.stringify(failureMetadata)}::jsonb`,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.project.id, image.projectId),
          or(
            eq(schema.project.status, 'submitted'),
            eq(schema.project.status, 'in_review'),
            eq(schema.project.status, 'published'),
          ),
        ),
      )
      .returning({ id: schema.project.id });

    if (transitioned.length > 0 && project.status === 'published') {
      await tx
        .update(schema.designerProfile)
        .set({
          projectCount: sql`greatest(${schema.designerProfile.projectCount} - 1, 0)`,
          updatedAt: now,
        })
        .where(eq(schema.designerProfile.id, project.designerId));
      await tx.execute(
        sql`select pg_advisory_xact_lock_shared(${SEARCH_PROJECTION_ADVISORY_LOCK_KEY})`,
      );
      await tx.insert(schema.searchProjectionOutbox).values([
        {
          entityKind: 'project',
          entityId: project.id,
          operation: 'delete',
          sourceUpdatedAt: now,
        },
        {
          entityKind: 'designer',
          entityId: project.designerId,
          operation: 'index',
          sourceUpdatedAt: now,
        },
      ]);
    }
  });
}

/**
 * Ready, phash-bearing images in the same project — the dedup candidate set.
 * The (project_id) index serves this filter; the Hamming comparison itself is an
 * in-memory O(N) scan over the project's images, bounded by per-project image count.
 */
export async function findProjectPhashes(
  projectId: string,
  excludeImageId: string,
): Promise<PhashCandidate[]> {
  const rows = await db
    .select({ imageId: schema.projectImage.id, phash: schema.projectImage.phash })
    .from(schema.projectImage)
    .where(
      and(
        eq(schema.projectImage.projectId, projectId),
        eq(schema.projectImage.status, 'ready'),
        isNotNull(schema.projectImage.phash),
        ne(schema.projectImage.id, excludeImageId),
      ),
    );

  // Skip malformed hashes so one bad row can't make hammingDistance throw and fail every later upload.
  return rows.flatMap((r) =>
    r.phash && r.phash.length === PHASH_HEX_LEN ? [{ imageId: r.imageId, phash: r.phash }] : [],
  );
}

export type UncheckedDuplicateImage = {
  id: string;
  projectId: string;
  phash: string;
  createdAt: Date;
};

export async function listUncheckedDuplicateImages(
  limit: number,
): Promise<UncheckedDuplicateImage[]> {
  const rows = await db
    .select({
      id: schema.projectImage.id,
      projectId: schema.projectImage.projectId,
      phash: schema.projectImage.phash,
      createdAt: schema.projectImage.createdAt,
    })
    .from(schema.projectImage)
    .where(
      and(
        eq(schema.projectImage.status, 'ready'),
        isNotNull(schema.projectImage.phash),
        sql`${schema.projectImage.duplicateCheckedAt} is null`,
      ),
    )
    .orderBy(
      asc(schema.projectImage.projectId),
      asc(schema.projectImage.createdAt),
      asc(schema.projectImage.id),
    )
    .limit(limit);

  return rows.flatMap((row) => (row.phash ? [{ ...row, phash: row.phash }] : []));
}

export async function findPriorProjectPhashes(
  image: UncheckedDuplicateImage,
): Promise<PhashCandidate[]> {
  const rows = await db
    .select({ imageId: schema.projectImage.id, phash: schema.projectImage.phash })
    .from(schema.projectImage)
    .where(
      and(
        eq(schema.projectImage.projectId, image.projectId),
        eq(schema.projectImage.status, 'ready'),
        isNotNull(schema.projectImage.phash),
        sql`(${schema.projectImage.createdAt}, ${schema.projectImage.id}) < (${image.createdAt}, ${image.id})`,
      ),
    );
  return rows.flatMap((row) =>
    row.phash && row.phash.length === PHASH_HEX_LEN
      ? [{ imageId: row.imageId, phash: row.phash }]
      : [],
  );
}

export async function markDuplicateChecked(
  imageId: string,
  duplicate: { imageId: string; distance: number } | null,
): Promise<boolean> {
  const rows = await db
    .update(schema.projectImage)
    .set({
      duplicateOfImageId: duplicate?.imageId ?? null,
      duplicateDistance: duplicate?.distance ?? null,
      duplicateCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.projectImage.id, imageId),
        eq(schema.projectImage.status, 'ready'),
        sql`${schema.projectImage.duplicateCheckedAt} is null`,
      ),
    )
    .returning({ id: schema.projectImage.id });
  return rows.length > 0;
}
