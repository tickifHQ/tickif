# Media pipeline

## Authorization boundary

Media operations use live organization capability and selected-branch checks in
`apps/api/src/modules/media/service.ts`. A designer must select the project's
organization and team and have `WRITE_PROJECTS`; superadmin retains its explicit
bypass. Do not infer access from the historical owner-only boundary in ADR 0002.
See [authentication](./auth.md), [branches](./branches.md) and
[ADR 0001](../adr/0001-rbac-role-and-org-model.md) for the related access model.

## How an upload flows (the media slice)

Image bytes never pass through the API — the client uploads straight to R2:

```
Web app
   │  POST /api/media/upload-url  { projectId, contentType, size }
   ▼
media/service.ts → @repo/storage.presignUpload   creates a 'processing' row,
   │                                              returns a presigned PUT URL
   │                                              (content-type + length pinned)
   ▼
Client PUT bytes ───────────────────────────────────────────────►  R2 (originals/, private)
   │
   │  POST /api/media/{imageId}/commit
   ▼
media/service.ts → @repo/queue.enqueueMedia      HEAD-checks the object exists,
   │  (jobId = media-{imageId})                   then enqueues; returns 202
   ▼
apps/worker  media-process.ts                    download → validate → pHash dedup →
   │                                              strip EXIF + derive watermarked
   │                                              webp/avif → write derivatives →
   ▼                                              compare-and-swap status to 'ready'
R2 (derivatives/, public)  +  project_image row updated
```

Permanent failures (oversize/invalid/duplicate) flip the row to `failed` and delete
the orphan original; transient errors retry via BullMQ. See
[ADR 0002](../adr/0002-media-pipeline.md).

## Public image quality and embedded identifiers

Public cards use the medium derivative (1024px) when available, with larger and
smaller fallbacks for older records. Full galleries and the designer image viewer
prefer the xlarge derivative (2560px), then large (1600px). Sharp never enlarges
the original, so a low-resolution or out-of-focus upload cannot be made sharp
by this pipeline.

Public derivatives carry the supplied Tickif SVG logo at top left and the logo
symbol at the center and bottom right, matching the
[Figma watermark reference](https://www.figma.com/design/WJhOguDptAwt2735BS2WMG/tickif--DS-?node-id=15817-7985).
The assets retain the design's translucency and shadows. `WATERMARK_OPACITY=1`
keeps those asset opacities; lower values fade the entire treatment.
`WATERMARK_SCALE=0.0432` sets the symbol width relative to the image width.
Marks remain bounded on small or extreme-aspect images. The worker bundles the
SVG assets and composites them into image bytes without a runtime font dependency.
The `wm-v6` revision gives this treatment new immutable URLs. Originals stay private
and unchanged; the embedded identifier below is independent of the visible marks.

New uploads produce both WebP and AVIF variants at the updated encoding quality.
The worker writes derivatives one at a time to avoid retaining every high-density
buffer in memory. Existing ready images retain their old variants until queued
for reprocessing. The source original must still exist for that operation.

Public derivatives also carry an embedded image token derived from the stored
image ID. The original stays untouched. Given a downloaded derivative and a
candidate image ID, run
`pnpm --filter @repo/worker media:identify -- <image-path> <image-id>` to
check for a match. Without an ID, the command prints the recovered token.
This is a best-effort identifier, not proof of ownership: cropping, resizing,
screenshots, and very small or flat images can remove or obscure it.
The pixel changes can introduce low-level visual texture in smooth image areas.
The `sig-v1` key suffix bypasses immutable caches for newly processed images.
Previously ready images need reprocessing before they gain the token.

For retries, derivative regeneration and rollout checks, use the
[media runbook](../runbooks/media-pipeline.md). The original architectural decision
is recorded in [ADR 0002](../adr/0002-media-pipeline.md).
