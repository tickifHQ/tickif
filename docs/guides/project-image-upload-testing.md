# Project image upload manual checks (E-373)

Use the local stack from [getting started](./getting-started.md), including
configured private storage and a running media worker. Sign in as a designer
with project-write access. Use distinct JPEG/PNG photographs to avoid duplicate
rejection. Run `pnpm dev` and open the web app at `http://localhost:3000`.

1. Open a new project at `/designer/projects/upload`, fill required project
   details, expand Project Images, and scroll to a room upload area.
2. Select several photos. Confirm tiles appear immediately with Queued,
   Uploading (with a measured percentage), then Processing states. The first
   draft creation should add `projectId` to the URL without jumping to the top,
   collapsing the room, losing files, or flashing the editor.
3. While later photos upload, open an earlier photo preview. Confirm the viewer
   opens and the underlying tiles retain their positions. When a worker finishes
   a photo, its Ready status and public preview should appear without Save or
   reload, even if other photos remain Processing.
4. In browser developer tools, use network throttling so the project image-list
   request takes longer than four seconds. Inspect requests to
   `/api/projects/{id}/images`: timer ticks must not start another processing
   poll while the previous image-list/completeness poll is pending. Allow the
   response to finish; any Ready photo in it must update immediately instead of
   staying Processing. Initial-load and explicit edit requests are separate
   from periodic processing polls.
5. With at least one Processing photo, temporarily block the image-list request.
   Confirm a refresh error appears. Unblock it and allow the next poll to finish;
   Ready/Failed statuses must update automatically. The polling loop must recover
   after failure rather than remaining locked.
6. Interrupt one storage PUT, then restore connectivity. Confirm that photo
   shows a failure and Retry action, sibling uploads continue, and Retry reuses
   the selected file. Check that already-ready photos stay visible.
7. Repeat with an existing draft and at a mobile viewport. Reload after uploads
   settle to confirm persisted room assignments, photo order and status.

The latest main already contains local previews, stable tile keys, scroll-safe
draft creation, measured transfer progress and reduced AVIF encoding effort.
This follow-up prevents overlapping processing polls from discarding slow status
responses. Worker latency and visual quality still require real-storage checks;
see [ADR 0009](../adr/0009-media-encoding-effort.md) for pending staging acceptance.
