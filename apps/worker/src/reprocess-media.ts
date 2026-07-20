import { closeQueues, enqueueMedia } from '@repo/queue';
import { listReadyImageIds } from './media/repository.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function usage(): string {
  return [
    'Usage:',
    '  pnpm --filter @repo/worker media:reprocess -- <image-id> [image-id...]',
    '  pnpm --filter @repo/worker media:reprocess -- --all --confirm',
  ].join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const confirmed = args.includes('--confirm');
  const imageIds = args.filter((arg) => !arg.startsWith('--'));

  // A typo like --comfirm must fail loudly, not be silently discarded.
  const knownFlags = new Set(['--all', '--confirm']);
  const unknownFlags = args.filter((arg) => arg.startsWith('--') && !knownFlags.has(arg));
  if (unknownFlags.length > 0) {
    throw new Error(`Unknown flag(s): ${unknownFlags.join(', ')}\n${usage()}`);
  }

  if (all && (!confirmed || imageIds.length > 0)) {
    throw new Error(`Reprocessing all ready images requires exactly --all --confirm.\n${usage()}`);
  }
  if (!all && imageIds.length === 0) throw new Error(usage());

  const invalidIds = imageIds.filter((imageId) => !UUID_PATTERN.test(imageId));
  if (invalidIds.length > 0) throw new Error(`Invalid image UUID(s): ${invalidIds.join(', ')}`);

  const readyIds = await listReadyImageIds(all ? undefined : imageIds);
  if (!all) {
    const readySet = new Set(readyIds);
    const unavailable = imageIds.filter((imageId) => !readySet.has(imageId));
    if (unavailable.length > 0) {
      throw new Error(`Image(s) not found or not ready: ${unavailable.join(', ')}`);
    }
  }

  for (const imageId of readyIds) {
    await enqueueMedia({ imageId, mode: 'reprocess' });
  }
  console.log(`[worker] queued ${readyIds.length} ready image(s) for derivative reprocessing`);
}

main()
  .then(async () => {
    await closeQueues();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('[worker] media reprocessing failed:', error);
    await closeQueues().catch(() => undefined);
    process.exit(1);
  });
