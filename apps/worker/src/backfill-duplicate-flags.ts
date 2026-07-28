import { backfillDuplicateFlags } from './media/duplicate-backfill.js';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5_000;
const rawLimit = process.argv[2];
const limit = rawLimit === undefined ? DEFAULT_LIMIT : Number.parseInt(rawLimit, 10);

if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
  console.error(`Usage: pnpm --filter @repo/worker media:backfill-duplicates -- [1-${MAX_LIMIT}]`);
  process.exit(1);
}

try {
  const updated = await backfillDuplicateFlags(limit);
  console.log(`[worker] duplicate provenance backfilled for ${updated} image(s)`);
  if (updated === limit) {
    console.log('[worker] more unchecked images may remain; run the command again');
  }
  process.exit(0);
} catch (error) {
  console.error('[worker] duplicate provenance backfill failed:', error);
  process.exit(1);
}
