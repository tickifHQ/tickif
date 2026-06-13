import { db, schema, eq, and } from '@repo/db';
import type { PhashCandidate } from './phash.js';

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
