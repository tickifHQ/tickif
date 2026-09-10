# Published project edits

The `project` row and its live `project_room` / `project_image` memberships are the
public projection. They remain published while a material edit is reviewed.
`project_pending_version` has a project-ID primary key and holds at most one
editable aggregate. Approval replaces the public aggregate in one transaction;
rejection removes the pending aggregate without changing approved content.

Public project, image, discovery, recommendation and worker search reads use only
live rows. Internal project reads select pending content for the owning organization
or superadmin and include `pendingChanges`, `liveStatus` and the approved version.
Those properties are absent from public contracts and anonymous responses.
Public detail fields and worker project search documents use read-only repeatable-read
transactions, so an approval cannot mix old scalar values with the new gallery or tags.
Signed URLs and related-project recommendations are built after the detail transaction.

The shared `classifyProjectEdit` contract classifies description, image taxonomy,
room labels/order, image order and cover selection as minor. Identity/location,
property, scope, budget and completion-year changes are material. Added or removed
unique image IDs exceeding **20%** of the last approval's image IDs are material.
Exactly 20% is minor. Replacement contributes to both counts. The persisted approved
baseline prevents repeated autosaves from evading this threshold. Changing only the
completion month within the same year is minor.
Clearing or removing the cover remains pending until a ready replacement belongs
to a room in the editable version. Even a minor image removal cannot clear the live cover.

New uploads are hidden until ready and included in an editable version. Image and
room IDs remain stable. Removing an approved image from pending content preserves
the original live membership and storage references. Hidden physical rows remain
available to the organization retention inventory but cannot be selected as covers,
returned by public image IDs, or copied into a new project.
Duplicating a project with pending changes copies its approved scalar fields,
rooms, images and cover together under the canonical project lock. Pending edits
remain only on the original project's review version.

Every mutation locks the canonical project row before reading pending state. Submitted
and in-review versions are locked against designer writes. Admin corrections use the
pending revision for compare-and-swap and audit the pending before/after values.
Submission and approval evaluate the selected version's images and cover.

Pending edits and review transitions do not index. Approval writes one project index
event in the same transaction and preserves the original slug, publish date and
designer project count. Minor edits publish immediately and index their live changes.
A separate minor-only edit while pending changes are in draft or changes-requested
status updates the matching live fields and the pending version. Submitted and
in-review versions reject all designer edits. A mixed material edit stays pending in full.

Existing published projects already form their live version. Migration adds no pending
rows and backfills their approved image-ID baseline. Archive/delete explicitly cancel
pending review; organization retention visibility always takes precedence over it.
