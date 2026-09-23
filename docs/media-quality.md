# Public image quality

Public cards use the medium derivative (1024px) when available, with larger and
smaller fallbacks for older records. Full galleries and the designer image viewer
prefer the xlarge derivative (2560px), then large (1600px). Sharp never enlarges
the original, so a low-resolution or out-of-focus upload cannot be made sharp
by this pipeline.

New uploads produce both WebP and AVIF variants at the updated encoding quality.
The worker writes derivatives one at a time to avoid retaining every high-density
buffer in memory. Existing ready images retain their old variants until queued
for reprocessing. The source original must still exist for that operation.

Before reprocessing existing images in an environment:

1. Deploy the new worker and API together.
2. Set `WATERMARK_REVISION` to the revision shipped with the code (`wm-v4`) in that environment.
   This prevents immutable caches from continuing to serve old encoded bytes.
3. Queue ready images in a controlled batch using
   `pnpm --filter @repo/worker media:reprocess -- <image-id>`, or use
   `pnpm --filter @repo/worker media:reprocess -- --all --confirm` only after
   checking storage and worker capacity.
4. Run `pnpm --filter @repo/worker search:reindex` so existing search hits
   switch from their previously indexed small derivative to the medium card derivative.

The UI falls back to the largest older derivative while reprocessing and indexing
are pending. Check a representative portrait, landscape, and low-resolution
original at mobile and desktop sizes after the rollout.
