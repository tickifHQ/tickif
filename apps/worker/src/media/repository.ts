import { db, schema, eq, and, ne, isNotNull } from '@repo/db';
import { PHASH_HEX_LEN, type PhashCandidate } from './phash.js';

export type ProcessingImage = {
  id: string;
  projectId: string;
  originalKey: string;
  contentType: string;
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

/** Compare-and-swap: only the run that still owns `processing` flips to ready. Returns false if it lost the race. */
export async function markReady(
  imageId: string,
  data: {
    derivatives: schema.ProjectImageDerivative[];
    width: number;
    height: number;
    phash: string;
  },
): Promise<boolean> {
  const rows = await db
    .update(schema.projectImage)
    .set({ ...data, status: 'ready', updatedAt: new Date() })
    .where(and(eq(schema.projectImage.id, imageId), eq(schema.projectImage.status, 'processing')))
    .returning({ id: schema.projectImage.id });
  return rows.length > 0;
}

export async function markFailed(imageId: string): Promise<void> {
  await db
    .update(schema.projectImage)
    .set({ status: 'failed', updatedAt: new Date() })
    .where(and(eq(schema.projectImage.id, imageId), eq(schema.projectImage.status, 'processing')));
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
