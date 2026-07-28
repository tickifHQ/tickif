import { config } from '@repo/config';
import { findNearestDuplicate } from './phash.js';
import {
  findPriorProjectPhashes,
  listUncheckedDuplicateImages,
  markDuplicateChecked,
} from './repository.js';

export async function backfillDuplicateFlags(limit: number): Promise<number> {
  const images = await listUncheckedDuplicateImages(limit);
  let updated = 0;

  for (const image of images) {
    const candidates = await findPriorProjectPhashes(image);
    const duplicate = findNearestDuplicate(
      image.phash,
      candidates,
      config.MEDIA_DEDUP_HAMMING_THRESHOLD,
    );
    if (await markDuplicateChecked(image.id, duplicate)) updated += 1;
  }

  return updated;
}
