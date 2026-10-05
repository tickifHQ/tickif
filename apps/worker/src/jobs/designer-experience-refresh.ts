import { enqueueDesignerExperienceRefresh } from '@repo/queue';
import { deleteSearchDocument, upsertSearchDocument } from '@repo/search';
import { findDesignerSearchSource, listActiveDesignerIds } from '../search/repository.js';
import { mapDesignerSearchDocument } from '../search/mapper.js';
import { withSearchProjectionEntityLock } from '../search/outbox-repository.js';

const BATCH_SIZE = 100;

export async function sweepDesignerExperience(): Promise<void> {
  await enqueueDesignerExperienceRefresh(new Date().getUTCFullYear());
}

/** Refresh only designer documents: project documents do not contain experience. */
export async function refreshDesignerExperience(): Promise<{ refreshed: number }> {
  let afterId: string | null = null;
  let refreshed = 0;
  while (true) {
    const ids = await listActiveDesignerIds(afterId, BATCH_SIZE);
    for (const id of ids) {
      // Re-read under the normal projection lock so concurrent privacy/deletion
      // changes cannot resurrect stale documents or race the rebuild alias swap.
      await withSearchProjectionEntityLock('designer', id, async () => {
        const source = await findDesignerSearchSource(id);
        if (source) {
          await upsertSearchDocument('designers', mapDesignerSearchDocument(source));
        } else {
          await deleteSearchDocument('designers', id);
        }
      });
      refreshed += 1;
    }
    if (ids.length < BATCH_SIZE) return { refreshed };
    afterId = ids.at(-1)!;
  }
}
