# Moderation reasons and cover submission

E-254 stores multiple reason categories for both request changes and rejection.
Reviewers must choose at least one of the eight shared categories and provide an
actionable note. Duplicate and unknown categories are rejected by the contract.
The designer feedback views use the same category labels and explanatory copy.

## Existing data

Migration 0062 adds enum-array reporting columns to projects and moderation events.
Known legacy codes map to their matching category. Unknown codes and note-only
rejections or change requests map to `other`. Original scalar codes and notes
remain unchanged in storage to preserve the audit trail. Read responses retain a
normalized single-code compatibility field alongside the new category array.

Cover image IDs remain nullable for drafts and existing content. No existing
project is changed or unpublished by this migration. A read-only staging admin
API audit on 7 September 2026 found no submitted or in-review projects and one
published project, which had a cover. This is staging evidence only, not a
production-wide database audit.

## Submission

The existing upload flow chooses the first available image when no explicit cover
is selected. It now displays and saves that same choice before checking server
readiness. The checklist includes cover selection.

Submission checks the cover inside the transaction that checks image counts and
changes the project status. The image must belong to the project, have a room,
and satisfy the existing ready or fresh-processing eligibility policy. A missing
or invalid cover returns `cover-image` in the missing requirements. Image and room
deletion, image linking, and media metadata updates lock and recheck the project
status so stale writes cannot detach the selected cover after submission. Draft
updates also check the editable status atomically. Submission rechecks required
project fields from its locked snapshot before recording the transition.
