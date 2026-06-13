import { db, schema, eq, and } from '@repo/db';
import type { PhashCandidate } from './phash.js';

export type ProcessingImage = {
  id: string;
  projectId: string;
  originalKey: string;
  contentType: string | null;
  status: (typeof schema.projectImageStatusEnum.enumValues)[number];
};

export async function getImageForProcessing(imageId: string): Promise<ProcessingImage | null> {
  const [row] = await db
    .select({
      id: schema.projectImage.id,
      projectId: schema.projectImage.projectId,
      originalKey: schema.projectImage.originalKey,
      contentType: schema.projectImage.contentType,
      status: schema.projectImage.status,
    })
    .from(schema.projectImage)
    .where(eq(schema.projectImage.id, imageId))
    .limit(1);
  return row ?? null;
}

export async function markReady(
  imageId: string,
  data: {
    derivatives: schema.ProjectImageDerivative[];
    width: number;
    height: number;
    phash: string;
  },
): Promise<void> {
  await db
    .update(schema.projectImage)
    .set({ ...data, status: 'ready', updatedAt: new Date() })
    .where(eq(schema.projectImage.id, imageId));
}

export async function markFailed(imageId: string): Promise<void> {
  await db
    .update(schema.projectImage)
    .set({ status: 'failed', updatedAt: new Date() })
    .where(eq(schema.projectImage.id, imageId));
}

/**
 * Ready images in the same project that already carry a phash — the bounded,
 * indexed candidate set for dedup (never a full-table Hamming scan). Excludes
 * the image being processed.
 */
export async function findProjectPhashes(
  projectId: string,
  excludeImageId: string,
): Promise<PhashCandidate[]> {
  const rows = await db
    .select({ imageId: schema.projectImage.id, phash: schema.projectImage.phash })
    .from(schema.projectImage)
    .where(
      and(eq(schema.projectImage.projectId, projectId), eq(schema.projectImage.status, 'ready')),
    );

  return rows.flatMap((r) =>
    r.phash && r.imageId !== excludeImageId ? [{ imageId: r.imageId, phash: r.phash }] : [],
  );
}
